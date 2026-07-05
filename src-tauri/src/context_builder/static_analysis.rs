use std::collections::{BTreeMap, VecDeque};
use std::sync::{Mutex, OnceLock};
use tree_sitter::{Language, Node, Parser};

use crate::utils::sha256_hex;

const STATIC_ANALYSIS_CACHE_CAPACITY: usize = 16;

#[derive(Clone, Default)]
pub(super) struct StaticAnalysis {
    pub(super) imports: Vec<SyntaxSnippet>,
    pub(super) definitions: Vec<Definition>,
    pub(super) calls: Vec<SyntaxSnippet>,
    pub(super) returns: Vec<SyntaxSnippet>,
    pub(super) module_assignments: Vec<SyntaxSnippet>,
    pub(super) entry_points: Vec<SyntaxSnippet>,
    pub(super) identifiers: BTreeMap<String, Vec<usize>>,
    pub(super) sql_statements: Vec<SyntaxSnippet>,
    pub(super) sql_ctes: Vec<SyntaxSnippet>,
    pub(super) sql_sources: Vec<SyntaxSnippet>,
    pub(super) sql_writes: Vec<SyntaxSnippet>,
    pub(super) sql_clauses: Vec<SyntaxSnippet>,
}

#[derive(Clone, Copy)]
enum AnalysisLanguage {
    JavaScript,
    Python,
    Sql,
}

#[derive(Default)]
struct StaticAnalysisCache {
    entries: VecDeque<(String, StaticAnalysis)>,
}

impl StaticAnalysisCache {
    fn get(&mut self, key: &str) -> Option<StaticAnalysis> {
        let position = self
            .entries
            .iter()
            .position(|(entry_key, _)| entry_key == key)?;
        let (entry_key, analysis) = self.entries.remove(position)?;
        let result = analysis.clone();
        self.entries.push_back((entry_key, analysis));
        Some(result)
    }

    fn insert(&mut self, key: String, analysis: StaticAnalysis) {
        if let Some(position) = self
            .entries
            .iter()
            .position(|(entry_key, _)| entry_key == &key)
        {
            self.entries.remove(position);
        }
        while self.entries.len() >= STATIC_ANALYSIS_CACHE_CAPACITY {
            self.entries.pop_front();
        }
        self.entries.push_back((key, analysis));
    }
}

static STATIC_ANALYSIS_CACHE: OnceLock<Mutex<StaticAnalysisCache>> = OnceLock::new();

#[derive(Clone)]
pub(super) struct SyntaxSnippet {
    pub(super) name: String,
    pub(super) start_line: usize,
    pub(super) end_line: usize,
    pub(super) code: String,
}

#[derive(Clone)]
pub(super) struct Definition {
    pub(super) name: String,
    pub(super) start_line: usize,
    pub(super) end_line: usize,
    pub(super) code: String,
    pub(super) is_parameter: bool,
}

fn parse_static_analysis(path: &str, language: &str, code: &str) -> Result<StaticAnalysis, String> {
    let (grammar, analysis_language): (Language, AnalysisLanguage) = match file_extension(path) {
        Some("tsx") => (
            tree_sitter_typescript::LANGUAGE_TSX.into(),
            AnalysisLanguage::JavaScript,
        ),
        _ => match language {
            "javascript" => (
                tree_sitter_javascript::LANGUAGE.into(),
                AnalysisLanguage::JavaScript,
            ),
            "python" => (
                tree_sitter_python::LANGUAGE.into(),
                AnalysisLanguage::Python,
            ),
            "sql" => (tree_sitter_sequel::LANGUAGE.into(), AnalysisLanguage::Sql),
            "typescript" => (
                tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
                AnalysisLanguage::JavaScript,
            ),
            _ => return Err(format!("Unsupported Context Builder language: {language}")),
        },
    };
    let mut parser = Parser::new();
    parser
        .set_language(&grammar)
        .map_err(|error| format!("Context Builder failed to load grammar: {error}"))?;
    let tree = parser
        .parse(code, None)
        .ok_or_else(|| "Context Builder could not parse this file.".to_string())?;
    let mut analysis = StaticAnalysis::default();
    collect_static_analysis(tree.root_node(), code, analysis_language, &mut analysis);
    Ok(analysis)
}

