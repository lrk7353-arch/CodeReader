#![cfg_attr(test, allow(dead_code))]

use serde::Serialize;
use std::path::{Path, PathBuf};
use tree_sitter::{Language, Node, Parser};
use walkdir::{DirEntry, WalkDir};

use crate::utils::sha256_hex;

const PROJECT_SCAN_MAX_DEPTH: usize = 8;
const PROJECT_SCAN_MAX_ENTRIES: usize = 10_000;
const MAX_PREVIEW_BYTES: u64 = 2 * 1024 * 1024;
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
const TEXT_EXTENSIONS: &[&str] = &[
    "bat",
    "bash",
    "c",
    "cfg",
    "cmd",
    "conf",
    "cpp",
    "cs",
    "css",
    "env",
    "fish",
    "go",
    "h",
    "hpp",
    "htm",
    "html",
    "ini",
    "java",
    "json",
    "jsonc",
    "kt",
    "kts",
    "less",
    "lock",
    "log",
    "markdown",
    "md",
    "mdx",
    "php",
    "properties",
    "ps1",
    "py",
    "rb",
    "rs",
    "scss",
    "sh",
    "sql",
    "svelte",
    "swift",
    "toml",
    "txt",
    "vue",
    "xml",
    "yaml",
    "yml",
    "zsh",
];
const TEXT_FILE_NAMES: &[&str] = &[
    ".dockerignore",
    ".editorconfig",
    ".env",
    ".eslintignore",
    ".eslintrc",
    ".gitattributes",
    ".gitignore",
    ".npmrc",
    ".prettierignore",
    ".prettierrc",
    "changelog",
    "dockerfile",
    "license",
    "makefile",
    "readme",
];
const BINARY_EXTENSIONS: &[&str] = &[
    "7z", "a", "avi", "bmp", "class", "dll", "dylib", "eot", "exe", "gif", "gz", "ico", "jar",
    "jpeg", "jpg", "lockb", "mov", "mp3", "mp4", "o", "obj", "otf", "pdf", "png", "so", "tar",
    "ttf", "wasm", "webm", "webp", "woff", "woff2", "zip",
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
    capability: FileCapabilityPayload,
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
    nodes: Vec<ProjectTreeNodePayload>,
    truncated: bool,
    skipped_entries: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFilePayload {
    id: String,
    name: String,
    path: String,
    relative_path: String,
    language: String,
    capability: FileCapabilityPayload,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTreeNodePayload {
    id: String,
    parent_id: Option<String>,
    name: String,
    path: String,
    relative_path: String,
    kind: String,
    capability: Option<FileCapabilityPayload>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileCapabilityPayload {
    preview_kind: String,
    can_preview: bool,
    can_explain: bool,
    language: String,
    reason: Option<String>,
    size_bytes: u64,
}

#[cfg_attr(not(test), tauri::command)]
pub fn load_code_file(path: String) -> Result<CodeFilePayload, String> {
    let path = canonicalize_input_path(&path, "file path")?;
    if !path.is_file() {
        return Err("The selected path is not a readable file.".to_string());
    }
    load_file_payload(path, None)
}

#[cfg_attr(not(test), tauri::command)]
pub fn load_project_code_file(
    path: String,
    project_root: String,
) -> Result<CodeFilePayload, String> {
    let project_root = canonicalize_input_path(&project_root, "project root")?;
    if !project_root.is_dir() {
        return Err("The selected project root is not a readable folder.".to_string());
    }

    let path = canonicalize_input_path(&path, "file path")?;
    if !path.is_file() {
        return Err("The selected path is not a readable file.".to_string());
    }
    if !path.starts_with(&project_root) {
        return Err("The selected file is outside the active project root.".to_string());
    }

    load_file_payload(path, Some(&project_root))
}

#[cfg_attr(not(test), tauri::command)]
pub fn scan_project(path: String) -> Result<ProjectScanPayload, String> {
    let root = canonicalize_input_path(&path, "project path")?;
    if !root.is_dir() {
        return Err("The selected path is not a project folder.".to_string());
    }

    let mut files = Vec::new();
    let mut nodes = Vec::new();
    let mut truncated = false;
    let mut skipped_entries = 0;
    for entry in WalkDir::new(&root)
        .max_depth(PROJECT_SCAN_MAX_DEPTH)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !is_ignored_entry(entry))
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                skipped_entries += 1;
                continue;
            }
        };
        if entry.depth() == 0 {
            continue;
        }
        if nodes.len() >= PROJECT_SCAN_MAX_ENTRIES {
            truncated = true;
            break;
        }

        let path = entry.path();
        let relative_path = relative_path(path, &root);
        if entry.file_type().is_dir() {
            if entry.depth() == PROJECT_SCAN_MAX_DEPTH
                && std::fs::read_dir(path)
                    .ok()
                    .and_then(|mut entries| entries.next())
                    .is_some()
            {
                truncated = true;
            }
            nodes.push(ProjectTreeNodePayload {
                id: directory_id(path),
                parent_id: parent_node_id(path, &root),
                name: file_name(path),
                path: display_path(path),
                relative_path,
                kind: "directory".to_string(),
                capability: None,
            });
            continue;
        }

        let size_bytes = entry.metadata().map(|metadata| metadata.len()).unwrap_or(0);
        let capability = classify_file(path, size_bytes, entry.file_type().is_symlink());
        let file = ProjectFilePayload {
            id: file_id(path),
            name: file_name(path),
            path: display_path(path),
            relative_path: relative_path.clone(),
            language: capability.language.clone(),
            capability: capability.clone(),
        };
        nodes.push(ProjectTreeNodePayload {
            id: file.id.clone(),
            parent_id: parent_node_id(path, &root),
            name: file.name.clone(),
            path: file.path.clone(),
            relative_path,
            kind: "file".to_string(),
            capability: Some(capability),
        });
        files.push(file);
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    nodes.sort_by(|left, right| {
        left.relative_path
            .cmp(&right.relative_path)
            .then(left.kind.cmp(&right.kind))
    });

    Ok(ProjectScanPayload {
        root_path: display_path(&root),
        files,
        nodes,
        truncated,
        skipped_entries,
    })
}

