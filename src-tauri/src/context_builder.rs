#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};
use std::sync::{Mutex, OnceLock};
use tree_sitter::{Language, Node, Parser};

use crate::utils::sha256_hex;

const DEFAULT_MAX_SNIPPETS: usize = 8;
const NEIGHBORHOOD_RADIUS: usize = 3;
const STATIC_ANALYSIS_CACHE_CAPACITY: usize = 16;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildContextRequest {
    file: ContextFileInput,
    target: ContextTargetInput,
    budget: Option<ContextBudgetInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContextFileInput {
    path: String,
    language: String,
    code: String,
    #[serde(default)]
    code_nodes: Vec<ContextNodeInput>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ContextNodeInput {
    id: String,
    node_type: String,
    name: String,
    start_line: usize,
    end_line: usize,
    symbol_id: Option<String>,
    anchor_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContextTargetInput {
    target_type: String,
    target_name: Option<String>,
    start_line: Option<usize>,
    end_line: Option<usize>,
    symbol_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContextBudgetInput {
    max_chars: Option<usize>,
    max_snippets: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBundle {
    context_id: String,
    strategy: String,
    target: ContextTargetSummary,
    snippets: Vec<ContextSnippet>,
    signals: ContextSignals,
    sources: Vec<ContextSource>,
    budget: ContextBudgetResult,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextTargetSummary {
    target_type: String,
    target_name: String,
    file_path: String,
    start_line: usize,
    end_line: usize,
    symbol_id: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ContextSnippet {
    source_id: String,
    kind: String,
    label: String,
    file_path: String,
    start_line: usize,
    end_line: usize,
    code: String,
    reason: String,
    is_summary: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ContextSignals {
    referenced_identifiers: Vec<String>,
    defined_identifiers: Vec<String>,
    input_identifiers: Vec<String>,
    output_identifiers: Vec<String>,
    called_functions: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextSource {
    source_id: String,
    file_path: String,
    start_line: usize,
    end_line: usize,
    node_id: Option<String>,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextBudgetResult {
    requested_max_chars: usize,
    effective_max_chars: usize,
    used_chars: usize,
    max_snippets: usize,
    omitted_snippets: usize,
    expanded_for_target: bool,
    truncated: bool,
}

#[derive(Clone)]
struct CandidateSnippet {
    kind: &'static str,
    label: String,
    start_line: usize,
    end_line: usize,
    code: String,
    reason: String,
    is_summary: bool,
    priority: usize,
}

#[derive(Clone, Default)]
struct StaticAnalysis {
    imports: Vec<SyntaxSnippet>,
    definitions: Vec<Definition>,
    calls: Vec<SyntaxSnippet>,
    returns: Vec<SyntaxSnippet>,
    identifiers: BTreeMap<String, Vec<usize>>,
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
struct SyntaxSnippet {
    name: String,
    start_line: usize,
    end_line: usize,
    code: String,
}

#[derive(Clone)]
struct Definition {
    name: String,
    start_line: usize,
    end_line: usize,
    code: String,
    is_parameter: bool,
}

#[cfg_attr(not(test), tauri::command)]
pub fn build_explanation_context(request: BuildContextRequest) -> Result<ContextBundle, String> {
    build_context_bundle(request)
}

fn build_context_bundle(request: BuildContextRequest) -> Result<ContextBundle, String> {
    let line_count = request.file.code.lines().count().max(1);
    let target_type = request.target.target_type.as_str();
    if matches!(target_type, "module" | "project") {
        return Err("MVP Context Builder currently accepts file-local targets only.".to_string());
    }

    let (start_line, end_line) = normalize_target_range(&request.target, line_count)?;
    let target_name = request
        .target
        .target_name
        .clone()
        .or_else(|| {
            best_exact_node(&request.file.code_nodes, target_type, start_line, end_line)
                .map(|node| node.name.clone())
        })
        .unwrap_or_else(|| default_target_name(target_type, start_line, end_line));

    let mut warnings = Vec::new();
    let analysis = match cached_static_analysis(
        &request.file.path,
        &request.file.language,
        &request.file.code,
    ) {
        Ok(analysis) => analysis,
        Err(error) => {
            warnings.push(error);
            StaticAnalysis::default()
        }
    };
    let signals = build_signals(&analysis, start_line, end_line);
    let strategy = strategy_for_target(target_type).to_string();
    let mut candidates = build_candidates(
        &request.file,
        &request.target,
        target_type,
        &target_name,
        start_line,
        end_line,
        &analysis,
        &signals,
    );

    candidates.sort_by(|left, right| {
        left.priority
            .cmp(&right.priority)
            .then(left.start_line.cmp(&right.start_line))
            .then(left.end_line.cmp(&right.end_line))
            .then(left.kind.cmp(right.kind))
            .then(left.label.cmp(&right.label))
    });
    candidates.dedup_by(|left, right| {
        left.start_line == right.start_line
            && left.end_line == right.end_line
            && left.code == right.code
    });

    let requested_max_chars = request
        .budget
        .as_ref()
        .and_then(|budget| budget.max_chars)
        .unwrap_or_else(|| default_max_chars(target_type))
        .max(1);
    let max_snippets = request
        .budget
        .as_ref()
        .and_then(|budget| budget.max_snippets)
        .unwrap_or(DEFAULT_MAX_SNIPPETS)
        .max(1);

    let target_chars = candidates
        .first()
        .map(|candidate| char_count(&candidate.code))
        .unwrap_or(0);
    let effective_max_chars = requested_max_chars.max(target_chars);
    let expanded_for_target = effective_max_chars > requested_max_chars;
    if expanded_for_target {
        warnings.push(
            "上下文预算已扩展，以保证当前解释目标完整出现；未加入额外低优先级片段。".to_string(),
        );
    }

    let (snippets, omitted_snippets, used_chars) = select_with_budget(
        &request.file.path,
        candidates,
        effective_max_chars,
        max_snippets,
    );
    let sources = snippets
        .iter()
        .map(|snippet| ContextSource {
            source_id: snippet.source_id.clone(),
            file_path: snippet.file_path.clone(),
            start_line: snippet.start_line,
            end_line: snippet.end_line,
            node_id: best_source_node(
                &request.file.code_nodes,
                snippet.start_line,
                snippet.end_line,
            )
            .map(|node| node.id.clone()),
            reason: snippet.reason.clone(),
        })
        .collect();

    let source_fingerprint = snippets
        .iter()
        .map(|snippet| snippet.source_id.as_str())
        .collect::<Vec<_>>()
        .join(",");
    let context_seed = format!(
        "{}:{}:{}:{}:{}:{}:{}:{}",
        request.file.path,
        sha256_hex(&request.file.code),
        target_type,
        start_line,
        end_line,
        effective_max_chars,
        max_snippets,
        source_fingerprint
    );

    Ok(ContextBundle {
        context_id: format!("context:{}", &sha256_hex(&context_seed)[..20]),
        strategy,
        target: ContextTargetSummary {
            target_type: target_type.to_string(),
            target_name,
            file_path: request.file.path,
            start_line,
            end_line,
            symbol_id: request.target.symbol_id,
        },
        snippets,
        signals,
        sources,
        budget: ContextBudgetResult {
            requested_max_chars,
            effective_max_chars,
            used_chars,
            max_snippets,
            omitted_snippets,
            expanded_for_target,
            truncated: omitted_snippets > 0,
        },
        warnings,
    })
}

fn normalize_target_range(
    target: &ContextTargetInput,
    line_count: usize,
) -> Result<(usize, usize), String> {
    if target.target_type == "file" {
        return Ok((1, line_count));
    }

    let start_line = target
        .start_line
        .ok_or_else(|| "Context target is missing startLine.".to_string())?;
    let end_line = target.end_line.unwrap_or(start_line);
    if start_line == 0 || end_line == 0 || start_line > end_line || end_line > line_count {
        return Err(format!(
            "Context target range {start_line}-{end_line} is outside the file."
        ));
    }
    Ok((start_line, end_line))
}

#[allow(clippy::too_many_arguments)]
fn build_candidates(
    file: &ContextFileInput,
    target: &ContextTargetInput,
    target_type: &str,
    target_name: &str,
    start_line: usize,
    end_line: usize,
    analysis: &StaticAnalysis,
    signals: &ContextSignals,
) -> Vec<CandidateSnippet> {
    let mut candidates = Vec::new();
    if target_type == "file" {
        candidates.push(CandidateSnippet {
            kind: "target",
            label: format!("{target_name} structure"),
            start_line,
            end_line,
            code: file_outline(&file.code_nodes),
            reason: "文件解释使用结构目录作为完整目标表示，避免把整文件无差别发送给模型。"
                .to_string(),
            is_summary: true,
            priority: 0,
        });
        append_file_candidates(&mut candidates, file, analysis);
        return candidates;
    }

    candidates.push(CandidateSnippet {
        kind: "target",
        label: target_name.to_string(),
        start_line,
        end_line,
        code: lines_inclusive(&file.code, start_line, end_line),
        reason: "当前解释目标必须完整出现在上下文中。".to_string(),
        is_summary: false,
        priority: 0,
    });

    let containing_function = smallest_containing_node(
        &file.code_nodes,
        start_line,
        end_line,
        &["function", "class"],
    );
    if let Some(node) = containing_function {
        if node.start_line != start_line || node.end_line != end_line {
            candidates.push(candidate_from_node(
                file,
                node,
                "containing_structure",
                "所在函数或类提供局部职责、参数和执行边界。",
                1,
            ));
        }
    }

    match target_type {
        "line" | "import" | "export" => {
            append_definition_candidates(&mut candidates, analysis, signals, start_line, end_line);
            append_neighborhood_candidate(&mut candidates, file, start_line, end_line);
        }
        "range" | "block" => {
            append_definition_candidates(&mut candidates, analysis, signals, start_line, end_line);
            append_control_flow_candidates(&mut candidates, file, analysis, start_line, end_line);
        }
        "function" | "class" => {
            append_related_imports(&mut candidates, analysis, signals);
            append_called_function_candidates(
                &mut candidates,
                file,
                analysis,
                signals,
                start_line,
                end_line,
            );
        }
        _ => {
            append_neighborhood_candidate(&mut candidates, file, start_line, end_line);
        }
    }

    if target.target_type == "range" && containing_function.is_none() {
        append_neighborhood_candidate(&mut candidates, file, start_line, end_line);
    }

    candidates
}

fn append_file_candidates(
    candidates: &mut Vec<CandidateSnippet>,
    file: &ContextFileInput,
    analysis: &StaticAnalysis,
) {
    for import in &analysis.imports {
        candidates.push(candidate_from_syntax(
            import,
            "related_import",
            "文件依赖",
            "文件级上下文需要展示主要 import 依赖。",
            1,
        ));
    }

    for node in file
        .code_nodes
        .iter()
        .filter(|node| matches!(node.node_type.as_str(), "function" | "class" | "export"))
    {
        candidates.push(CandidateSnippet {
            kind: "file_structure",
            label: format!("{} {}", node.node_type, node.name),
            start_line: node.start_line,
            end_line: node.start_line,
            code: lines_inclusive(&file.code, node.start_line, node.start_line),
            reason: "文件级上下文保留核心结构的签名或首行，不展开完整实现。".to_string(),
            is_summary: true,
            priority: if node.node_type == "export" { 2 } else { 3 },
        });
    }
}

fn append_definition_candidates(
    candidates: &mut Vec<CandidateSnippet>,
    analysis: &StaticAnalysis,
    signals: &ContextSignals,
    start_line: usize,
    end_line: usize,
) {
    let inputs: HashSet<&str> = signals
        .input_identifiers
        .iter()
        .map(String::as_str)
        .collect();
    for definition in &analysis.definitions {
        if !inputs.contains(definition.name.as_str()) {
            continue;
        }
        if definition.start_line >= start_line && definition.end_line <= end_line {
            continue;
        }
        candidates.push(CandidateSnippet {
            kind: "variable_definition",
            label: if definition.is_parameter {
                format!("参数 {}", definition.name)
            } else {
                format!("定义 {}", definition.name)
            },
            start_line: definition.start_line,
            end_line: definition.end_line,
            code: definition.code.clone(),
            reason: "目标代码引用了该变量，定义位置优先于模型猜测。".to_string(),
            is_summary: false,
            priority: 2,
        });
    }
}

fn append_related_imports(
    candidates: &mut Vec<CandidateSnippet>,
    analysis: &StaticAnalysis,
    signals: &ContextSignals,
) {
    let referenced: HashSet<&str> = signals
        .referenced_identifiers
        .iter()
        .chain(signals.called_functions.iter())
        .map(String::as_str)
        .collect();
    for import in &analysis.imports {
        if referenced.is_empty()
            || referenced
                .iter()
                .any(|identifier| contains_identifier(&import.code, identifier))
        {
            candidates.push(candidate_from_syntax(
                import,
                "related_import",
                "相关 import",
                "函数引用了该 import 提供的符号。",
                2,
            ));
        }
    }
}

fn append_called_function_candidates(
    candidates: &mut Vec<CandidateSnippet>,
    file: &ContextFileInput,
    analysis: &StaticAnalysis,
    signals: &ContextSignals,
    start_line: usize,
    end_line: usize,
) {
    let called: HashSet<&str> = signals
        .called_functions
        .iter()
        .map(String::as_str)
        .collect();
    for node in file
        .code_nodes
        .iter()
        .filter(|node| node.node_type == "function")
    {
        if !called.contains(node.name.as_str())
            || (node.start_line >= start_line && node.end_line <= end_line)
        {
            continue;
        }
        candidates.push(CandidateSnippet {
            kind: "called_function",
            label: format!("调用目标 {}", node.name),
            start_line: node.start_line,
            end_line: node.start_line,
            code: lines_inclusive(&file.code, node.start_line, node.start_line),
            reason: "当前函数调用了该本地函数，仅加入签名避免扩张上下文。".to_string(),
            is_summary: true,
            priority: 3,
        });
    }

    for call in &analysis.calls {
        if call.start_line < start_line || call.end_line > end_line {
            continue;
        }
        if called.contains(call.name.as_str()) {
            candidates.push(candidate_from_syntax(
                call,
                "call_site",
                "调用位置",
                "保留目标内部的调用表达式，帮助解释执行协作关系。",
                4,
            ));
        }
    }
}

fn append_control_flow_candidates(
    candidates: &mut Vec<CandidateSnippet>,
    file: &ContextFileInput,
    analysis: &StaticAnalysis,
    start_line: usize,
    end_line: usize,
) {
    let relevant_blocks: Vec<&ContextNodeInput> = file
        .code_nodes
        .iter()
        .filter(|node| node.node_type == "block")
        .filter(|node| ranges_intersect(node.start_line, node.end_line, start_line, end_line))
        .filter(|node| node.start_line != start_line || node.end_line != end_line)
        .filter(|node| node.start_line < start_line || node.end_line > end_line)
        .collect();
    let smallest_enclosing_block = relevant_blocks
        .iter()
        .filter(|node| node.start_line <= start_line && node.end_line >= end_line)
        .min_by_key(|node| node.end_line.saturating_sub(node.start_line))
        .map(|node| (node.start_line, node.end_line));

    for node in relevant_blocks {
        let encloses_target = node.start_line <= start_line && node.end_line >= end_line;
        if encloses_target && smallest_enclosing_block != Some((node.start_line, node.end_line)) {
            continue;
        }
        candidates.push(candidate_from_node(
            file,
            node,
            "control_flow",
            "该控制流结构包围或穿过当前多行目标。",
            3,
        ));
    }
    for return_statement in &analysis.returns {
        if ranges_intersect(
            return_statement.start_line,
            return_statement.end_line,
            start_line,
            end_line,
        ) {
            candidates.push(candidate_from_syntax(
                return_statement,
                "control_flow",
                "返回路径",
                "当前代码块包含返回路径，属于重要输出行为。",
                3,
            ));
        }
    }
}

fn append_neighborhood_candidate(
    candidates: &mut Vec<CandidateSnippet>,
    file: &ContextFileInput,
    start_line: usize,
    end_line: usize,
) {
    let line_count = file.code.lines().count().max(1);
    let neighborhood_start = start_line.saturating_sub(NEIGHBORHOOD_RADIUS).max(1);
    let neighborhood_end = (end_line + NEIGHBORHOOD_RADIUS).min(line_count);
    if neighborhood_start == start_line && neighborhood_end == end_line {
        return;
    }
    candidates.push(CandidateSnippet {
        kind: "neighborhood",
        label: "邻近代码".to_string(),
        start_line: neighborhood_start,
        end_line: neighborhood_end,
        code: lines_inclusive(&file.code, neighborhood_start, neighborhood_end),
        reason: "少量前后行用于补足局部执行顺序，不扩张到整文件。".to_string(),
        is_summary: false,
        priority: 4,
    });
}

fn build_signals(analysis: &StaticAnalysis, start_line: usize, end_line: usize) -> ContextSignals {
    let referenced_identifiers: BTreeSet<String> = analysis
        .identifiers
        .iter()
        .filter(|(_, lines)| {
            lines
                .iter()
                .any(|line| *line >= start_line && *line <= end_line)
        })
        .map(|(name, _)| name.clone())
        .collect();
    let defined_identifiers: BTreeSet<String> = analysis
        .definitions
        .iter()
        .filter(|definition| definition.start_line >= start_line && definition.end_line <= end_line)
        .map(|definition| definition.name.clone())
        .collect();
    let input_identifiers: BTreeSet<String> = referenced_identifiers
        .iter()
        .filter(|name| !defined_identifiers.contains(*name))
        .filter(|name| {
            analysis
                .definitions
                .iter()
                .any(|definition| definition.name == **name && definition.start_line <= end_line)
        })
        .cloned()
        .collect();
    let output_identifiers: BTreeSet<String> = defined_identifiers
        .iter()
        .filter(|name| {
            analysis
                .identifiers
                .get(*name)
                .is_some_and(|lines| lines.iter().any(|line| *line > end_line))
        })
        .cloned()
        .collect();
    let called_functions: BTreeSet<String> = analysis
        .calls
        .iter()
        .filter(|call| call.start_line >= start_line && call.end_line <= end_line)
        .map(|call| call.name.clone())
        .filter(|name| !name.is_empty())
        .collect();

    ContextSignals {
        referenced_identifiers: referenced_identifiers.into_iter().collect(),
        defined_identifiers: defined_identifiers.into_iter().collect(),
        input_identifiers: input_identifiers.into_iter().collect(),
        output_identifiers: output_identifiers.into_iter().collect(),
        called_functions: called_functions.into_iter().collect(),
    }
}

fn parse_static_analysis(path: &str, language: &str, code: &str) -> Result<StaticAnalysis, String> {
    let grammar: Language = match file_extension(path) {
        Some("tsx") => tree_sitter_typescript::LANGUAGE_TSX.into(),
        _ => match language {
            "javascript" => tree_sitter_javascript::LANGUAGE.into(),
            "typescript" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
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
    collect_static_analysis(tree.root_node(), code, &mut analysis);
    Ok(analysis)
}

fn cached_static_analysis(
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

fn collect_static_analysis(node: Node<'_>, code: &str, analysis: &mut StaticAnalysis) {
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

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.is_named() {
            collect_static_analysis(child, code, analysis);
        }
    }
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

fn syntax_snippet(node: Node<'_>, code: &str, name: &str) -> SyntaxSnippet {
    SyntaxSnippet {
        name: name.to_string(),
        start_line: node.start_position().row + 1,
        end_line: node.end_position().row + 1,
        code: node_text(node, code).trim().to_string(),
    }
}

fn candidate_from_node(
    file: &ContextFileInput,
    node: &ContextNodeInput,
    kind: &'static str,
    reason: &str,
    priority: usize,
) -> CandidateSnippet {
    CandidateSnippet {
        kind,
        label: node.name.clone(),
        start_line: node.start_line,
        end_line: node.end_line,
        code: lines_inclusive(&file.code, node.start_line, node.end_line),
        reason: reason.to_string(),
        is_summary: false,
        priority,
    }
}

fn candidate_from_syntax(
    snippet: &SyntaxSnippet,
    kind: &'static str,
    label: &str,
    reason: &str,
    priority: usize,
) -> CandidateSnippet {
    CandidateSnippet {
        kind,
        label: if snippet.name.is_empty() {
            label.to_string()
        } else {
            format!("{label}: {}", snippet.name)
        },
        start_line: snippet.start_line,
        end_line: snippet.end_line,
        code: snippet.code.clone(),
        reason: reason.to_string(),
        is_summary: false,
        priority,
    }
}

fn select_with_budget(
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

fn file_extension(path: &str) -> Option<&str> {
    path.rsplit_once('.').map(|(_, extension)| extension)
}

fn best_exact_node<'a>(
    nodes: &'a [ContextNodeInput],
    target_type: &str,
    start_line: usize,
    end_line: usize,
) -> Option<&'a ContextNodeInput> {
    nodes.iter().find(|node| {
        node.node_type == target_type && node.start_line == start_line && node.end_line == end_line
    })
}

fn smallest_containing_node<'a>(
    nodes: &'a [ContextNodeInput],
    start_line: usize,
    end_line: usize,
    node_types: &[&str],
) -> Option<&'a ContextNodeInput> {
    nodes
        .iter()
        .filter(|node| {
            node_types.contains(&node.node_type.as_str())
                && node.start_line <= start_line
                && node.end_line >= end_line
        })
        .min_by_key(|node| node.end_line.saturating_sub(node.start_line))
}

fn best_source_node(
    nodes: &[ContextNodeInput],
    start_line: usize,
    end_line: usize,
) -> Option<&ContextNodeInput> {
    nodes
        .iter()
        .filter(|node| node.start_line <= start_line && node.end_line >= end_line)
        .min_by_key(|node| node.end_line.saturating_sub(node.start_line))
}

fn file_outline(nodes: &[ContextNodeInput]) -> String {
    let mut outline: Vec<String> = nodes
        .iter()
        .filter(|node| {
            matches!(
                node.node_type.as_str(),
                "import" | "export" | "class" | "function" | "block"
            )
        })
        .map(|node| {
            let symbol = node
                .symbol_id
                .as_deref()
                .map(|symbol| format!(" [{symbol}]"))
                .unwrap_or_default();
            format!(
                "{} {} (lines {}-{}){}: {}",
                node.node_type, node.name, node.start_line, node.end_line, symbol, node.anchor_text
            )
        })
        .collect();
    if outline.is_empty() {
        outline.push("No parsed structure nodes were available.".to_string());
    }
    outline.join("\n")
}

fn strategy_for_target(target_type: &str) -> &'static str {
    match target_type {
        "line" | "import" | "export" => "line",
        "range" | "block" => "range",
        "function" | "class" => "function",
        "file" => "file",
        _ => "line",
    }
}

fn default_max_chars(target_type: &str) -> usize {
    match target_type {
        "line" | "import" | "export" => 8_000,
        "range" | "block" => 10_000,
        "function" | "class" => 14_000,
        "file" => 10_000,
        _ => 8_000,
    }
}

fn default_target_name(target_type: &str, start_line: usize, end_line: usize) -> String {
    if start_line == end_line {
        format!("{target_type} {start_line}")
    } else {
        format!("{target_type} {start_line}-{end_line}")
    }
}

fn lines_inclusive(code: &str, start_line: usize, end_line: usize) -> String {
    code.lines()
        .skip(start_line.saturating_sub(1))
        .take(end_line.saturating_sub(start_line) + 1)
        .collect::<Vec<_>>()
        .join("\n")
}

fn ranges_intersect(
    left_start: usize,
    left_end: usize,
    right_start: usize,
    right_end: usize,
) -> bool {
    left_start <= right_end && right_start <= left_end
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

fn contains_identifier(code: &str, identifier: &str) -> bool {
    code.split(|character: char| {
        !character.is_alphanumeric() && character != '_' && character != '$'
    })
    .any(|part| part == identifier)
}

fn char_count(value: &str) -> usize {
    value.chars().count()
}

fn node_text<'a>(node: Node<'_>, code: &'a str) -> &'a str {
    node.utf8_text(code.as_bytes()).unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_request(
        target_type: &str,
        start_line: usize,
        end_line: usize,
    ) -> BuildContextRequest {
        let path = "examples/small/login-controller.ts".to_string();
        let code = include_str!("../../examples/small/login-controller.ts").to_string();
        BuildContextRequest {
            file: ContextFileInput {
                path,
                language: "typescript".to_string(),
                code_nodes: sample_nodes(),
                code,
            },
            target: ContextTargetInput {
                target_type: target_type.to_string(),
                target_name: None,
                start_line: Some(start_line),
                end_line: Some(end_line),
                symbol_id: None,
            },
            budget: None,
        }
    }

    fn sample_nodes() -> Vec<ContextNodeInput> {
        vec![
            sample_node("file", "login-controller.ts", 1, 37, None),
            sample_node("import", "findUserByEmail, verifyPassword", 1, 1, None),
            sample_node(
                "export",
                "loginUser export",
                12,
                37,
                Some("export:loginUser"),
            ),
            sample_node("function", "loginUser", 12, 37, Some("function:loginUser")),
            sample_node("block", "if", 16, 18, Some("block:16-18")),
            sample_node("block", "if", 22, 24, Some("block:22-24")),
            sample_node("block", "if", 28, 30, Some("block:28-30")),
        ]
    }

    fn sample_node(
        node_type: &str,
        name: &str,
        start_line: usize,
        end_line: usize,
        symbol_id: Option<&str>,
    ) -> ContextNodeInput {
        ContextNodeInput {
            id: format!("sample:{node_type}:{start_line}-{end_line}"),
            node_type: node_type.to_string(),
            name: name.to_string(),
            start_line,
            end_line,
            symbol_id: symbol_id.map(str::to_string),
            anchor_text: name.to_string(),
        }
    }

    #[test]
    fn builds_line_context_with_structure_and_variable_definitions() {
        let bundle = build_context_bundle(sample_request("line", 20, 20))
            .expect("line context should build");

        assert_eq!(bundle.strategy, "line");
        assert_eq!(bundle.snippets[0].kind, "target");
        assert!(bundle.snippets[0].code.contains("findUserByEmail"));
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "containing_structure"));
        assert!(bundle
            .signals
            .called_functions
            .contains(&"findUserByEmail".to_string()));
        assert_eq!(bundle.sources.len(), bundle.snippets.len());
    }

    #[test]
    fn builds_range_context_with_inputs_outputs_and_control_flow() {
        let bundle = build_context_bundle(sample_request("range", 16, 18))
            .expect("range context should build");

        assert_eq!(bundle.strategy, "range");
        assert!(bundle
            .signals
            .input_identifiers
            .contains(&"email".to_string()));
        assert!(bundle
            .signals
            .input_identifiers
            .contains(&"password".to_string()));
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "control_flow"));
    }

    #[test]
    fn builds_function_context_with_related_imports_and_calls() {
        let bundle = build_context_bundle(sample_request("function", 12, 37))
            .expect("function context should build");

        assert_eq!(bundle.strategy, "function");
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "related_import"));
        assert!(bundle
            .signals
            .called_functions
            .contains(&"verifyPassword".to_string()));
    }

    #[test]
    fn file_context_uses_outline_instead_of_full_file() {
        let mut request = sample_request("file", 1, 1);
        request.target.start_line = None;
        request.target.end_line = None;
        let full_code = request.file.code.clone();
        let bundle = build_context_bundle(request).expect("file context should build");

        assert_eq!(bundle.strategy, "file");
        assert!(bundle.snippets[0].is_summary);
        assert!(bundle.snippets[0].code.contains("function loginUser"));
        assert_ne!(bundle.snippets[0].code, full_code);
    }

    #[test]
    fn budget_is_deterministic_and_never_truncates_target() {
        let mut request = sample_request("function", 12, 37);
        request.budget = Some(ContextBudgetInput {
            max_chars: Some(20),
            max_snippets: Some(2),
        });
        let first = build_context_bundle(request).expect("budgeted context should build");

        let mut repeated_request = sample_request("function", 12, 37);
        repeated_request.budget = Some(ContextBudgetInput {
            max_chars: Some(20),
            max_snippets: Some(2),
        });
        let second = build_context_bundle(repeated_request).expect("repeated context should build");

        assert!(first.budget.expanded_for_target);
        assert_eq!(first.snippets[0].code, second.snippets[0].code);
        assert_eq!(first.context_id, second.context_id);
        assert!(first.budget.used_chars >= char_count(&first.snippets[0].code));

        let mut different_budget_request = sample_request("function", 12, 37);
        different_budget_request.budget = Some(ContextBudgetInput {
            max_chars: Some(20),
            max_snippets: Some(1),
        });
        let different_budget = build_context_bundle(different_budget_request)
            .expect("different budget context should build");

        assert_ne!(first.context_id, different_budget.context_id);
    }

    #[test]
    fn parses_tsx_context_with_the_tsx_grammar() {
        let code = "export function Greeting({ name }: { name: string }) {\n  return <h1>Hello {name}</h1>;\n}\n";
        let request = BuildContextRequest {
            file: ContextFileInput {
                path: "src/Greeting.tsx".to_string(),
                language: "typescript".to_string(),
                code: code.to_string(),
                code_nodes: Vec::new(),
            },
            target: ContextTargetInput {
                target_type: "line".to_string(),
                target_name: None,
                start_line: Some(2),
                end_line: Some(2),
                symbol_id: None,
            },
            budget: None,
        };

        let bundle = build_context_bundle(request).expect("TSX context should build");

        assert!(bundle.warnings.is_empty());
        assert!(bundle.snippets[0].code.contains("<h1>"));
        assert!(bundle
            .signals
            .referenced_identifiers
            .contains(&"name".to_string()));
    }

    #[test]
    fn keeps_only_the_nearest_enclosing_control_flow_block() {
        let code = (1..=40)
            .map(|line| format!("const line{line} = {line};"))
            .collect::<Vec<_>>()
            .join("\n");
        let file = ContextFileInput {
            path: "src/nested.ts".to_string(),
            language: "typescript".to_string(),
            code,
            code_nodes: vec![
                sample_node("block", "outer if", 10, 30, Some("block:10-30")),
                sample_node("block", "inner if", 15, 20, Some("block:15-20")),
                sample_node("block", "inside target", 16, 17, Some("block:16-17")),
            ],
        };
        let mut candidates = Vec::new();

        append_control_flow_candidates(&mut candidates, &file, &StaticAnalysis::default(), 16, 18);

        let control_flow_ranges: Vec<(usize, usize)> = candidates
            .iter()
            .filter(|candidate| candidate.kind == "control_flow")
            .map(|candidate| (candidate.start_line, candidate.end_line))
            .collect();
        assert_eq!(control_flow_ranges, vec![(15, 20)]);
    }

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
