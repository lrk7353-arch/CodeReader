use serde::Serialize;

use crate::utils::sha256_hex;

use super::{CandidateSnippet, ContextSnippet};

pub(super) const DEFAULT_MAX_SNIPPETS: usize = 8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextBudgetResult {
    pub(crate) requested_max_chars: usize,
    pub(crate) effective_max_chars: usize,
    pub(crate) used_chars: usize,
    pub(crate) max_snippets: usize,
    pub(crate) omitted_snippets: usize,
    pub(crate) expanded_for_target: bool,
    pub(crate) truncated: bool,
}

pub(super) fn select_with_budget(
    file_path: &str,
    candidates: Vec<CandidateSnippet>,
    max_chars: usize,
    max_snippets: usize,
) -> (Vec<ContextSnippet>, usize, usize) {
    let mut snippets = Vec::new();
    let mut used_chars = 0;
    let mut omitted = 0;

    for (index, candidate) in candidates.into_iter().enumerate() {
        let candidate_chars = char_count(&candidate.code);
        let is_target = index == 0;
        if !is_target
            && (snippets.len() >= max_snippets || used_chars + candidate_chars > max_chars)
        {
            omitted += 1;
            continue;
        }

        let source_seed = format!(
            "{}:{}:{}:{}:{}",
            file_path, candidate.kind, candidate.start_line, candidate.end_line, candidate.code
        );
        let source_id = format!("source:{}", &sha256_hex(&source_seed)[..20]);
        snippets.push(ContextSnippet {
            source_id,
            kind: candidate.kind.to_string(),
            label: candidate.label,
            file_path: file_path.to_string(),
            start_line: candidate.start_line,
            end_line: candidate.end_line,
            code: candidate.code,
            reason: candidate.reason,
            is_summary: candidate.is_summary,
        });
        used_chars += candidate_chars;
    }

    (snippets, omitted, used_chars)
}

pub(super) fn default_max_chars(target_type: &str) -> usize {
    match target_type {
        "line" | "import" | "export" => 8_000,
        "range" | "block" => 10_000,
        "function" | "class" => 14_000,
        "statement" | "query" => 14_000,
        "file" => 10_000,
        _ => 8_000,
    }
}

pub(super) fn char_count(value: &str) -> usize {
    value.chars().count()
}