fn load_file_payload(
    path: PathBuf,
    project_root: Option<&Path>,
) -> Result<CodeFilePayload, String> {
    let metadata = std::fs::metadata(&path)
        .map_err(|error| format!("Failed to inspect file metadata: {error}"))?;
    let capability = classify_file(&path, metadata.len(), false);
    if !capability.can_preview {
        return Err(capability
            .reason
            .clone()
            .unwrap_or_else(|| "This file cannot be previewed.".to_string()));
    }
    let code = std::fs::read_to_string(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::InvalidData {
            "This file is not valid UTF-8 text and cannot be previewed safely.".to_string()
        } else {
            format!("Failed to read file: {error}")
        }
    })?;

    let code_language = language_for_path(&path);
    Ok(file_payload(
        path,
        project_root,
        code_language,
        capability,
        code,
    ))
}

fn file_payload(
    path: PathBuf,
    project_root: Option<&Path>,
    code_language: Option<CodeLanguage>,
    capability: FileCapabilityPayload,
    code: String,
) -> CodeFilePayload {
    let file_hash = sha256_hex(&code);
    let parse_result = code_language
        .map(|language| parse_code_nodes(&path, language, &code, &file_hash))
        .unwrap_or(ParseResult {
            nodes: Vec::new(),
            has_error: false,
        });
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
        language: capability.language.clone(),
        code,
        snapshot_id: format!("snapshot:{}", &file_hash[..16]),
        file_hash,
        code_nodes: parse_result.nodes,
        parse_error: parse_result.has_error,
        capability,
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

fn code_node_payload(node: Node<'_>, code: &str, path: &Path, node_type: &str) -> CodeNodePayload {
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
        "catch_clause" | "do_statement" | "for_in_statement" | "for_of_statement"
        | "for_statement" | "if_statement" | "switch_statement" | "try_statement"
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
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "js" => Some(CodeLanguage::JavaScript),
        "jsx" => Some(CodeLanguage::Jsx),
        "ts" => Some(CodeLanguage::TypeScript),
        "tsx" => Some(CodeLanguage::Tsx),
        _ => None,
    }
}

