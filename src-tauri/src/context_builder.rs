#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashSet};

use crate::utils::sha256_hex;

mod budget;
mod static_analysis;
use budget::{
    char_count, default_max_chars, select_with_budget, ContextBudgetResult, DEFAULT_MAX_SNIPPETS,
};
use static_analysis::{cached_static_analysis, StaticAnalysis, SyntaxSnippet};

const NEIGHBORHOOD_RADIUS: usize = 3;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildContextRequest {
    pub(crate) file: ContextFileInput,
    pub(crate) target: ContextTargetInput,
    pub(crate) budget: Option<ContextBudgetInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextFileInput {
    pub(crate) path: String,
    pub(crate) language: String,
    pub(crate) code: String,
    #[serde(default)]
    pub(crate) code_nodes: Vec<ContextNodeInput>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextNodeInput {
    pub(crate) id: String,
    pub(crate) node_type: String,
    pub(crate) name: String,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
    pub(crate) symbol_id: Option<String>,
    pub(crate) anchor_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextTargetInput {
    pub(crate) target_type: String,
    pub(crate) target_name: Option<String>,
    pub(crate) start_line: Option<usize>,
    pub(crate) end_line: Option<usize>,
    pub(crate) symbol_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextBudgetInput {
    pub(crate) max_chars: Option<usize>,
    pub(crate) max_snippets: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBundle {
    pub(crate) context_id: String,
    pub(crate) strategy: String,
    pub(crate) target: ContextTargetSummary,
    pub(crate) snippets: Vec<ContextSnippet>,
    pub(crate) signals: ContextSignals,
    pub(crate) sources: Vec<ContextSource>,
    pub(crate) budget: ContextBudgetResult,
    pub(crate) warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextTargetSummary {
    pub(crate) target_type: String,
    pub(crate) target_name: String,
    pub(crate) file_path: String,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
    pub(crate) symbol_id: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextSnippet {
    pub(crate) source_id: String,
    pub(crate) kind: String,
    pub(crate) label: String,
    pub(crate) file_path: String,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
    pub(crate) code: String,
    pub(crate) reason: String,
    pub(crate) is_summary: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextSignals {
    pub(crate) referenced_identifiers: Vec<String>,
    pub(crate) defined_identifiers: Vec<String>,
    pub(crate) input_identifiers: Vec<String>,
    pub(crate) output_identifiers: Vec<String>,
    pub(crate) called_functions: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextSource {
    pub(crate) source_id: String,
    pub(crate) file_path: String,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
    pub(crate) node_id: Option<String>,
    pub(crate) reason: String,
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

#[cfg_attr(not(test), tauri::command)]
pub fn build_explanation_context(request: BuildContextRequest) -> Result<ContextBundle, String> {
    build_context_bundle(request)
}

pub(crate) fn build_context_bundle(request: BuildContextRequest) -> Result<ContextBundle, String> {
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
    if request.file.language == "python" {
        warnings.push(
            "当前 Python 上下文仅覆盖文件内结构与调用线索，不推断完整跨文件调用图。".to_string(),
        );
    }
    if request.file.language == "sql" {
        warnings.push(
            "当前 SQL 支持面向通用 SQL 与常见 PostgreSQL、MySQL、SQLite 语法交集；未连接数据库 schema，也不推断运行时查询计划。"
                .to_string(),
        );
    }
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
    let signals = if request.file.language == "sql" {
        let (signal_start, signal_end) = smallest_containing_node(
            &request.file.code_nodes,
            start_line,
            end_line,
            &["query", "statement"],
        )
        .map(|node| (node.start_line, node.end_line))
        .unwrap_or((start_line, end_line));
        build_sql_signals(&analysis, signal_start, signal_end)
    } else {
        build_signals(&analysis, start_line, end_line)
    };
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
    if file.language == "sql" {
        return build_sql_candidates(
            file,
            target_type,
            target_name,
            start_line,
            end_line,
            analysis,
        );
    }

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

fn build_sql_candidates(
    file: &ContextFileInput,
    target_type: &str,
    target_name: &str,
    start_line: usize,
    end_line: usize,
    analysis: &StaticAnalysis,
) -> Vec<CandidateSnippet> {
    let mut candidates = Vec::new();
    if target_type == "file" {
        candidates.push(CandidateSnippet {
            kind: "target",
            label: format!("{target_name} SQL structure"),
            start_line,
            end_line,
            code: file_outline(&file.code_nodes),
            reason: "SQL 文件解释使用语句、查询与关键子句目录，避免把整个脚本无差别发送给模型。"
                .to_string(),
            is_summary: true,
            priority: 0,
        });
        for statement in &analysis.sql_statements {
            let signature = statement
                .code
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .unwrap_or("")
                .to_string();
            candidates.push(CandidateSnippet {
                kind: "sql_statement",
                label: statement.name.clone(),
                start_line: statement.start_line,
                end_line: statement.start_line,
                code: signature,
                reason: "文件级上下文只保留每条 SQL 语句的入口，不展开完整查询体。".to_string(),
                is_summary: true,
                priority: 1,
            });
        }
        for cte in &analysis.sql_ctes {
            let signature = cte
                .code
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .unwrap_or("")
                .to_string();
            candidates.push(CandidateSnippet {
                kind: "sql_cte",
                label: cte.name.clone(),
                start_line: cte.start_line,
                end_line: cte.start_line,
                code: signature,
                reason: "CTE 名称与首行帮助建立 SQL 文件内的数据流目录。".to_string(),
                is_summary: true,
                priority: 2,
            });
        }
        return candidates;
    }

    candidates.push(CandidateSnippet {
        kind: "target",
        label: target_name.to_string(),
        start_line,
        end_line,
        code: lines_inclusive(&file.code, start_line, end_line),
        reason: "当前 SQL 解释目标必须完整出现在上下文中。".to_string(),
        is_summary: false,
        priority: 0,
    });

    if let Some(node) = smallest_containing_node(
        &file.code_nodes,
        start_line,
        end_line,
        &["query", "statement"],
    ) {
        if node.start_line != start_line || node.end_line != end_line {
            candidates.push(candidate_from_node(
                file,
                node,
                "containing_sql",
                "所在 SQL 语句或查询提供 CTE、读写目标及完整过滤边界。",
                1,
            ));
        }
    }

    let target_code = lines_inclusive(&file.code, start_line, end_line);
    for cte in &analysis.sql_ctes {
        if cte.start_line >= start_line && cte.end_line <= end_line {
            continue;
        }
        if !cte.name.is_empty() && contains_identifier(&target_code, &cte.name) {
            candidates.push(candidate_from_syntax(
                cte,
                "sql_cte",
                "相关 CTE",
                "当前目标引用了该 CTE，加入其定义以解释数据来源。",
                2,
            ));
        }
    }

    for write in &analysis.sql_writes {
        if ranges_intersect(write.start_line, write.end_line, start_line, end_line) {
            candidates.push(candidate_from_syntax(
                write,
                "sql_write",
                "写入目标",
                "该 SQL 片段会创建、更新或删除数据对象，需要明确副作用边界。",
                2,
            ));
        }
    }

    for source in &analysis.sql_sources {
        if ranges_intersect(source.start_line, source.end_line, start_line, end_line)
            || contains_identifier(&target_code, &source.name)
        {
            candidates.push(candidate_from_syntax(
                source,
                "sql_source",
                "读取来源",
                "该关系参与当前查询的数据输入或连接。",
                3,
            ));
        }
    }

    for clause in &analysis.sql_clauses {
        if ranges_intersect(clause.start_line, clause.end_line, start_line, end_line) {
            candidates.push(candidate_from_syntax(
                clause,
                "sql_clause",
                "相关 SQL 子句",
                "该子句约束过滤、连接、聚合、排序或结果数量。",
                4,
            ));
        }
    }

    if matches!(target_type, "line" | "range") {
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

    for assignment in &analysis.module_assignments {
        candidates.push(candidate_from_syntax(
            assignment,
            "module_assignment",
            "模块级赋值",
            "文件级上下文保留模块常量或入口依赖，但不展开无关实现。",
            2,
        ));
    }

    for entry_point in &analysis.entry_points {
        candidates.push(candidate_from_syntax(
            entry_point,
            "entry_point",
            "模块入口",
            "Python 主入口信号决定模块作为脚本运行时的启动路径。",
            2,
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
        let (signature_end_line, signature) =
            structure_signature(&file.code, node.start_line, node.end_line);
        candidates.push(CandidateSnippet {
            kind: "called_function",
            label: format!("调用目标 {}", node.name),
            start_line: node.start_line,
            end_line: signature_end_line,
            code: signature,
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

fn build_sql_signals(
    analysis: &StaticAnalysis,
    start_line: usize,
    end_line: usize,
) -> ContextSignals {
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
        .sql_ctes
        .iter()
        .filter(|cte| cte.start_line >= start_line && cte.end_line <= end_line)
        .map(|cte| cte.name.clone())
        .collect();
    let input_identifiers: BTreeSet<String> = analysis
        .sql_sources
        .iter()
        .filter(|source| ranges_intersect(source.start_line, source.end_line, start_line, end_line))
        .map(|source| source.name.clone())
        .collect();
    let output_identifiers: BTreeSet<String> = analysis
        .sql_writes
        .iter()
        .filter(|write| ranges_intersect(write.start_line, write.end_line, start_line, end_line))
        .map(|write| write.name.clone())
        .chain(defined_identifiers.iter().cloned())
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
                "import" | "export" | "class" | "function" | "block" | "statement" | "query"
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
        "statement" | "query" => "statement",
        "file" => "file",
        _ => "line",
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

fn structure_signature(code: &str, start_line: usize, end_line: usize) -> (usize, String) {
    let lines: Vec<&str> = code.lines().collect();
    let start_index = start_line.saturating_sub(1);
    let end_index = end_line.min(lines.len());
    if start_index >= end_index {
        return (start_line, String::new());
    }

    let mut signature_end = start_index;
    let starts_with_decorator = lines[start_index].trim_start().starts_with('@');
    if starts_with_decorator {
        for (index, line) in lines[start_index..end_index].iter().enumerate() {
            let trimmed = line.trim_start();
            signature_end = start_index + index;
            if trimmed.starts_with("def ")
                || trimmed.starts_with("async def ")
                || trimmed.starts_with("class ")
            {
                break;
            }
        }
    }

    (
        signature_end + 1,
        lines[start_index..=signature_end].join("\n"),
    )
}

fn ranges_intersect(
    left_start: usize,
    left_end: usize,
    right_start: usize,
    right_end: usize,
) -> bool {
    left_start <= right_end && right_start <= left_end
}

fn contains_identifier(code: &str, identifier: &str) -> bool {
    code.split(|character: char| {
        !character.is_alphanumeric() && character != '_' && character != '$'
    })
    .any(|part| part == identifier)
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

    fn python_request(
        target_type: &str,
        start_line: Option<usize>,
        end_line: Option<usize>,
    ) -> BuildContextRequest {
        BuildContextRequest {
            file: ContextFileInput {
                path: "examples/python/service.py".to_string(),
                language: "python".to_string(),
                code: python_code().to_string(),
                code_nodes: python_nodes(),
            },
            target: ContextTargetInput {
                target_type: target_type.to_string(),
                target_name: None,
                start_line,
                end_line,
                symbol_id: None,
            },
            budget: None,
        }
    }

    fn python_code() -> &'static str {
        r#"from pathlib import Path
from contextlib import asynccontextmanager

DEFAULT_LIMIT = 10

def trace(func):
    return func

class Repository:
    @classmethod
    async def load(cls, user_id: int = 1):
        return {"id": user_id}

@trace
async def process(user_id: int, limit: int = DEFAULT_LIMIT) -> dict | None:
    path = Path("data.json")
    try:
        with path.open() as handle:
            data = handle.read()
        if not data:
            return None
        result = await Repository.load(user_id)
        return result
    except OSError:
        return None

if __name__ == "__main__":
    print("ready")
"#
    }

    fn python_nodes() -> Vec<ContextNodeInput> {
        vec![
            sample_node("file", "service.py", 1, 28, None),
            sample_node("import", "from pathlib import Path", 1, 1, None),
            sample_node(
                "import",
                "from contextlib import asynccontextmanager",
                2,
                2,
                None,
            ),
            sample_node("function", "trace", 6, 7, Some("function:trace")),
            sample_node("class", "Repository", 9, 12, Some("class:Repository")),
            sample_node("function", "load", 10, 12, Some("function:load")),
            sample_node("function", "process", 14, 25, Some("function:process")),
            sample_node("block", "try", 17, 25, Some("block:17-25")),
            sample_node("block", "with", 18, 19, Some("block:18-19")),
            sample_node("block", "if", 20, 21, Some("block:20-21")),
            sample_node("block", "except", 24, 25, Some("block:24-25")),
            sample_node("block", "if", 27, 28, Some("block:27-28")),
        ]
    }

    fn sql_request(
        target_type: &str,
        start_line: Option<usize>,
        end_line: Option<usize>,
    ) -> BuildContextRequest {
        BuildContextRequest {
            file: ContextFileInput {
                path: "examples/sql/report.sql".to_string(),
                language: "sql".to_string(),
                code: sql_code().to_string(),
                code_nodes: sql_nodes(),
            },
            target: ContextTargetInput {
                target_type: target_type.to_string(),
                target_name: None,
                start_line,
                end_line,
                symbol_id: None,
            },
            budget: None,
        }
    }

    fn sql_code() -> &'static str {
        r#"WITH active_users AS (
    SELECT u.id, u.team_id
    FROM users u
    WHERE u.active = TRUE
),
team_totals AS (
    SELECT team_id, COUNT(*) AS member_count
    FROM active_users
    GROUP BY team_id
)
SELECT t.name, tt.member_count
FROM teams t
JOIN team_totals tt ON tt.team_id = t.id
WHERE tt.member_count > 5
ORDER BY tt.member_count DESC
LIMIT 20;

UPDATE audit_log
SET reviewed = TRUE
WHERE created_at < CURRENT_DATE;
"#
    }

    fn sql_nodes() -> Vec<ContextNodeInput> {
        vec![
            sample_node("file", "report.sql", 1, 20, None),
            sample_node(
                "statement",
                "SELECT statement",
                1,
                16,
                Some("statement:1-16"),
            ),
            sample_node("query", "CTE active_users", 1, 5, Some("query:1-5")),
            sample_node("block", "WHERE", 4, 4, Some("block:4-4")),
            sample_node("query", "CTE team_totals", 6, 10, Some("query:6-10")),
            sample_node("block", "GROUP BY", 9, 9, Some("block:9-9")),
            sample_node("block", "JOIN", 13, 13, Some("block:13-13")),
            sample_node("block", "WHERE", 14, 14, Some("block:14-14")),
            sample_node("block", "ORDER BY", 15, 15, Some("block:15-15")),
            sample_node("block", "LIMIT", 16, 16, Some("block:16-16")),
            sample_node(
                "statement",
                "UPDATE statement",
                18,
                20,
                Some("statement:18-20"),
            ),
            sample_node("block", "WHERE", 20, 20, Some("block:20-20")),
        ]
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
    fn builds_python_line_context_with_class_and_parameter_scope() {
        let bundle = build_context_bundle(python_request("line", Some(22), Some(22)))
            .expect("Python line context should build");

        assert_eq!(bundle.strategy, "line");
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "containing_structure"
                && snippet.code.contains("async def process")));
        assert!(bundle
            .signals
            .input_identifiers
            .contains(&"user_id".to_string()));
        assert!(bundle
            .signals
            .called_functions
            .contains(&"load".to_string()));
        assert!(bundle
            .warnings
            .iter()
            .any(|warning| warning.contains("跨文件调用图")));
    }

    #[test]
    fn builds_python_range_context_with_inputs_outputs_and_control_flow() {
        let bundle = build_context_bundle(python_request("range", Some(18), Some(19)))
            .expect("Python range context should build");

        assert_eq!(bundle.strategy, "range");
        assert!(bundle
            .signals
            .input_identifiers
            .contains(&"path".to_string()));
        assert!(bundle
            .signals
            .output_identifiers
            .contains(&"data".to_string()));
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "control_flow" && snippet.code.contains("try:")));
    }

    #[test]
    fn builds_python_function_context_with_decorator_import_and_local_call() {
        let bundle = build_context_bundle(python_request("function", Some(14), Some(25)))
            .expect("Python function context should build");

        assert_eq!(bundle.strategy, "function");
        assert!(bundle.snippets[0].code.starts_with("@trace"));
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "related_import" && snippet.code.contains("pathlib")));
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "called_function"
                && snippet.code.contains("async def load")));
    }

    #[test]
    fn builds_python_file_context_without_full_file_leakage() {
        let full_code = python_code().to_string();
        let bundle = build_context_bundle(python_request("file", None, None))
            .expect("Python file context should build");

        assert_eq!(bundle.strategy, "file");
        assert!(bundle.snippets[0].is_summary);
        assert!(bundle.snippets[0].code.contains("function process"));
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "module_assignment"
                && snippet.code.contains("DEFAULT_LIMIT")));
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "entry_point" && snippet.code.contains("__main__")));
        assert!(bundle
            .snippets
            .iter()
            .all(|snippet| snippet.code != full_code));
    }

    #[test]
    fn builds_sql_line_context_with_containing_statement_and_relations() {
        let bundle = build_context_bundle(sql_request("line", Some(14), Some(14)))
            .expect("SQL line context should build");

        assert_eq!(bundle.strategy, "line");
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "containing_sql"
                && snippet.code.contains("WITH active_users")));
        assert!(bundle
            .signals
            .input_identifiers
            .contains(&"teams".to_string()));
        assert!(bundle
            .signals
            .input_identifiers
            .contains(&"team_totals".to_string()));
        assert!(bundle
            .warnings
            .iter()
            .any(|warning| warning.contains("schema")));
    }

    #[test]
    fn builds_sql_query_context_with_cte_source_and_function_call() {
        let bundle = build_context_bundle(sql_request("query", Some(6), Some(10)))
            .expect("SQL query context should build");

        assert_eq!(bundle.strategy, "statement");
        assert!(bundle.snippets[0].code.contains("team_totals AS"));
        assert!(bundle
            .signals
            .input_identifiers
            .contains(&"active_users".to_string()));
        assert!(bundle
            .signals
            .called_functions
            .iter()
            .any(|name| name.eq_ignore_ascii_case("COUNT")));
    }

    #[test]
    fn builds_sql_statement_context_with_read_and_write_data_flow() {
        let select = build_context_bundle(sql_request("statement", Some(1), Some(16)))
            .expect("SQL select statement context should build");
        let update = build_context_bundle(sql_request("statement", Some(18), Some(20)))
            .expect("SQL update statement context should build");

        assert_eq!(select.strategy, "statement");
        assert!(select
            .signals
            .input_identifiers
            .contains(&"users".to_string()));
        assert!(!select
            .signals
            .output_identifiers
            .contains(&"audit_log".to_string()));
        assert!(update
            .signals
            .output_identifiers
            .contains(&"audit_log".to_string()));
        assert!(update
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "sql_write"));
    }

    #[test]
    fn builds_sql_file_context_without_full_script_leakage() {
        let full_code = sql_code().to_string();
        let bundle = build_context_bundle(sql_request("file", None, None))
            .expect("SQL file context should build");

        assert_eq!(bundle.strategy, "file");
        assert!(bundle.snippets[0].is_summary);
        assert!(bundle.snippets[0]
            .code
            .contains("statement SELECT statement"));
        assert!(bundle.snippets[0].code.contains("query CTE active_users"));
        assert!(bundle
            .snippets
            .iter()
            .any(|snippet| snippet.kind == "sql_statement"));
        assert!(bundle
            .snippets
            .iter()
            .all(|snippet| snippet.code != full_code));
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
}