pub(super) fn cached_static_analysis(
    path: &str,
    language: &str,
    code: &str,
) -> Result<StaticAnalysis, String> {
    let cache_key = sha256_hex(&format!("{path}:{language}:{}", sha256_hex(code)));
    let cache = STATIC_ANALYSIS_CACHE.get_or_init(|| Mutex::new(StaticAnalysisCache::default()));

    if let Ok(mut cache) = cache.lock() {
        if let Some(analysis) = cache.get(&cache_key) {
            return Ok(analysis);
        }
    }

    let analysis = parse_static_analysis(path, language, code)?;
    if let Ok(mut cache) = cache.lock() {
        cache.insert(cache_key, analysis.clone());
    }
    Ok(analysis)
}

fn collect_static_analysis(
    node: Node<'_>,
    code: &str,
    language: AnalysisLanguage,
    analysis: &mut StaticAnalysis,
) {
    match language {
        AnalysisLanguage::JavaScript => collect_javascript_static_analysis(node, code, analysis),
        AnalysisLanguage::Python => collect_python_static_analysis(node, code, analysis),
        AnalysisLanguage::Sql => collect_sql_static_analysis(node, code, analysis),
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.is_named() {
            collect_static_analysis(child, code, language, analysis);
        }
    }
}

fn collect_javascript_static_analysis(node: Node<'_>, code: &str, analysis: &mut StaticAnalysis) {
    match node.kind() {
        "import_statement" => analysis.imports.push(syntax_snippet(node, code, "")),
        "variable_declarator" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                for name in identifier_names(name_node, code) {
                    let snippet_node = node
                        .parent()
                        .filter(|parent| parent.kind() == "lexical_declaration")
                        .unwrap_or(node);
                    let snippet = syntax_snippet(snippet_node, code, &name);
                    analysis.definitions.push(Definition {
                        name,
                        start_line: snippet.start_line,
                        end_line: snippet.end_line,
                        code: snippet.code,
                        is_parameter: false,
                    });
                }
            }
        }
        "required_parameter" | "optional_parameter" => {
            if let Some(pattern) = node
                .child_by_field_name("pattern")
                .or_else(|| node.child_by_field_name("name"))
            {
                for name in identifier_names(pattern, code) {
                    let snippet = syntax_snippet(node, code, &name);
                    analysis.definitions.push(Definition {
                        name,
                        start_line: snippet.start_line,
                        end_line: snippet.end_line,
                        code: snippet.code,
                        is_parameter: true,
                    });
                }
            }
        }
        "identifier" | "shorthand_property_identifier_pattern" => {
            let name = node_text(node, code).trim();
            if !name.is_empty() {
                analysis
                    .identifiers
                    .entry(name.to_string())
                    .or_default()
                    .push(node.start_position().row + 1);
            }
        }
        "call_expression" => {
            if let Some(function) = node.child_by_field_name("function") {
                let name = call_name(node_text(function, code));
                analysis.calls.push(syntax_snippet(node, code, &name));
            }
        }
        "return_statement" => analysis.returns.push(syntax_snippet(node, code, "return")),
        _ => {}
    }
}