fn classify_file(path: &Path, size_bytes: u64, is_symlink: bool) -> FileCapabilityPayload {
    if is_symlink {
        return unavailable_capability(
            size_bytes,
            "Symbolic links are visible but are not followed or previewed.".to_string(),
        );
    }
    if size_bytes > MAX_PREVIEW_BYTES {
        return unavailable_capability(
            size_bytes,
            format!(
                "The file is too large to preview safely (limit: {} MB).",
                MAX_PREVIEW_BYTES / 1024 / 1024
            ),
        );
    }
    if let Some(language) = language_for_path(path) {
        return FileCapabilityPayload {
            preview_kind: "code".to_string(),
            can_preview: true,
            can_explain: true,
            language: language.monaco_language().to_string(),
            reason: None,
            size_bytes,
        };
    }

    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if BINARY_EXTENSIONS.contains(&extension.as_str()) {
        return unavailable_capability(
            size_bytes,
            "This appears to be a binary file and cannot be shown as text.".to_string(),
        );
    }
    if TEXT_EXTENSIONS.contains(&extension.as_str()) || is_known_text_name(path) {
        return FileCapabilityPayload {
            preview_kind: "text".to_string(),
            can_preview: true,
            can_explain: false,
            language: preview_language(path),
            reason: Some(
                "Read-only preview is available, but structured code explanation is not supported."
                    .to_string(),
            ),
            size_bytes,
        };
    }

    unavailable_capability(
        size_bytes,
        "This file type is visible in the project tree but is not supported for preview."
            .to_string(),
    )
}

fn unavailable_capability(size_bytes: u64, reason: String) -> FileCapabilityPayload {
    FileCapabilityPayload {
        preview_kind: "unavailable".to_string(),
        can_preview: false,
        can_explain: false,
        language: "plaintext".to_string(),
        reason: Some(reason),
        size_bytes,
    }
}

fn is_known_text_name(path: &Path) -> bool {
    let lower_name = file_name(path).to_ascii_lowercase();
    TEXT_FILE_NAMES.iter().any(|name| lower_name == *name)
        || lower_name.starts_with(".env.")
        || ["changelog.", "dockerfile.", "license.", "readme."]
            .iter()
            .any(|prefix| lower_name.starts_with(prefix))
}

fn preview_language(path: &Path) -> String {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "bash" | "fish" | "sh" | "zsh" => "shell",
        "c" | "h" => "c",
        "cpp" | "hpp" => "cpp",
        "css" | "less" | "scss" => "css",
        "htm" | "html" => "html",
        "java" => "java",
        "json" | "jsonc" => "json",
        "markdown" | "md" | "mdx" => "markdown",
        "py" => "python",
        "rb" => "ruby",
        "rs" => "rust",
        "sql" => "sql",
        "xml" => "xml",
        "yaml" | "yml" => "yaml",
        _ => "plaintext",
    }
    .to_string()
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

fn canonicalize_input_path(input: &str, label: &str) -> Result<PathBuf, String> {
    let direct_path = PathBuf::from(input);
    let direct_error = match std::fs::canonicalize(&direct_path) {
        Ok(path) => return Ok(path),
        Err(error) => error,
    };

    if let Some(mapped_path) = mapped_wsl_workspace_path(input) {
        if let Ok(path) = std::fs::canonicalize(mapped_path) {
            return Ok(path);
        }
    }

    Err(format!("Failed to resolve {label}: {direct_error}"))
}

fn mapped_wsl_workspace_path(input: &str) -> Option<PathBuf> {
    let wsl_root = normalize_wsl_absolute_path(&std::env::var("CODEREADER_WSL_ROOT").ok()?)?;
    let input_wsl_path = input_to_wsl_path(input)?;
    let relative_path = wsl_workspace_relative_path(&input_wsl_path, &wsl_root)?;
    let windows_root = PathBuf::from(std::env::var_os("CODEREADER_WINDOWS_ROOT")?);

    Some(windows_root.join(relative_path))
}

fn input_to_wsl_path(input: &str) -> Option<String> {
    let normalized = input.replace('\\', "/");
    let lower = normalized.to_ascii_lowercase();
    for prefix in ["//wsl.localhost/", "//wsl$/"] {
        if !lower.starts_with(prefix) {
            continue;
        }

        let without_prefix = &normalized[prefix.len()..];
        let (_distro, distro_path) = without_prefix.split_once('/')?;
        return normalize_wsl_absolute_path(&format!("/{distro_path}"));
    }

    if normalized.starts_with('/') {
        return normalize_wsl_absolute_path(&normalized);
    }

    None
}

fn normalize_wsl_absolute_path(input: &str) -> Option<String> {
    let normalized = input.replace('\\', "/");
    let trimmed = normalized.trim();
    if !trimmed.starts_with('/') || trimmed.starts_with("//") {
        return None;
    }

    let path = trimmed.trim_end_matches('/');
    Some(if path.is_empty() {
        "/".to_string()
    } else {
        path.to_string()
    })
}

