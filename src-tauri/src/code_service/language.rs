use std::path::Path;

use serde::Serialize;
use tree_sitter::Language;

use super::{file_name, MAX_PREVIEW_BYTES, TEXT_EXTENSIONS, TEXT_FILE_NAMES};

const BINARY_EXTENSIONS: &[&str] = &[
    "7z", "a", "avi", "bmp", "class", "dll", "dylib", "eot", "exe", "gif", "gz", "ico", "jar",
    "jpeg", "jpg", "lockb", "mov", "mp3", "mp4", "o", "obj", "otf", "pdf", "png", "so", "tar",
    "ttf", "wasm", "webm", "webp", "woff", "woff2", "zip",
];

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum CodeLanguage {
    JavaScript,
    Jsx,
    Python,
    Sql,
    TypeScript,
    Tsx,
}

impl CodeLanguage {
    pub(super) fn monaco_language(self) -> &'static str {
        match self {
            CodeLanguage::JavaScript | CodeLanguage::Jsx => "javascript",
            CodeLanguage::Python => "python",
            CodeLanguage::Sql => "sql",
            CodeLanguage::TypeScript | CodeLanguage::Tsx => "typescript",
        }
    }

    pub(super) fn tree_sitter_language(self) -> Language {
        match self {
            CodeLanguage::JavaScript | CodeLanguage::Jsx => tree_sitter_javascript::LANGUAGE.into(),
            CodeLanguage::Python => tree_sitter_python::LANGUAGE.into(),
            CodeLanguage::Sql => tree_sitter_sequel::LANGUAGE.into(),
            CodeLanguage::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            CodeLanguage::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct FileCapabilityPayload {
    pub(super) preview_kind: String,
    pub(super) can_preview: bool,
    pub(super) can_explain: bool,
    pub(super) language: String,
    pub(super) reason: Option<String>,
    pub(super) size_bytes: u64,
}

pub(super) fn language_for_path(path: &Path) -> Option<CodeLanguage> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "js" => Some(CodeLanguage::JavaScript),
        "jsx" => Some(CodeLanguage::Jsx),
        "py" => Some(CodeLanguage::Python),
        "sql" => Some(CodeLanguage::Sql),
        "ts" => Some(CodeLanguage::TypeScript),
        "tsx" => Some(CodeLanguage::Tsx),
        _ => None,
    }
}

pub(super) fn classify_file(
    path: &Path,
    size_bytes: u64,
    is_symlink: bool,
) -> FileCapabilityPayload {
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