fn collect_python_static_analysis(node: Node<'_>, code: &str, analysis: &mut StaticAnalysis) {
    match node.kind() {
        "import_statement" | "import_from_statement" => {
            analysis.imports.push(syntax_snippet(node, code, ""))
        }
        "function_definition" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = node_text(name_node, code).trim();
                if !name.is_empty() {
                    analysis.definitions.push(Definition {
                        name: name.to_string(),
                        start_line: node.start_position().row + 1,
                        end_line: node.end_position().row + 1,
                        code: function_signature(node, code),
                        is_parameter: false,
                    });
                }
            }
            if let Some(parameters) = node.child_by_field_name("parameters") {
                for name in python_parameter_names(parameters, code) {
                    analysis.definitions.push(Definition {
                        name,
                        start_line: parameters.start_position().row + 1,
                        end_line: parameters.end_position().row + 1,
                        code: node_text(parameters, code).trim().to_string(),
                        is_parameter: true,
                    });
                }
            }
        }
        "class_definition" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = node_text(name_node, code).trim();
                if !name.is_empty() {
                    analysis.definitions.push(Definition {
                        name: name.to_string(),
                        start_line: node.start_position().row + 1,
                        end_line: node.end_position().row + 1,
                        code: function_signature(node, code),
                        is_parameter: false,
                    });
                }
            }
        }
        "assignment" => {
            if let Some(left) = node.child_by_field_name("left") {
                let names = python_binding_names(left, code);
                let snippet = syntax_snippet(node, code, &names.join(", "));
                for name in names {
                    analysis.definitions.push(Definition {
                        name,
                        start_line: snippet.start_line,
                        end_line: snippet.end_line,
                        code: snippet.code.clone(),
                        is_parameter: false,
                    });
                }
                if is_python_module_scope(node) && !snippet.name.is_empty() {
                    analysis.module_assignments.push(snippet);
                }
            }
        }
        "named_expression" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = node_text(name_node, code).trim();
                if !name.is_empty() {
                    let snippet = syntax_snippet(node, code, name);
                    analysis.definitions.push(Definition {
                        name: name.to_string(),
                        start_line: snippet.start_line,
                        end_line: snippet.end_line,
                        code: snippet.code,
                        is_parameter: false,
                    });
                }
            }
        }
        "for_statement" => {
            if let Some(left) = node.child_by_field_name("left") {
                let snippet = syntax_snippet(left, code, "");
                for name in python_binding_names(left, code) {
                    analysis.definitions.push(Definition {
                        name,
                        start_line: snippet.start_line,
                        end_line: snippet.end_line,
                        code: snippet.code.clone(),
                        is_parameter: false,
                    });
                }
            }
        }
        "identifier" => {
            let name = node_text(node, code).trim();
            if !name.is_empty() {
                analysis
                    .identifiers
                    .entry(name.to_string())
                    .or_default()
                    .push(node.start_position().row + 1);
            }
        }
        "call" => {
            if let Some(function) = node.child_by_field_name("function") {
                let name = call_name(node_text(function, code));
                analysis.calls.push(syntax_snippet(node, code, &name));
            }
        }
        "return_statement" => analysis.returns.push(syntax_snippet(node, code, "return")),
        "if_statement"
            if is_python_module_scope(node)
                && node
                    .child_by_field_name("condition")
                    .is_some_and(|condition| is_python_main_guard(node_text(condition, code))) =>
        {
            analysis
                .entry_points
                .push(syntax_snippet(node, code, "__main__"))
        }
        _ => {}
    }
}

fn collect_sql_static_analysis(node: Node<'_>, code: &str, analysis: &mut StaticAnalysis) {
    match node.kind() {
        "statement"
            if !node
                .parent()
                .is_some_and(|parent| matches!(parent.kind(), "cte" | "subquery")) =>
        {
            let operation = sql_operation_kind(node).unwrap_or("SQL");
            let snippet = syntax_snippet(node, code, &format!("{operation} statement"));
            if is_sql_write_operation(operation) {
                let target = sql_write_target(node, code).unwrap_or_else(|| operation.to_string());
                analysis.sql_writes.push(SyntaxSnippet {
                    name: target.clone(),
                    start_line: snippet.start_line,
                    end_line: snippet.end_line,
                    code: snippet.code.clone(),
                });
            }
            analysis.sql_statements.push(snippet);
        }
        "transaction" => analysis
            .sql_statements
            .push(syntax_snippet(node, code, "transaction")),
        "cte" => {
            let name = sql_cte_name(node, code).unwrap_or_else(|| "CTE".to_string());
            analysis.sql_ctes.push(syntax_snippet(node, code, &name));
        }
        "relation" if has_ancestor_kind(node, &["from", "join"]) => {
            let name = sql_relation_name(node, code);
            if !name.is_empty() {
                analysis.sql_sources.push(syntax_snippet(node, code, &name));
            }
        }
        "group_by" | "join" | "limit" | "order_by" | "returning" | "set_operation"
        | "when_clause" | "where" => {
            analysis
                .sql_clauses
                .push(syntax_snippet(node, code, node.kind()));
        }
        "invocation" => {
            let name = first_descendant_text(node, code, &["object_reference", "identifier"])
                .unwrap_or_default();
            analysis.calls.push(syntax_snippet(node, code, &name));
        }
        "identifier" => {
            let name = node_text(node, code).trim();
            if !name.is_empty() {
                analysis
                    .identifiers
                    .entry(name.to_string())
                    .or_default()
                    .push(node.start_position().row + 1);
            }
        }
        _ => {}
    }
}