fn wsl_workspace_relative_path(input_wsl_path: &str, wsl_root: &str) -> Option<PathBuf> {
    let input_wsl_path = normalize_wsl_absolute_path(input_wsl_path)?;
    let wsl_root = normalize_wsl_absolute_path(wsl_root)?;

    if input_wsl_path == wsl_root {
        return Some(PathBuf::new());
    }

    let root_prefix = format!("{wsl_root}/");
    if !input_wsl_path.starts_with(&root_prefix) {
        return None;
    }

    Some(slash_path_to_path_buf(&input_wsl_path[root_prefix.len()..]))
}

fn slash_path_to_path_buf(path: &str) -> PathBuf {
    path.split('/')
        .filter(|part| !part.is_empty())
        .fold(PathBuf::new(), |mut buffer, part| {
            buffer.push(part);
            buffer
        })
}

fn file_id(path: &Path) -> String {
    let hash = sha256_hex(&display_path(path));
    format!("file:{}", &hash[..20])
}

fn project_id(root: &Path) -> String {
    let hash = sha256_hex(&display_path(root));
    format!("project:{}", &hash[..20])
}

fn directory_id(path: &Path) -> String {
    let hash = sha256_hex(&display_path(path));
    format!("directory:{}", &hash[..20])
}

fn parent_node_id(path: &Path, root: &Path) -> Option<String> {
    let parent = path.parent()?;
    (parent != root).then(|| directory_id(parent))
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| display_path(path))
}

