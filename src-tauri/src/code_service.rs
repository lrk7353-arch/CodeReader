#![cfg_attr(test, allow(dead_code))]

use serde::Serialize;
use std::path::{Path, PathBuf};
use tree_sitter::{Language, Node, Parser};
use walkdir::{DirEntry, WalkDir};

use crate::utils::sha256_hex;

const PROJECT_SCAN_MAX_DEPTH: usize = 8;
const IGNORED_DIRS: &[&str] = &[
    ".cache",
    ".git",
    ".mypy_cache",
    ".next",
    ".nuxt",
    ".pytest_cache",
    ".ruff_cache",
    ".svelte-kit",
    ".vite",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "env",
    "node_modules",
    "target",
    "venv",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeFilePayload {
    id: String,
    name: String,
    path: String,
    project_id: String,
    project_root: String,
    relative_path: Option<String>,
    language: String,
    code: String,
    file_hash: String,
    snapshot_id: String,
    code_nodes: Vec<CodeNodePayload>,
    parse_error: bool,
    source: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodeNodePayload {
    id: String,
    file_path: String,
    node_type: String,
    name: String,
    start_line: usize,
    end_line: usize,
    symbol_id: Option<String>,
    code_hash: String,
    anchor_text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScanPayload {
    root_path: String,
    files: Vec<ProjectFilePayload>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFilePayload {
    id: String,
    name: String,
    path: String,
    relative_path: String,
    language: String,
}

#[cfg_attr(not(test), tauri::command)]
pub fn load_code_file(path: String) -> Result<CodeFilePayload, String> {
    let path = std::fs::canonicalize(PathBuf::from(path))
        .map_err(|error| format!("Failed to resolve file path: {error}"))?;
    if !path.is_file() {
        return Err("The selected path is not a readable file.".to_string());
    }

    let language = language_for_path(&path)
        .ok_or_else(|| "CodeReader MVP currently supports JS, JSX, TS, and TSX files.".to_string())?;
    let code = std::fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read file: {error}"))?;

    Ok(code_file_payload(path, None, language, code))
}

#[cfg_attr(not(test), tauri::command)]
pub fn load_project_code_file(path: String, project_root: String) -> Result<CodeFilePayload, String> {
    let project_root = std::fs::canonicalize(PathBuf::from(project_root))
        .map_err(|error| format!("Failed to resolve project root: {error}"))?;
    if !project_root.is_dir() {
        return Err("The selected project root is not a readable folder.".to_string());
    }

    let path = std::fs::canonicalize(PathBuf::from(path))
        .map_err(|error| format!("Failed to resolve file path: {error}"))?;
    if !path.is_file() {
        return Err("The selected path is not a readable file.".to_string());
    }
    if !path.starts_with(&project_root) {
        return Err("The selected file is outside the active project root.".to_string());
    }

    let language = language_for_path(&path)
        .ok_or_else(|| "CodeReader MVP currently supports JS, JSX, TS, and TSX files.".to_string())?;
    let code = std::fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read file: {error}"))?;

    Ok(code_file_payload(path, Some(&project_root), language, code))
}

#[cfg_attr(not(test), tauri::command)]
pub fn scan_project(path: String) -> Result<ProjectScanPayload, String> {
    let root = std::fs::canonicalize(PathBuf::from(path))
        .map_err(|error| format!("Failed to resolve project path: {error}"))?;
    if !root.is_dir() {
        return Err("The selected path is not a project folder.".to_string());
    }

    let mut files = Vec::new();
    for entry in WalkDir::new(&root)
        .max_depth(PROJECT_SCAN_MAX_DEPTH)
        .into_iter()
        .filter_entry(|entry| !is_ignored_entry(entry))
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(language) = language_for_path(path) else {
            continue;
        };
        let relative_path = relative_path(path, &root);
        files.push(ProjectFilePayload {
            id: file_id(path),
            name: file_name(path),
            path: display_path(path),
            relative_path,
            language: language.monaco_language().to_string(),
        });
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(ProjectScanPayload {
        root_path: display_path(&root),
        files,
    })
}

fn code_file_payload(
    path: PathBuf,
    project_root: Option<&Path>,
    language: CodeLanguage,
    code: String,
) -> CodeFilePayload {
    let file_hash = sha256_hex(&code);
    let parse_result = parse_code_nodes(&path, language, &code, &file_hash);
    let project_root_path = project_root
        .map(Path::to_path_buf)
        .or_else(|| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| path.clone());
    let project_root_display = display_path(&project_root_path);

    CodeFilePayload {
        id: file_id(&path),
        name: file_name(&path),
        path: display_path(&path),
        project_id: project_id(&project_root_path),
        project_root: project_root_display,
        relative_path: project_root.map(|root| relative_path(&path, root)),
        language: language.monaco_language().to_string(),
        code,
        snapshot_id: format!("snapshot:{}", &file_hash[..16]),
        file_hash,
        code_nodes: parse_result.nodes,
        parse_error: parse_result.has_error,
        source: "local".to_string(),
    }
}

struct ParseResult {
    nodes: Vec<CodeNodePayload>,
    has_error: bool,
}

fn parse_code_nodes(
    path: &Path,
    language: CodeLanguage,
    code: &str,
    file_hash: &str,
) -> ParseResult {
    let line_count = code.lines().count().max(1);
    let mut nodes = vec![CodeNodePayload {
        id: format!("target:{}:file", file_id(path)),
        file_path: display_path(path),
        node_type: "file".to_string(),
        name: file_name(path),
        start_line: 1,
        end_line: line_count,
        symbol_id: None,
        code_hash: file_hash.to_string(),
        anchor_text: first_non_empty_line(code),
    }];

    let mut parser = Parser::new();
    let grammar: Language = language.tree_sitter_language();
    if parser.set_language(&grammar).is_err() {
        return ParseResult {
            nodes,
            has_error: true,
        };
    }

    let Some(tree) = parser.parse(code, None) else {
        return ParseResult {
            nodes,
            has_error: true,
        };
    };

    let root = tree.root_node();
    collect_nodes(root, code, path, &mut nodes);
    nodes.sort_by(|left, right| {
        left.start_line
            .cmp(&right.start_line)
            .then(left.end_line.cmp(&right.end_line))
            .then(left.node_type.cmp(&right.node_type))
            .then(left.name.cmp(&right.name))
    });
    nodes.dedup_by(|left, right| {
        left.node_type == right.node_type
            && left.start_line == right.start_line
            && left.end_line == right.end_line
            && left.anchor_text == right.anchor_text
    });

    ParseResult {
        nodes,
        has_error: root.has_error(),
    }
}

fn collect_nodes(node: Node<'_>, code: &str, path: &Path, nodes: &mut Vec<CodeNodePayload>) {
    if let Some(node_type) = classify_node(node.kind()) {
        nodes.push(code_node_payload(node, code, path, node_type));
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.is_named() {
            collect_nodes(child, code, path, nodes);
        }
    }
}

fn code_node_payload(
    node: Node<'_>,
    code: &str,
    path: &Path,
    node_type: &str,
) -> CodeNodePayload {
    let node_text = node_text(node, code);
    let start_line = node.start_position().row + 1;
    let end_line = node.end_position().row + 1;
    let anchor_text = first_non_empty_line(node_text);
    let name = node_name(node, code, node_type, &anchor_text);
    let node_hash_seed = format!(
        "{}:{}:{}:{}:{}",
        display_path(path),
        node_type,
        start_line,
        end_line,
        anchor_text
    );
    let id_hash = sha256_hex(&node_hash_seed);
    let symbol_id = match node_type {
        "function" | "class" => Some(format!("{}:{}:{}", node_type, display_path(path), name)),
        "block" => Some(format!(
            "block:{}:{}-{}",
            display_path(path),
            start_line,
            end_line
        )),
        _ => None,
    };

    CodeNodePayload {
        id: format!("target:{}", &id_hash[..20]),
        file_path: display_path(path),
        node_type: node_type.to_string(),
        name,
        start_line,
        end_line,
        symbol_id,
        code_hash: sha256_hex(node_text),
        anchor_text,
    }
}

fn classify_node(kind: &str) -> Option<&'static str> {
    match kind {
        "import_statement" => Some("import"),
        "export_statement" => Some("export"),
        "class_declaration" => Some("class"),
        "function"
        | "function_declaration"
        | "generator_function_declaration"
        | "method_definition"
        | "arrow_function" => Some("function"),
        "catch_clause"
        | "do_statement"
        | "for_in_statement"
        | "for_of_statement"
        | "for_statement"
        | "if_statement"
        | "switch_statement"
        | "try_statement"
        | "while_statement" => Some("block"),
        _ => None,
    }
}

fn node_name(node: Node<'_>, code: &str, node_type: &str, anchor_text: &str) -> String {
    if let Some(name_node) = node.child_by_field_name("name") {
        let name = node_text(name_node, code).trim();
        if !name.is_empty() {
            return name.to_string();
        }
    }

    if node.kind() == "arrow_function" {
        if let Some(parent) = node.parent() {
            if let Some(name_node) = parent.child_by_field_name("name") {
                let name = node_text(name_node, code).trim();
                if !name.is_empty() {
                    return name.to_string();
                }
            }
        }
    }

    if node_type == "import" || node_type == "export" {
        return truncate(anchor_text, 80);
    }

    if node_type == "block" {
        return block_name(node.kind()).to_string();
    }

    truncate(anchor_text, 80)
}

fn block_name(kind: &str) -> &'static str {
    match kind {
        "catch_clause" => "catch",
        "do_statement" => "do",
        "for_in_statement" | "for_of_statement" | "for_statement" => "for",
        "if_statement" => "if",
        "switch_statement" => "switch",
        "try_statement" => "try",
        "while_statement" => "while",
        _ => "block",
    }
}

fn node_text<'a>(node: Node<'_>, code: &'a str) -> &'a str {
    node.utf8_text(code.as_bytes()).unwrap_or("")
}

#[derive(Clone, Copy)]
enum CodeLanguage {
    JavaScript,
    Jsx,
    TypeScript,
    Tsx,
}

impl CodeLanguage {
    fn monaco_language(self) -> &'static str {
        match self {
            CodeLanguage::JavaScript | CodeLanguage::Jsx => "javascript",
            CodeLanguage::TypeScript | CodeLanguage::Tsx => "typescript",
        }
    }

    fn tree_sitter_language(self) -> Language {
        match self {
            CodeLanguage::JavaScript | CodeLanguage::Jsx => tree_sitter_javascript::LANGUAGE.into(),
            CodeLanguage::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            CodeLanguage::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        }
    }
}

fn language_for_path(path: &Path) -> Option<CodeLanguage> {
    match path.extension()?.to_string_lossy().to_ascii_lowercase().as_str() {
        "js" => Some(CodeLanguage::JavaScript),
        "jsx" => Some(CodeLanguage::Jsx),
        "ts" => Some(CodeLanguage::TypeScript),
        "tsx" => Some(CodeLanguage::Tsx),
        _ => None,
    }
}

fn is_ignored_entry(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }
    let name = entry.file_name().to_string_lossy();
    let lower_name = name.to_ascii_lowercase();
    IGNORED_DIRS.iter().any(|ignored| lower_name == *ignored)
        || lower_name.starts_with("node_modules_")
        || lower_name.starts_with("node_modules-")
        || lower_name.starts_with("node_modules.")
}