fn sql_operation_kind(node: Node<'_>) -> Option<&'static str> {
    let operation = match node.kind() {
        "select" => Some("SELECT"),
        "insert" => Some("INSERT"),
        "update" => Some("UPDATE"),
        "delete" => Some("DELETE"),
        "create_table" => Some("CREATE TABLE"),
        "create_view" => Some("CREATE VIEW"),
        "create_materialized_view" => Some("CREATE MATERIALIZED VIEW"),
        "create_function" => Some("CREATE FUNCTION"),
        "alter_table" => Some("ALTER TABLE"),
        "drop_table" => Some("DROP TABLE"),
        "merge" => Some("MERGE"),
        _ => None,
    };
    if operation.is_some() {
        return operation;
    }

    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if child.kind() == "cte" {
            continue;
        }
        if let Some(operation) = sql_operation_kind(child) {
            return Some(operation);
        }
    }
    None
}

fn is_sql_write_operation(operation: &str) -> bool {
    matches!(
        operation,
        "INSERT"
            | "UPDATE"
            | "DELETE"
            | "CREATE TABLE"
            | "CREATE VIEW"
            | "CREATE MATERIALIZED VIEW"
            | "CREATE FUNCTION"
            | "ALTER TABLE"
            | "DROP TABLE"
            | "MERGE"
    )
}

fn sql_cte_name(node: Node<'_>, code: &str) -> Option<String> {
    let mut cursor = node.walk();
    let name = node
        .named_children(&mut cursor)
        .find(|child| child.kind() == "identifier")
        .map(|child| node_text(child, code).trim().to_string())
        .filter(|name| !name.is_empty());
    name
}

fn sql_write_target(node: Node<'_>, code: &str) -> Option<String> {
    let operation_kind = sql_operation_kind(node)?;
    let operation_node = find_descendant_kind(
        node,
        &[
            "insert",
            "update",
            "delete",
            "create_table",
            "create_view",
            "create_materialized_view",
            "create_function",
            "alter_table",
            "drop_table",
            "merge",
        ],
    )?;
    let preferred_kinds: &[&str] = if operation_kind == "DELETE" {
        &["relation", "object_reference", "identifier"]
    } else {
        &["object_reference", "relation", "identifier"]
    };
    first_descendant_text(operation_node, code, preferred_kinds)
        .or_else(|| first_descendant_text(node, code, preferred_kinds))
}

fn sql_relation_name(node: Node<'_>, code: &str) -> String {
    first_descendant_text(node, code, &["object_reference", "identifier"])
        .unwrap_or_else(|| node_text(node, code).trim().to_string())
}

fn find_descendant_kind<'tree>(node: Node<'tree>, kinds: &[&str]) -> Option<Node<'tree>> {
    if kinds.contains(&node.kind()) {
        return Some(node);
    }
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if child.kind() == "cte" {
            continue;
        }
        if let Some(found) = find_descendant_kind(child, kinds) {
            return Some(found);
        }
    }
    None
}

fn first_descendant_text(node: Node<'_>, code: &str, kinds: &[&str]) -> Option<String> {
    if kinds.contains(&node.kind()) {
        let text = node_text(node, code).trim();
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if let Some(text) = first_descendant_text(child, code, kinds) {
            return Some(text);
        }
    }
    None
}

fn has_ancestor_kind(node: Node<'_>, kinds: &[&str]) -> bool {
    let mut current = node.parent();
    while let Some(parent) = current {
        if kinds.contains(&parent.kind()) {
            return true;
        }
        if matches!(parent.kind(), "statement" | "cte" | "subquery") {
            return false;
        }
        current = parent.parent();
    }
    false
}