fn display_path(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if let Some(unc_path) = normalized.strip_prefix("//?/UNC/") {
        return format!("//{unc_path}");
    }
    normalized
        .strip_prefix("//?/")
        .unwrap_or(&normalized)
        .to_string()
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
        let path = PathBuf::from("examples/small/login-controller.ts");
        let payload = file_payload(
            path.clone(),
            None,
            Some(CodeLanguage::TypeScript),
            classify_file(&path, code.len() as u64, false),
            code,
        );

        assert!(!payload.parse_error);
        assert!(payload
            .code_nodes
            .iter()
            .any(|node| node.node_type == "file"));
        assert!(payload
            .code_nodes
            .iter()
            .any(|node| node.node_type == "import"));
        assert!(payload
            .code_nodes
            .iter()
            .any(|node| node.node_type == "export"));
        assert!(payload
            .code_nodes
            .iter()
            .any(|node| node.node_type == "function" && node.name == "loginUser"));
        assert!(payload
            .code_nodes
            .iter()
            .any(|node| node.node_type == "block"));
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

        assert!(
            scan.files
                .iter()
                .any(|file| file.relative_path == "small/login-controller.ts"),
            "scanned paths: {scanned_paths:?}"
        );
        assert!(
            scan.files
                .iter()
                .any(|file| file.relative_path == "small/user-store.ts"),
            "scanned paths: {scanned_paths:?}"
        );
        assert!(scan
            .files
            .iter()
            .filter(|file| file.capability.can_explain)
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
        std::fs::write(
            root.join("src/visible.ts"),
            "export const visible = true;\n",
        )
        .expect("write visible file");

        std::fs::create_dir_all(root.join("node_modules_backup/pkg")).expect("create ignored dir");
        std::fs::write(
            root.join("node_modules_backup/pkg/hidden.ts"),
            "export const hidden = true;\n",
        )
        .expect("write ignored file");

        let deep_dir = root.join("l1/l2/l3/l4/l5/l6/l7/l8/l9");
        std::fs::create_dir_all(&deep_dir).expect("create deep dir");
        std::fs::write(
            deep_dir.join("too-deep.ts"),
            "export const tooDeep = true;\n",
        )
        .expect("write deep file");

        let scan = scan_project(display_path(&root)).expect("temp project should scan");
        let scanned_paths: Vec<&str> = scan
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();

        assert!(scanned_paths.contains(&"src/visible.ts"));
        assert!(
            !scanned_paths
                .iter()
                .any(|path| path.contains("node_modules")),
            "scanned paths: {scanned_paths:?}"
        );
        assert!(
            !scanned_paths
                .iter()
                .any(|path| path.contains("too-deep.ts")),
            "scanned paths: {scanned_paths:?}"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn scan_project_returns_stable_hierarchy_and_file_capabilities() {
        let root = temp_project_path("hierarchy");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("src/admin")).expect("create admin dir");
        std::fs::create_dir_all(root.join("src/public")).expect("create public dir");
        std::fs::write(root.join("README.md"), "# Demo\n").expect("write readme");
        std::fs::write(root.join("package.json"), "{\"name\":\"demo\"}\n")
            .expect("write package file");
        std::fs::write(
            root.join("src/admin/index.ts"),
            "export const admin = true;\n",
        )
        .expect("write admin file");
        std::fs::write(
            root.join("src/public/index.ts"),
            "export const publicValue = true;\n",
        )
        .expect("write public file");
        std::fs::write(root.join("logo.png"), [0_u8, 1, 2, 3]).expect("write binary file");

        let scan = scan_project(display_path(&root)).expect("project should scan");
        let src = scan
            .nodes
            .iter()
            .find(|node| node.relative_path == "src")
            .expect("src directory should exist");
        let admin = scan
            .nodes
            .iter()
            .find(|node| node.relative_path == "src/admin")
            .expect("admin directory should exist");
        let admin_index = scan
            .nodes
            .iter()
            .find(|node| node.relative_path == "src/admin/index.ts")
            .expect("admin index should exist");
        let public_index = scan
            .nodes
            .iter()
            .find(|node| node.relative_path == "src/public/index.ts")
            .expect("public index should exist");
        let readme = scan
            .files
            .iter()
            .find(|file| file.relative_path == "README.md")
            .expect("readme should exist");
        let binary = scan
            .files
            .iter()
            .find(|file| file.relative_path == "logo.png")
            .expect("binary should remain visible");

        assert_eq!(src.kind, "directory");
        assert_eq!(admin.parent_id.as_deref(), Some(src.id.as_str()));
        assert_eq!(admin_index.parent_id.as_deref(), Some(admin.id.as_str()));
        assert_ne!(admin_index.id, public_index.id);
        assert_eq!(readme.capability.preview_kind, "text");
        assert!(readme.capability.can_preview);
        assert!(!readme.capability.can_explain);
        assert_eq!(binary.capability.preview_kind, "unavailable");
        assert!(!binary.capability.can_preview);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn loads_text_preview_without_tree_sitter_nodes() {
        let root = temp_project_path("text-preview");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("create project root");
        let readme = root.join("README.md");
        std::fs::write(&readme, "# CodeReader\n\nProject notes.\n").expect("write readme");

        let payload = load_project_code_file(display_path(&readme), display_path(&root))
            .expect("text preview should load");

        assert_eq!(payload.language, "markdown");
        assert!(payload.capability.can_preview);
        assert!(!payload.capability.can_explain);
        assert!(payload.code_nodes.is_empty());
        assert!(!payload.parse_error);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_binary_large_and_symlink_preview_capabilities() {
        let binary = classify_file(Path::new("image.png"), 512, false);
        let large = classify_file(Path::new("README.md"), MAX_PREVIEW_BYTES + 1, false);
        let symlink = classify_file(Path::new("linked.ts"), 32, true);

        assert_eq!(binary.preview_kind, "unavailable");
        assert!(!binary.can_preview);
        assert!(!large.can_preview);
        assert!(large
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("too large")));
        assert!(!symlink.can_preview);
        assert!(symlink
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("Symbolic")));
    }

    #[test]
    fn converts_wsl_unc_paths_to_wsl_absolute_paths() {
        assert_eq!(
            input_to_wsl_path(r"\\wsl.localhost\Ubuntu\home\konglingrui\CodeReader\src\app.tsx")
                .as_deref(),
            Some("/home/konglingrui/CodeReader/src/app.tsx")
        );
        assert_eq!(
            input_to_wsl_path("//wsl$/Ubuntu/home/konglingrui/CodeReader").as_deref(),
            Some("/home/konglingrui/CodeReader")
        );
    }

    #[test]
    fn hides_windows_extended_unc_prefix_in_display_paths() {
        assert_eq!(
            display_path(Path::new(
                r"\\?\UNC\wsl.localhost\Ubuntu\home\konglingrui\CodeReader"
            )),
            "//wsl.localhost/Ubuntu/home/konglingrui/CodeReader"
        );
    }

    #[test]
    fn derives_relative_paths_inside_wsl_workspace_root() {
        let relative = wsl_workspace_relative_path(
            "/home/konglingrui/CodeReader/src/app.tsx",
            "/home/konglingrui/CodeReader",
        )
        .expect("path should be inside workspace root");

        assert_eq!(relative, PathBuf::from("src").join("app.tsx"));
        assert!(wsl_workspace_relative_path(
            "/home/konglingrui/OtherProject/src/app.tsx",
            "/home/konglingrui/CodeReader"
        )
        .is_none());
    }

    fn temp_project_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "codereader-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ))
    }
}