fn file_id(path: &Path) -> String {
    let hash = sha256_hex(&display_path(path));
    format!("file:{}", &hash[..20])
}

fn project_id(root: &Path) -> String {
    let hash = sha256_hex(&display_path(root));
    format!("project:{}", &hash[..20])
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| display_path(path))
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn relative_path(path: &Path, root: &Path) -> String {
    path.strip_prefix(root)
        .map(display_path)
        .unwrap_or_else(|_| display_path(path))
}

fn first_non_empty_line(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| truncate(line, 160))
        .unwrap_or_default()
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut truncated: String = value.chars().take(max_chars).collect();
    truncated.push_str("...");
    truncated
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_typescript_structure_targets() {
        let code = include_str!("../../examples/small/login-controller.ts").to_string();
        let payload = code_file_payload(
            PathBuf::from("examples/small/login-controller.ts"),
            None,
            CodeLanguage::TypeScript,
            code,
        );

        assert!(!payload.parse_error);
        assert!(payload.code_nodes.iter().any(|node| node.node_type == "file"));
        assert!(payload.code_nodes.iter().any(|node| node.node_type == "import"));
        assert!(payload.code_nodes.iter().any(|node| node.node_type == "export"));
        assert!(payload
            .code_nodes
            .iter()
            .any(|node| node.node_type == "function" && node.name == "loginUser"));
        assert!(payload.code_nodes.iter().any(|node| node.node_type == "block"));
    }

    #[test]
    fn scans_project_code_files() {
        let examples_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../examples");
        let scan = scan_project(display_path(&examples_dir)).expect("examples project should scan");
        let scanned_paths: Vec<&str> = scan
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();

        assert!(scan
            .files
            .iter()
            .any(|file| file.relative_path == "small/login-controller.ts"), "scanned paths: {scanned_paths:?}");
        assert!(scan
            .files
            .iter()
            .any(|file| file.relative_path == "small/user-store.ts"), "scanned paths: {scanned_paths:?}");
        assert!(scan
            .files
            .iter()
            .all(|file| file.language == "typescript" || file.language == "javascript"));
    }

    #[test]
    fn scan_project_skips_ignored_and_overly_deep_dirs() {
        let root = std::env::temp_dir().join(format!(
            "codereader-scan-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&root);

        std::fs::create_dir_all(root.join("src")).expect("create source dir");
        std::fs::write(root.join("src/visible.ts"), "export const visible = true;\n")
            .expect("write visible file");

        std::fs::create_dir_all(root.join("node_modules_backup/pkg")).expect("create ignored dir");
        std::fs::write(
            root.join("node_modules_backup/pkg/hidden.ts"),
            "export const hidden = true;\n",
        )
        .expect("write ignored file");

        let deep_dir = root.join("l1/l2/l3/l4/l5/l6/l7/l8/l9");
        std::fs::create_dir_all(&deep_dir).expect("create deep dir");
        std::fs::write(deep_dir.join("too-deep.ts"), "export const tooDeep = true;\n")
            .expect("write deep file");

        let scan = scan_project(display_path(&root)).expect("temp project should scan");
        let scanned_paths: Vec<&str> = scan
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();

        assert!(scanned_paths.contains(&"src/visible.ts"));
        assert!(
            !scanned_paths.iter().any(|path| path.contains("node_modules")),
            "scanned paths: {scanned_paths:?}"
        );
        assert!(
            !scanned_paths.iter().any(|path| path.contains("too-deep.ts")),
            "scanned paths: {scanned_paths:?}"
        );

        let _ = std::fs::remove_dir_all(&root);
    }
}