fn identifier_names(node: Node<'_>, code: &str) -> Vec<String> {
    let mut names = Vec::new();
    collect_identifier_names(node, code, &mut names);
    names.sort();
    names.dedup();
    names
}

fn collect_identifier_names(node: Node<'_>, code: &str, names: &mut Vec<String>) {
    if matches!(
        node.kind(),
        "identifier" | "shorthand_property_identifier_pattern"
    ) {
        let name = node_text(node, code).trim();
        if !name.is_empty() {
            names.push(name.to_string());
        }
        return;
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.is_named() {
            collect_identifier_names(child, code, names);
        }
    }
}

fn python_parameter_names(parameters: Node<'_>, code: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut cursor = parameters.walk();
    for child in parameters.named_children(&mut cursor) {
        names.extend(python_binding_names(child, code));
    }
    names.sort();
    names.dedup();
    names
}

fn python_binding_names(node: Node<'_>, code: &str) -> Vec<String> {
    let mut names = Vec::new();
    collect_python_binding_names(node, code, &mut names);
    names.sort();
    names.dedup();
    names
}

fn collect_python_binding_names(node: Node<'_>, code: &str, names: &mut Vec<String>) {
    match node.kind() {
        "identifier" => {
            let name = node_text(node, code).trim();
            if !name.is_empty() {
                names.push(name.to_string());
            }
        }
        "default_parameter" | "typed_default_parameter" => {
            if let Some(name) = node.child_by_field_name("name") {
                collect_python_binding_names(name, code, names);
            }
        }
        "typed_parameter" => {
            let type_id = node.child_by_field_name("type").map(|child| child.id());
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                if Some(child.id()) != type_id {
                    collect_python_binding_names(child, code, names);
                }
            }
        }
        "dictionary_splat_pattern"
        | "list_pattern"
        | "list_splat_pattern"
        | "parameter"
        | "pattern_list"
        | "tuple_pattern" => {
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                collect_python_binding_names(child, code, names);
            }
        }
        _ => {}
    }
}

fn is_python_module_scope(node: Node<'_>) -> bool {
    let mut current = node.parent();
    while let Some(parent) = current {
        match parent.kind() {
            "module" => return true,
            "class_definition" | "function_definition" | "lambda" => return false,
            _ => current = parent.parent(),
        }
    }
    false
}

fn is_python_main_guard(condition: &str) -> bool {
    condition.contains("__name__") && condition.contains("__main__") && condition.contains("==")
}

fn function_signature(node: Node<'_>, code: &str) -> String {
    node_text(node, code)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("")
        .to_string()
}

fn syntax_snippet(node: Node<'_>, code: &str, name: &str) -> SyntaxSnippet {
    SyntaxSnippet {
        name: name.to_string(),
        start_line: node.start_position().row + 1,
        end_line: node.end_position().row + 1,
        code: node_text(node, code).trim().to_string(),
    }
}

fn file_extension(path: &str) -> Option<&str> {
    path.rsplit_once('.').map(|(_, extension)| extension)
}

fn call_name(function_text: &str) -> String {
    function_text
        .trim()
        .rsplit(['.', '?'])
        .find(|part| !part.is_empty())
        .unwrap_or(function_text)
        .trim()
        .to_string()
}

fn node_text<'a>(node: Node<'_>, code: &'a str) -> &'a str {
    node.utf8_text(code.as_bytes()).unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_analysis_cache_is_bounded_and_promotes_hits() {
        let mut cache = StaticAnalysisCache::default();
        for index in 0..STATIC_ANALYSIS_CACHE_CAPACITY {
            cache.insert(format!("key-{index}"), StaticAnalysis::default());
        }

        assert!(cache.get("key-0").is_some());
        cache.insert("key-new".to_string(), StaticAnalysis::default());

        assert!(cache.get("key-0").is_some());
        assert!(cache.get("key-1").is_none());
        assert_eq!(cache.entries.len(), STATIC_ANALYSIS_CACHE_CAPACITY);
    }
}
