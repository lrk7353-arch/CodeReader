#![cfg_attr(test, allow(dead_code))]

use serde::Serialize;
use similar::{DiffTag, TextDiff};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SnapshotNode {
    pub(crate) id: String,
    pub(crate) node_type: String,
    pub(crate) name: String,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
    pub(crate) code_hash: String,
    pub(crate) anchor_text: String,
}

#[derive(Clone, Debug)]
pub(crate) struct ExplanationAnchor {
    pub(crate) id: String,
    pub(crate) status: String,
    pub(crate) target_type: String,
    pub(crate) start_line: Option<usize>,
    pub(crate) end_line: Option<usize>,
    pub(crate) code_hash: Option<String>,
    pub(crate) anchor_text: Option<String>,
    pub(crate) code_node_id: Option<String>,
    pub(crate) depends_on_lines: Vec<usize>,
    pub(crate) affects_lines: Vec<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ExplanationMigration {
    pub(crate) explanation_id: String,
    pub(crate) status: String,
    pub(crate) code_node_id: Option<String>,
    pub(crate) start_line: Option<usize>,
    pub(crate) end_line: Option<usize>,
    pub(crate) code_hash: Option<String>,
    pub(crate) anchor_text: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChangeCounts {
    pub(crate) added_lines: usize,
    pub(crate) modified_lines: usize,
    pub(crate) deleted_lines: usize,
    pub(crate) added_nodes: usize,
    pub(crate) modified_nodes: usize,
    pub(crate) deleted_nodes: usize,
}

#[derive(Clone, Debug)]
pub(crate) struct ChangeDetectionResult {
    pub(crate) counts: ChangeCounts,
    pub(crate) migrations: Vec<ExplanationMigration>,
    pub(crate) covered_new_node_ids: HashSet<String>,
    pub(crate) affected_explanation_ids: Vec<String>,
    pub(crate) summary: String,
}

pub(crate) fn detect_changes(
    old_code: &str,
    new_code: &str,
    old_nodes: &[SnapshotNode],
    new_nodes: &[SnapshotNode],
    explanations: &[ExplanationAnchor],
) -> ChangeDetectionResult {
    let line_changes = line_changes(old_code, new_code);
    let node_matches = match_nodes(old_nodes, new_nodes);
    let old_nodes_by_id: HashMap<&str, &SnapshotNode> = old_nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();
    let new_nodes_by_id: HashMap<&str, &SnapshotNode> = new_nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();

    let mut migrations = Vec::with_capacity(explanations.len());
    let mut covered_new_node_ids = HashSet::new();
    let mut affected_explanation_ids = Vec::new();

    for explanation in explanations {
        let migration = migrate_explanation(
            explanation,
            old_code,
            new_code,
            &line_changes,
            &node_matches,
            &old_nodes_by_id,
            &new_nodes_by_id,
        );
        if let Some(node_id) = migration.code_node_id.as_ref() {
            covered_new_node_ids.insert(node_id.clone());
        }
        if migration.status != "valid" {
            affected_explanation_ids.push(explanation.id.clone());
        }
        migrations.push(migration);
    }
    affected_explanation_ids.extend(
        node_matches
            .added_new_ids
            .iter()
            .map(|node_id| format!("exp:{node_id}")),
    );
    affected_explanation_ids.sort();
    affected_explanation_ids.dedup();

    let counts = ChangeCounts {
        added_lines: line_changes.added_lines,
        modified_lines: line_changes.modified_lines,
        deleted_lines: line_changes.deleted_lines,
        added_nodes: node_matches.added_new_ids.len(),
        modified_nodes: node_matches.modified_pairs.len(),
        deleted_nodes: node_matches.deleted_old_ids.len(),
    };
    let summary = build_summary(&counts, affected_explanation_ids.len());

    ChangeDetectionResult {
        counts,
        migrations,
        covered_new_node_ids,
        affected_explanation_ids,
        summary,
    }
}

#[derive(Default)]
struct LineChanges {
    added_lines: usize,
    modified_lines: usize,
    deleted_lines: usize,
    changed_old_lines: HashSet<usize>,
}

fn line_changes(old_code: &str, new_code: &str) -> LineChanges {
    let diff = TextDiff::from_lines(old_code, new_code);
    let mut result = LineChanges::default();

    for operation in diff.ops() {
        let old_range = operation.old_range();
        let new_range = operation.new_range();
        match operation.tag() {
            DiffTag::Equal => {}
            DiffTag::Delete => {
                result.deleted_lines += old_range.len();
                add_one_based_range(&mut result.changed_old_lines, old_range);
            }
            DiffTag::Insert => {
                result.added_lines += new_range.len();
            }
            DiffTag::Replace => {
                let modified = old_range.len().min(new_range.len());
                result.modified_lines += modified;
                result.deleted_lines += old_range.len().saturating_sub(modified);
                result.added_lines += new_range.len().saturating_sub(modified);
                add_one_based_range(&mut result.changed_old_lines, old_range);
            }
        }
    }

    result
}

fn add_one_based_range(lines: &mut HashSet<usize>, range: std::ops::Range<usize>) {
    lines.extend(range.map(|line| line + 1));
}

#[derive(Default)]
struct NodeMatches {
    exact_pairs: HashMap<String, String>,
    modified_pairs: HashMap<String, String>,
    added_new_ids: HashSet<String>,
    deleted_old_ids: HashSet<String>,
}

fn match_nodes(old_nodes: &[SnapshotNode], new_nodes: &[SnapshotNode]) -> NodeMatches {
    let mut result = NodeMatches::default();
    let mut used_new_ids = HashSet::new();

    for old in old_nodes {
        let exact = new_nodes
            .iter()
            .filter(|new| !used_new_ids.contains(&new.id))
            .filter(|new| new.node_type == old.node_type && new.code_hash == old.code_hash)
            .min_by_key(|new| line_distance(old.start_line, new.start_line));
        if let Some(new) = exact {
            result.exact_pairs.insert(old.id.clone(), new.id.clone());
            used_new_ids.insert(new.id.clone());
        }
    }

    for old in old_nodes {
        if result.exact_pairs.contains_key(&old.id) {
            continue;
        }
        let modified = new_nodes
            .iter()
            .filter(|new| !used_new_ids.contains(&new.id))
            .filter(|new| {
                new.node_type == old.node_type
                    && ((!old.name.is_empty() && new.name == old.name)
                        || (!old.anchor_text.is_empty() && new.anchor_text == old.anchor_text))
            })
            .min_by_key(|new| line_distance(old.start_line, new.start_line));
        if let Some(new) = modified {
            result.modified_pairs.insert(old.id.clone(), new.id.clone());
            used_new_ids.insert(new.id.clone());
        }
    }

    result.added_new_ids = new_nodes
        .iter()
        .filter(|node| !used_new_ids.contains(&node.id))
        .map(|node| node.id.clone())
        .collect();
    result.deleted_old_ids = old_nodes
        .iter()
        .filter(|node| {
            !result.exact_pairs.contains_key(&node.id)
                && !result.modified_pairs.contains_key(&node.id)
        })
        .map(|node| node.id.clone())
        .collect();
    result
}

fn migrate_explanation(
    explanation: &ExplanationAnchor,
    old_code: &str,
    new_code: &str,
    line_changes: &LineChanges,
    node_matches: &NodeMatches,
    old_nodes: &HashMap<&str, &SnapshotNode>,
    new_nodes: &HashMap<&str, &SnapshotNode>,
) -> ExplanationMigration {
    if explanation.target_type == "file" {
        let file_node = new_nodes
            .values()
            .find(|node| node.node_type == "file")
            .copied();
        return migration_for_node(explanation, file_node, "invalid");
    }

    if let Some(old_node_id) = explanation.code_node_id.as_deref() {
        if let Some(new_node_id) = node_matches.exact_pairs.get(old_node_id) {
            let status = if explanation.status == "new_unexplained" {
                "new_unexplained"
            } else if explanation.status == "invalid" {
                "invalid"
            } else if explanation.status == "stale"
                || related_lines_changed(explanation, line_changes)
            {
                "stale"
            } else {
                "valid"
            };
            return migration_for_node(
                explanation,
                new_nodes.get(new_node_id.as_str()).copied(),
                status,
            );
        }
        if let Some(new_node_id) = node_matches.modified_pairs.get(old_node_id) {
            let status = if explanation.status == "new_unexplained" {
                "new_unexplained"
            } else {
                "invalid"
            };
            return migration_for_node(
                explanation,
                new_nodes.get(new_node_id.as_str()).copied(),
                status,
            );
        }
        if old_nodes.contains_key(old_node_id) {
            return deleted_migration(explanation);
        }
    }

    if let Some((start_line, end_line)) = find_exact_range(explanation, old_code, new_code) {
        let status = if explanation.status == "new_unexplained" {
            "new_unexplained"
        } else if explanation.status == "invalid" {
            "invalid"
        } else if explanation.status == "stale" || related_lines_changed(explanation, line_changes)
        {
            "stale"
        } else {
            "valid"
        };
        return ExplanationMigration {
            explanation_id: explanation.id.clone(),
            status: status.to_string(),
            code_node_id: None,
            start_line: Some(start_line),
            end_line: Some(end_line),
            code_hash: explanation.code_hash.clone(),
            anchor_text: explanation.anchor_text.clone(),
        };
    }

    if explanation
        .start_line
        .is_some_and(|line| line <= new_code.lines().count().max(1))
    {
        return ExplanationMigration {
            explanation_id: explanation.id.clone(),
            status: "invalid".to_string(),
            code_node_id: None,
            start_line: explanation.start_line,
            end_line: explanation.end_line,
            code_hash: explanation.code_hash.clone(),
            anchor_text: explanation.anchor_text.clone(),
        };
    }

    deleted_migration(explanation)
}

fn migration_for_node(
    explanation: &ExplanationAnchor,
    node: Option<&SnapshotNode>,
    status: &str,
) -> ExplanationMigration {
    let Some(node) = node else {
        return deleted_migration(explanation);
    };
    ExplanationMigration {
        explanation_id: explanation.id.clone(),
        status: status.to_string(),
        code_node_id: Some(node.id.clone()),
        start_line: Some(node.start_line),
        end_line: Some(node.end_line),
        code_hash: Some(node.code_hash.clone()),
        anchor_text: Some(node.anchor_text.clone()),
    }
}

fn deleted_migration(explanation: &ExplanationAnchor) -> ExplanationMigration {
    ExplanationMigration {
        explanation_id: explanation.id.clone(),
        status: "deleted".to_string(),
        code_node_id: None,
        start_line: explanation.start_line,
        end_line: explanation.end_line,
        code_hash: explanation.code_hash.clone(),
        anchor_text: explanation.anchor_text.clone(),
    }
}

fn related_lines_changed(explanation: &ExplanationAnchor, changes: &LineChanges) -> bool {
    explanation
        .depends_on_lines
        .iter()
        .chain(&explanation.affects_lines)
        .any(|line| changes.changed_old_lines.contains(line))
}

fn find_exact_range(
    explanation: &ExplanationAnchor,
    old_code: &str,
    new_code: &str,
) -> Option<(usize, usize)> {
    let start_line = explanation.start_line?;
    let end_line = explanation.end_line.unwrap_or(start_line);
    let old_lines: Vec<&str> = old_code.lines().collect();
    if start_line == 0 || end_line < start_line || end_line > old_lines.len() {
        return None;
    }
    let needle = &old_lines[start_line - 1..end_line];
    if needle.is_empty() {
        return None;
    }
    let new_lines: Vec<&str> = new_code.lines().collect();
    let matches: Vec<usize> = new_lines
        .windows(needle.len())
        .enumerate()
        .filter_map(|(index, candidate)| (candidate == needle).then_some(index + 1))
        .collect();
    (matches.len() == 1).then(|| (matches[0], matches[0] + needle.len() - 1))
}

fn line_distance(left: usize, right: usize) -> usize {
    left.abs_diff(right)
}

fn build_summary(counts: &ChangeCounts, affected_explanations: usize) -> String {
    format!(
        "自上次阅读以来：新增 {} 行，修改 {} 行，删除 {} 行；新增 {} 个结构，修改 {} 个结构，删除 {} 个结构；{} 条解释需要关注。",
        counts.added_lines,
        counts.modified_lines,
        counts.deleted_lines,
        counts.added_nodes,
        counts.modified_nodes,
        counts.deleted_nodes,
        affected_explanations
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_added_lines_and_marks_new_nodes() {
        let old = "function login() {\n  return true;\n}\n";
        let new = "function login() {\n  const valid = true;\n  return valid;\n}\n";
        let old_node = node("old-login", "function", "login", 1, 3, "old-hash");
        let new_node = node("new-login", "function", "login", 1, 4, "new-hash");

        let result = detect_changes(
            old,
            new,
            &[old_node.clone()],
            &[new_node.clone()],
            &[explanation("exp-login", &old_node)],
        );

        assert_eq!(result.counts.added_lines, 1);
        assert_eq!(result.counts.modified_lines, 1);
        assert_eq!(result.migrations[0].status, "invalid");
        assert_eq!(
            result.migrations[0].code_node_id.as_deref(),
            Some("new-login")
        );
    }

    #[test]
    fn migrates_moved_function_without_expiring_it() {
        let old = "function login() {\n  return true;\n}\n";
        let new = "const version = 1;\n\nfunction login() {\n  return true;\n}\n";
        let old_node = node("old-login", "function", "login", 1, 3, "same-hash");
        let new_node = node("new-login", "function", "login", 3, 5, "same-hash");

        let result = detect_changes(
            old,
            new,
            &[old_node.clone()],
            &[new_node],
            &[explanation("exp-login", &old_node)],
        );

        assert_eq!(result.migrations[0].status, "valid");
        assert_eq!(result.migrations[0].start_line, Some(3));
        assert_eq!(
            result.migrations[0].code_node_id.as_deref(),
            Some("new-login")
        );
    }

    #[test]
    fn invalidates_modified_function() {
        let old = "function login() {\n  return true;\n}\n";
        let new = "function login() {\n  return false;\n}\n";
        let old_node = node("old-login", "function", "login", 1, 3, "old-hash");
        let new_node = node("new-login", "function", "login", 1, 3, "new-hash");

        let result = detect_changes(
            old,
            new,
            &[old_node.clone()],
            &[new_node],
            &[explanation("exp-login", &old_node)],
        );

        assert_eq!(result.counts.modified_nodes, 1);
        assert_eq!(result.migrations[0].status, "invalid");
    }

    #[test]
    fn marks_removed_function_deleted() {
        let old = "function login() {\n  return true;\n}\n";
        let new = "export const version = 1;\n";
        let old_node = node("old-login", "function", "login", 1, 3, "old-hash");

        let result = detect_changes(
            old,
            new,
            &[old_node.clone()],
            &[],
            &[explanation("exp-login", &old_node)],
        );

        assert_eq!(result.counts.deleted_nodes, 1);
        assert_eq!(result.migrations[0].status, "deleted");
        assert_eq!(result.migrations[0].code_node_id, None);
    }

    #[test]
    fn marks_explanation_stale_when_related_lines_change() {
        let old = "const source = true;\nfunction login() {\n  return source;\n}\n";
        let new = "const source = false;\nfunction login() {\n  return source;\n}\n";
        let old_node = node("old-login", "function", "login", 2, 4, "same-hash");
        let new_node = node("new-login", "function", "login", 2, 4, "same-hash");
        let mut anchored = explanation("exp-login", &old_node);
        anchored.depends_on_lines = vec![1];

        let result = detect_changes(old, new, &[old_node], &[new_node], &[anchored]);

        assert_eq!(result.migrations[0].status, "stale");
    }

    fn node(
        id: &str,
        node_type: &str,
        name: &str,
        start_line: usize,
        end_line: usize,
        code_hash: &str,
    ) -> SnapshotNode {
        SnapshotNode {
            id: id.to_string(),
            node_type: node_type.to_string(),
            name: name.to_string(),
            start_line,
            end_line,
            code_hash: code_hash.to_string(),
            anchor_text: format!("function {name}() {{"),
        }
    }

    fn explanation(id: &str, node: &SnapshotNode) -> ExplanationAnchor {
        ExplanationAnchor {
            id: id.to_string(),
            status: "valid".to_string(),
            target_type: node.node_type.clone(),
            start_line: Some(node.start_line),
            end_line: Some(node.end_line),
            code_hash: Some(node.code_hash.clone()),
            anchor_text: Some(node.anchor_text.clone()),
            code_node_id: Some(node.id.clone()),
            depends_on_lines: Vec::new(),
            affects_lines: Vec::new(),
        }
    }

    #[test]
    fn does_not_promote_unexplained_placeholder_during_migration() {
        let old = "function login() {\n  return true;\n}\n";
        let new = "const version = 1;\nfunction login() {\n  return true;\n}\n";
        let old_node = node("old-login", "function", "login", 1, 3, "same-hash");
        let new_node = node("new-login", "function", "login", 2, 4, "same-hash");
        let mut anchored = explanation("exp-login", &old_node);
        anchored.status = "new_unexplained".to_string();

        let result = detect_changes(old, new, &[old_node], &[new_node], &[anchored]);

        assert_eq!(result.migrations[0].status, "new_unexplained");
    }
}
