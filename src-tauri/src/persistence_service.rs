#![cfg_attr(test, allow(dead_code))]

use rusqlite::Connection;
#[cfg(test)]
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(not(test))]
use tauri::{AppHandle, Manager};

use crate::utils::sha256_hex;

#[path = "persistence/schema.rs"]
mod schema;

#[path = "persistence/prompt_registry.rs"]
mod prompt_registry;

#[path = "persistence/model_config.rs"]
mod model_config;

#[path = "persistence/user_activity.rs"]
mod user_activity;

#[path = "persistence/change_tracking.rs"]
mod change_tracking;

#[path = "persistence/explanation_hydration.rs"]
mod explanation_hydration;

#[allow(unused_imports)]
pub(crate) use explanation_hydration::{
    hydrate_code_file_at_path, save_generated_explanation,
};

#[allow(unused_imports)]
pub(crate) use model_config::{
    delete_model_config, load_model_config, save_model_config, StoredModelConfig,
};
#[cfg(not(test))]
#[doc(hidden)]
pub use prompt_registry::__cmd__list_prompt_versions;
#[cfg(not(test))]
#[doc(hidden)]
pub use prompt_registry::__cmd__rollback_prompt_version;
#[cfg(not(test))]
#[doc(hidden)]
pub use prompt_registry::__cmd__upsert_prompt_version;
#[cfg(not(test))]
#[doc(hidden)]
pub use prompt_registry::__tauri_command_name_list_prompt_versions;
#[cfg(not(test))]
#[doc(hidden)]
pub use prompt_registry::__tauri_command_name_rollback_prompt_version;
#[cfg(not(test))]
#[doc(hidden)]
pub use prompt_registry::__tauri_command_name_upsert_prompt_version;
#[allow(unused_imports)]
pub(crate) use prompt_registry::active_prompt_version;
#[cfg(not(test))]
pub use prompt_registry::list_prompt_versions;
#[allow(unused_imports)]
pub(crate) use prompt_registry::pick_prompt_version;
#[cfg(not(test))]
pub use prompt_registry::rollback_prompt_version;
#[cfg(not(test))]
pub use prompt_registry::upsert_prompt_version;
#[allow(unused_imports)]
pub(crate) use prompt_registry::{
    list_prompt_versions_at_path, rollback_prompt_version_at_path,
};
#[allow(unused_imports)]
pub(crate) use prompt_registry::{
    PromptVersionPayload, RollbackPromptVersionPayload, RollbackPromptVersionRequest,
    UpsertPromptVersionRequest,
};
#[allow(unused_imports)]
pub(crate) use prompt_registry::DEFAULT_GENERATION_PROMPT_VERSION;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__save_explanation_feedback;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__save_reading_state;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_save_explanation_feedback;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_save_reading_state;
#[cfg(not(test))]
pub use user_activity::{save_explanation_feedback, save_reading_state};
#[allow(unused_imports)]
pub(crate) use user_activity::{save_feedback_at_path, save_reading_state_at_path};
#[allow(unused_imports)]
pub use user_activity::{
    SaveFeedbackPayload, SaveFeedbackRequest, SaveReadingStatePayload, SaveReadingStateRequest,
};

const DATABASE_FILE_NAME: &str = "codereader.sqlite";
const EXPLANATION_SCHEMA_VERSION: &str = "mvp-0.1";
const PROMPT_VERSION: &str = "mock-structure-target-v0.1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrateCodeFileRequest {
    file: PersistenceCodeFile,
    seed_explanations: Vec<ExplanationInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceCodeFile {
    id: String,
    path: String,
    project_id: Option<String>,
    project_root: Option<String>,
    relative_path: Option<String>,
    language: String,
    code: String,
    file_hash: Option<String>,
    snapshot_id: Option<String>,
    code_nodes: Vec<CodeNodeInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeNodeInput {
    id: String,
    node_type: String,
    name: String,
    start_line: usize,
    end_line: usize,
    code_hash: String,
    anchor_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplanationInput {
    id: String,
    file_path: String,
    file_hash: Option<String>,
    target_type: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
    symbol_id: Option<String>,
    code_hash: Option<String>,
    anchor_text: Option<String>,
    code_meaning: String,
    local_meaning: Option<String>,
    global_meaning: Option<String>,
    risk_notes: Option<Vec<String>>,
    reader_notes: Option<Vec<String>>,
    status: String,
    reading_state: String,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HydratedCodeFilePayload {
    explanations: Vec<ExplanationPayload>,
    database_path: String,
    project_id: String,
    change_summary: Option<ChangeSummaryPayload>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSummaryPayload {
    id: String,
    before_hash: String,
    after_hash: String,
    added_lines: usize,
    modified_lines: usize,
    deleted_lines: usize,
    added_nodes: usize,
    modified_nodes: usize,
    deleted_nodes: usize,
    affected_explanation_ids: Vec<String>,
    summary: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceStatusPayload {
    database_path: String,
    initialized: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplanationPayload {
    pub(crate) id: String,
    pub(crate) file_path: String,
    pub(crate) file_hash: Option<String>,
    pub(crate) target_type: String,
    pub(crate) target_name: Option<String>,
    pub(crate) start_line: Option<usize>,
    pub(crate) end_line: Option<usize>,
    pub(crate) symbol_id: Option<String>,
    pub(crate) code_hash: Option<String>,
    pub(crate) anchor_text: Option<String>,
    pub(crate) code_meaning: String,
    pub(crate) local_meaning: Option<String>,
    pub(crate) global_meaning: Option<String>,
    pub(crate) prior_knowledge: Option<String>,
    pub(crate) review_suggestion: Option<String>,
    pub(crate) trust_label: Option<String>,
    pub(crate) trust_reason: Option<String>,
    pub(crate) depends_on_lines: Vec<usize>,
    pub(crate) affects_lines: Vec<usize>,
    pub(crate) risk_notes: Vec<String>,
    pub(crate) reader_notes: Vec<String>,
    pub(crate) status: String,
    pub(crate) reading_state: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

pub(crate) struct GeneratedExplanationInput {
    pub(crate) project_id: Option<String>,
    pub(crate) project_root: Option<String>,
    pub(crate) file_id: String,
    pub(crate) file_path: String,
    pub(crate) language: String,
    pub(crate) file_hash: String,
    pub(crate) snapshot_id: String,
    pub(crate) line_count: usize,
    pub(crate) explanation_id: String,
    pub(crate) code_node_id: Option<String>,
    pub(crate) target_type: String,
    pub(crate) target_name: Option<String>,
    pub(crate) symbol_id: Option<String>,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
    pub(crate) code_hash: String,
    pub(crate) anchor_text: String,
    pub(crate) code_level_meaning: String,
    pub(crate) local_composition_meaning: String,
    pub(crate) project_role_meaning: String,
    pub(crate) prior_knowledge: Option<String>,
    pub(crate) risk_notes: Vec<String>,
    pub(crate) learning_note: Option<String>,
    pub(crate) review_suggestion: Option<String>,
    pub(crate) trust_label: String,
    pub(crate) trust_reason: String,
    pub(crate) depends_on_lines: Vec<usize>,
    pub(crate) affects_lines: Vec<usize>,
    pub(crate) display_mode: String,
    pub(crate) prompt_version: String,
    pub(crate) model_info: String,
    pub(crate) context_id: String,
    pub(crate) context_sources: String,
}

#[cfg(not(test))]
#[tauri::command]
pub fn hydrate_code_file_persistence(
    app: AppHandle,
    request: HydrateCodeFileRequest,
) -> Result<HydratedCodeFilePayload, String> {
    let database_path = database_path(&app)?;
    hydrate_code_file_at_path(&database_path, request)
}

#[cfg(not(test))]
#[tauri::command]
pub fn initialize_persistence(app: AppHandle) -> Result<PersistenceStatusPayload, String> {
    let database_path = database_path(&app)?;
    open_database(&database_path)?;
    Ok(PersistenceStatusPayload {
        database_path: display_path(&database_path),
        initialized: true,
    })
}

pub(crate) fn open_database(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create database directory: {error}"))?;
    }
    let conn = Connection::open(path).map_err(database_error)?;
    schema::migrate(&conn)?;
    Ok(conn)
}

#[cfg(not(test))]
pub(crate) fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve CodeReader data directory: {error}"))?;
    Ok(app_data_dir.join(DATABASE_FILE_NAME))
}

fn stable_project_id(file: &PersistenceCodeFile) -> String {
    file.project_id.clone().unwrap_or_else(|| {
        let seed = file
            .project_root
            .as_deref()
            .or(file.relative_path.as_deref())
            .unwrap_or(&file.path);
        format!("project:{}", &sha256_hex(seed)[..20])
    })
}

fn reading_state_id(project_id: &str, explanation_id: &str) -> String {
    format!(
        "reading:{}",
        &sha256_hex(&format!("{project_id}:{explanation_id}"))[..24]
    )
}

fn snapshot_node_id(snapshot_id: &str, code_node_id: &str) -> String {
    format!(
        "snapshot-node:{}",
        &sha256_hex(&format!("{snapshot_id}:{code_node_id}"))[..24]
    )
}

fn feedback_id(
    project_id: &str,
    explanation_id: &str,
    feedback_type: &str,
    user_note: Option<&str>,
    created_at: &str,
) -> String {
    format!(
        "feedback:{}",
        &sha256_hex(&format!(
            "{project_id}:{explanation_id}:{feedback_type}:{}:{created_at}",
            user_note.unwrap_or("")
        ))[..24]
    )
}

fn optional_usize_to_i64(value: Option<usize>) -> Option<i64> {
    value.map(|line| line as i64)
}

fn optional_i64_to_usize(value: Option<i64>) -> Option<usize> {
    value.and_then(|line| usize::try_from(line).ok())
}

fn i64_to_usize(value: i64) -> usize {
    usize::try_from(value.max(0)).unwrap_or_default()
}

fn join_notes(notes: Option<&[String]>) -> Option<String> {
    let notes = notes?;
    if notes.is_empty() {
        return None;
    }
    Some(notes.join("\n"))
}

fn split_notes(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

fn serialize_line_numbers(lines: &[usize]) -> Result<String, String> {
    serde_json::to_string(lines)
        .map_err(|error| format!("Failed to serialize explanation line relations: {error}"))
}

fn parse_line_numbers(value: Option<String>) -> Vec<usize> {
    value
        .and_then(|json| serde_json::from_str::<Vec<usize>>(&json).ok())
        .unwrap_or_default()
}

fn serialize_line_fingerprints(code: &str) -> Result<String, String> {
    let fingerprints: Vec<String> = code.lines().map(sha256_hex).collect();
    serde_json::to_string(&fingerprints)
        .map_err(|error| format!("Failed to serialize line fingerprints: {error}"))
}

fn line_count(code: &str) -> usize {
    code.lines().count().max(1)
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn now_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

fn database_error(error: rusqlite::Error) -> String {
    format!("SQLite persistence error: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corrupted_database_file_returns_error_without_replacing_file() {
        let database_path = temp_database_path("corrupt");
        std::fs::write(&database_path, b"not a sqlite database")
            .expect("corrupt fixture should write");

        let error = open_database(&database_path).expect_err("corrupt database should fail");
        let contents = std::fs::read(&database_path).expect("corrupt fixture should remain");

        assert!(error.contains("SQLite persistence error"));
        assert_eq!(contents, b"not a sqlite database");

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn hydrates_seed_explanations_and_restores_reading_state() {
        let database_path = temp_database_path("hydrate");
        let request = sample_request();

        let first = hydrate_code_file_at_path(&database_path, request)
            .expect("initial hydrate should save seed explanations");
        assert_eq!(first.explanations.len(), 2);
        assert_eq!(first.explanations[0].reading_state, "unread");

        save_reading_state_at_path(
            &database_path,
            SaveReadingStateRequest {
                project_id: "project:sample".to_string(),
                explanation_id: "exp:target:sample:file".to_string(),
                state: "understood".to_string(),
                note: None,
            },
        )
        .expect("reading state should save");

        let second = hydrate_code_file_at_path(&database_path, sample_request())
            .expect("second hydrate should load existing state");
        let file_explanation = second
            .explanations
            .iter()
            .find(|explanation| explanation.id == "exp:target:sample:file")
            .expect("file explanation should exist");
        assert_eq!(file_explanation.reading_state, "understood");

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn saves_explanation_feedback() {
        let database_path = temp_database_path("feedback");
        hydrate_code_file_at_path(&database_path, sample_request())
            .expect("hydrate should prepare DB");
        let saved = save_feedback_at_path(
            &database_path,
            SaveFeedbackRequest {
                project_id: "project:sample".to_string(),
                explanation_id: "exp:target:sample:file".to_string(),
                feedback_type: "helpful".to_string(),
                user_note: Some("clear".to_string()),
            },
        )
        .expect("feedback should save");

        assert_eq!(saved.feedback_type, "helpful");

        let conn = open_database(&database_path).expect("database should open");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM explanation_feedback WHERE explanation_id = ?1",
                params!["exp:target:sample:file"],
                |row| row.get(0),
            )
            .expect("count should query");
        assert_eq!(count, 1);

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn generated_explanation_survives_hydration_without_seed_overwrite() {
        let database_path = temp_database_path("generated");
        let input = GeneratedExplanationInput {
            project_id: Some("project:test".to_string()),
            project_root: Some("C:/test-project".to_string()),
            file_id: "file:test".to_string(),
            file_path: "C:/test-project/src/example.ts".to_string(),
            language: "typescript".to_string(),
            file_hash: "file-hash".to_string(),
            snapshot_id: "snapshot:test".to_string(),
            line_count: 5,
            explanation_id: "exp:test".to_string(),
            code_node_id: None,
            target_type: "line".to_string(),
            target_name: Some("line 2".to_string()),
            symbol_id: None,
            start_line: 2,
            end_line: 2,
            code_hash: "code-hash".to_string(),
            anchor_text: "const value = input;".to_string(),
            code_level_meaning: "读取输入。".to_string(),
            local_composition_meaning: "为后续校验准备值。".to_string(),
            project_role_meaning: "当前上下文不足。".to_string(),
            prior_knowledge: Some("变量赋值。".to_string()),
            risk_notes: vec!["[validation / medium] 检查输入校验。".to_string()],
            learning_note: Some("理解 const。".to_string()),
            review_suggestion: Some("检查后续分支。".to_string()),
            trust_label: "context_needed".to_string(),
            trust_reason: "只提供了局部上下文。".to_string(),
            depends_on_lines: vec![1],
            affects_lines: vec![3],
            display_mode: "plain".to_string(),
            prompt_version: "test-prompt".to_string(),
            model_info: r#"{"provider":"test","model":"fixture"}"#.to_string(),
            context_id: "context:test".to_string(),
            context_sources: "[]".to_string(),
        };

        let saved =
            save_generated_explanation(&database_path, input).expect("generated explanation saves");
        assert_eq!(saved.code_meaning, "读取输入。");
        assert_eq!(saved.trust_label.as_deref(), Some("context_needed"));

        let hydrated = hydrate_code_file_at_path(
            &database_path,
            HydrateCodeFileRequest {
                file: PersistenceCodeFile {
                    id: "file:test".to_string(),
                    path: "C:/test-project/src/example.ts".to_string(),
                    project_id: Some("project:test".to_string()),
                    project_root: Some("C:/test-project".to_string()),
                    relative_path: Some("src/example.ts".to_string()),
                    language: "typescript".to_string(),
                    code: [
                        "const input = request.value;",
                        "const value = input;",
                        "use(value);",
                        "audit(value);",
                        "return value;",
                    ]
                    .join("\n"),
                    file_hash: Some("file-hash".to_string()),
                    snapshot_id: Some("snapshot:test".to_string()),
                    code_nodes: Vec::new(),
                },
                seed_explanations: vec![ExplanationInput {
                    id: "exp:test".to_string(),
                    file_path: "C:/test-project/src/example.ts".to_string(),
                    file_hash: Some("file-hash".to_string()),
                    target_type: "line".to_string(),
                    start_line: Some(2),
                    end_line: Some(2),
                    symbol_id: None,
                    code_hash: Some("code-hash".to_string()),
                    anchor_text: Some("const value = input;".to_string()),
                    code_meaning: "placeholder should not replace generated content".to_string(),
                    local_meaning: None,
                    global_meaning: None,
                    risk_notes: None,
                    reader_notes: None,
                    status: "new_unexplained".to_string(),
                    reading_state: "unread".to_string(),
                    created_at: "2026-06-10T00:00:00.000Z".to_string(),
                    updated_at: "2026-06-10T00:00:00.000Z".to_string(),
                }],
            },
        )
        .expect("hydration should restore generated explanation");
        assert_eq!(hydrated.explanations.len(), 1);
        let restored = &hydrated.explanations[0];
        assert_eq!(restored.code_meaning, "读取输入。");
        assert_eq!(restored.status, "valid");
        assert_eq!(restored.depends_on_lines, vec![1]);
        assert_eq!(restored.affects_lines, vec![3]);
        assert_eq!(
            restored.review_suggestion.as_deref(),
            Some("检查后续分支。")
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn moved_function_migrates_valid_explanation_to_new_lines() {
        let database_path = temp_database_path("change-moved");
        hydrate_code_file_at_path(&database_path, sample_request())
            .expect("baseline should hydrate");
        mark_explanation_valid(&database_path, "exp:target:sample:function");

        let moved = changed_request(
            "hash:moved",
            "snapshot:moved",
            "const version = 1;\n\nexport function loginUser() {\n  return true;\n}\n",
            vec![
                node(
                    "target:moved:file",
                    "file",
                    "sample.ts",
                    1,
                    5,
                    "hash:moved",
                    "const version = 1;",
                ),
                node(
                    "target:moved:function",
                    "function",
                    "loginUser",
                    3,
                    5,
                    "hash:function",
                    "export function loginUser() {",
                ),
            ],
        );
        let hydrated =
            hydrate_code_file_at_path(&database_path, moved).expect("moved file should hydrate");

        let explanation = hydrated
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:sample:function")
            .expect("existing explanation should migrate");
        assert_eq!(explanation.status, "valid");
        assert_eq!(explanation.start_line, Some(3));
        assert_eq!(explanation.end_line, Some(5));
        assert_eq!(
            hydrated
                .explanations
                .iter()
                .filter(|item| item.target_type == "function")
                .count(),
            1
        );
        assert!(hydrated.change_summary.is_some());

        let reopened = hydrate_code_file_at_path(
            &database_path,
            changed_request(
                "hash:moved",
                "snapshot:moved",
                "const version = 1;\n\nexport function loginUser() {\n  return true;\n}\n",
                vec![
                    node(
                        "target:moved:file",
                        "file",
                        "sample.ts",
                        1,
                        5,
                        "hash:moved",
                        "const version = 1;",
                    ),
                    node(
                        "target:moved:function",
                        "function",
                        "loginUser",
                        3,
                        5,
                        "hash:function",
                        "export function loginUser() {",
                    ),
                ],
            ),
        )
        .expect("same snapshot should reopen");
        assert_eq!(
            reopened
                .explanations
                .iter()
                .filter(|item| item.target_type == "function")
                .count(),
            1
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn modified_function_is_invalidated_without_losing_explanation() {
        let database_path = temp_database_path("change-modified");
        hydrate_code_file_at_path(&database_path, sample_request())
            .expect("baseline should hydrate");
        mark_explanation_valid(&database_path, "exp:target:sample:function");

        let modified = changed_request(
            "hash:modified",
            "snapshot:modified",
            "export function loginUser() {\n  return false;\n}\n",
            vec![
                node(
                    "target:modified:file",
                    "file",
                    "sample.ts",
                    1,
                    3,
                    "hash:modified",
                    "export function loginUser() {",
                ),
                node(
                    "target:modified:function",
                    "function",
                    "loginUser",
                    1,
                    3,
                    "hash:function-modified",
                    "export function loginUser() {",
                ),
            ],
        );
        let hydrated = hydrate_code_file_at_path(&database_path, modified)
            .expect("modified file should hydrate");

        let explanation = hydrated
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:sample:function")
            .expect("existing explanation should remain available");
        assert_eq!(explanation.status, "invalid");
        assert_eq!(explanation.code_meaning, "function meaning");
        assert!(hydrated
            .change_summary
            .as_ref()
            .is_some_and(|summary| summary.modified_nodes >= 1));

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn python_explanation_restores_and_invalidates_after_function_change() {
        let database_path = temp_database_path("python-change");
        let baseline = python_request(
            "hash:python-base",
            "snapshot:python-base",
            "hash:python-function-base",
            "@trace\ndef greet(name: str = \"world\") -> str:\n    return f\"Hello, {name}\"\n",
        );
        hydrate_code_file_at_path(&database_path, baseline)
            .expect("Python baseline should hydrate");
        mark_explanation_valid(&database_path, "exp:target:python:function");

        let reopened = hydrate_code_file_at_path(
            &database_path,
            python_request(
                "hash:python-base",
                "snapshot:python-base",
                "hash:python-function-base",
                "@trace\ndef greet(name: str = \"world\") -> str:\n    return f\"Hello, {name}\"\n",
            ),
        )
        .expect("Python snapshot should reopen");
        let restored = reopened
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:python:function")
            .expect("Python function explanation should restore");
        assert_eq!(restored.status, "valid");

        let modified = hydrate_code_file_at_path(
            &database_path,
            python_request(
                "hash:python-modified",
                "snapshot:python-modified",
                "hash:python-function-modified",
                "@trace\ndef greet(name: str = \"world\") -> str:\n    return f\"Welcome, {name}!\"\n",
            ),
        )
        .expect("modified Python file should hydrate");
        let invalidated = modified
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:python:function")
            .expect("existing Python explanation should remain available");
        assert_eq!(invalidated.status, "invalid");
        assert_eq!(invalidated.code_meaning, "Python function meaning");
        assert!(modified
            .change_summary
            .as_ref()
            .is_some_and(|summary| summary.modified_nodes >= 1));

        let conn = open_database(&database_path).expect("database should open");
        let language: String = conn
            .query_row(
                "SELECT language FROM files WHERE id = ?1",
                params!["file:python"],
                |row| row.get(0),
            )
            .expect("Python file language should query");
        assert_eq!(language, "python");

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn sql_explanation_restores_and_invalidates_after_statement_change() {
        let database_path = temp_database_path("sql-change");
        let baseline = sql_request(
            "hash:sql-base",
            "snapshot:sql-base",
            "hash:sql-statement-base",
            "SELECT user_id, COUNT(*) AS total\nFROM events\nWHERE created_at >= CURRENT_DATE\nGROUP BY user_id;\n",
        );
        hydrate_code_file_at_path(&database_path, baseline).expect("SQL baseline should hydrate");
        mark_explanation_valid(&database_path, "exp:target:sql:statement");

        let reopened = hydrate_code_file_at_path(
            &database_path,
            sql_request(
                "hash:sql-base",
                "snapshot:sql-base",
                "hash:sql-statement-base",
                "SELECT user_id, COUNT(*) AS total\nFROM events\nWHERE created_at >= CURRENT_DATE\nGROUP BY user_id;\n",
            ),
        )
        .expect("SQL snapshot should reopen");
        let restored = reopened
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:sql:statement")
            .expect("SQL statement explanation should restore");
        assert_eq!(restored.status, "valid");

        let modified = hydrate_code_file_at_path(
            &database_path,
            sql_request(
                "hash:sql-modified",
                "snapshot:sql-modified",
                "hash:sql-statement-modified",
                "SELECT user_id, COUNT(*) AS total\nFROM events\nWHERE created_at >= CURRENT_DATE - INTERVAL '7 days'\nGROUP BY user_id;\n",
            ),
        )
        .expect("modified SQL file should hydrate");
        let invalidated = modified
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:sql:statement")
            .expect("existing SQL explanation should remain available");
        assert_eq!(invalidated.status, "invalid");
        assert_eq!(invalidated.code_meaning, "SQL statement meaning");
        assert!(modified
            .change_summary
            .as_ref()
            .is_some_and(|summary| summary.modified_nodes >= 1));

        let conn = open_database(&database_path).expect("database should open");
        let language: String = conn
            .query_row(
                "SELECT language FROM files WHERE id = ?1",
                params!["file:sql"],
                |row| row.get(0),
            )
            .expect("SQL file language should query");
        assert_eq!(language, "sql");

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn added_function_gets_new_unexplained_placeholder() {
        let database_path = temp_database_path("change-added");
        hydrate_code_file_at_path(&database_path, sample_request())
            .expect("baseline should hydrate");
        mark_explanation_valid(&database_path, "exp:target:sample:function");

        let added = changed_request(
            "hash:added",
            "snapshot:added",
            "export function loginUser() {\n  return true;\n}\n\nexport function logoutUser() {\n  return true;\n}\n",
            vec![
                node(
                    "target:added:file",
                    "file",
                    "sample.ts",
                    1,
                    7,
                    "hash:added",
                    "export function loginUser() {",
                ),
                node(
                    "target:added:login",
                    "function",
                    "loginUser",
                    1,
                    3,
                    "hash:function",
                    "export function loginUser() {",
                ),
                node(
                    "target:added:logout",
                    "function",
                    "logoutUser",
                    5,
                    7,
                    "hash:logout",
                    "export function logoutUser() {",
                ),
            ],
        );
        let hydrated =
            hydrate_code_file_at_path(&database_path, added).expect("added file should hydrate");

        let new_explanation = hydrated
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:added:logout")
            .expect("new function should receive a placeholder");
        assert_eq!(new_explanation.status, "new_unexplained");
        assert!(hydrated
            .change_summary
            .as_ref()
            .is_some_and(|summary| summary.added_nodes >= 1));

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn deleted_function_keeps_historical_explanation_marked_deleted() {
        let database_path = temp_database_path("change-deleted");
        hydrate_code_file_at_path(&database_path, sample_request())
            .expect("baseline should hydrate");
        mark_explanation_valid(&database_path, "exp:target:sample:function");

        let deleted = changed_request(
            "hash:deleted",
            "snapshot:deleted",
            "export const version = 1;\n",
            vec![node(
                "target:deleted:file",
                "file",
                "sample.ts",
                1,
                1,
                "hash:deleted",
                "export const version = 1;",
            )],
        );
        let hydrated = hydrate_code_file_at_path(&database_path, deleted)
            .expect("deleted file should hydrate");

        let explanation = hydrated
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:sample:function")
            .expect("deleted explanation should remain as history");
        assert_eq!(explanation.status, "deleted");
        assert!(hydrated
            .change_summary
            .as_ref()
            .is_some_and(|summary| summary.deleted_nodes >= 1));

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn saves_and_deletes_model_config() {
        let database_path = temp_database_path("model-config");
        save_model_config(
            &database_path,
            "https://api.example.com/v1/chat/completions",
            "example-model",
            45,
        )
        .expect("model config saves");
        let stored = load_model_config(&database_path)
            .expect("model config loads")
            .expect("model config exists");
        assert_eq!(stored.model, "example-model");
        assert_eq!(stored.timeout_seconds, 45);

        delete_model_config(&database_path).expect("model config deletes");
        assert!(load_model_config(&database_path)
            .expect("deleted model config queries")
            .is_none());

        let _ = std::fs::remove_file(database_path);
    }

    fn sample_request() -> HydrateCodeFileRequest {
        HydrateCodeFileRequest {
            file: PersistenceCodeFile {
                id: "file:sample".to_string(),
                path: "examples/sample.ts".to_string(),
                project_id: Some("project:sample".to_string()),
                project_root: Some("examples".to_string()),
                relative_path: Some("sample.ts".to_string()),
                language: "typescript".to_string(),
                code: "export function loginUser() {\n  return true;\n}\n".to_string(),
                file_hash: Some("hash:sample".to_string()),
                snapshot_id: Some("snapshot:sample".to_string()),
                code_nodes: vec![
                    CodeNodeInput {
                        id: "target:sample:file".to_string(),
                        node_type: "file".to_string(),
                        name: "sample.ts".to_string(),
                        start_line: 1,
                        end_line: 3,
                        code_hash: "hash:sample".to_string(),
                        anchor_text: "export function loginUser() {".to_string(),
                    },
                    CodeNodeInput {
                        id: "target:sample:function".to_string(),
                        node_type: "function".to_string(),
                        name: "loginUser".to_string(),
                        start_line: 1,
                        end_line: 3,
                        code_hash: "hash:function".to_string(),
                        anchor_text: "export function loginUser() {".to_string(),
                    },
                ],
            },
            seed_explanations: vec![
                ExplanationInput {
                    id: "exp:target:sample:file".to_string(),
                    file_path: "examples/sample.ts".to_string(),
                    file_hash: Some("hash:sample".to_string()),
                    target_type: "file".to_string(),
                    start_line: Some(1),
                    end_line: Some(3),
                    symbol_id: None,
                    code_hash: Some("hash:sample".to_string()),
                    anchor_text: Some("export function loginUser() {".to_string()),
                    code_meaning: "file meaning".to_string(),
                    local_meaning: Some("local meaning".to_string()),
                    global_meaning: Some("global meaning".to_string()),
                    risk_notes: Some(vec!["risk".to_string()]),
                    reader_notes: Some(vec!["note".to_string()]),
                    status: "new_unexplained".to_string(),
                    reading_state: "unread".to_string(),
                    created_at: "2026-06-09T00:00:00.000Z".to_string(),
                    updated_at: "2026-06-09T00:00:00.000Z".to_string(),
                },
                ExplanationInput {
                    id: "exp:target:sample:function".to_string(),
                    file_path: "examples/sample.ts".to_string(),
                    file_hash: Some("hash:sample".to_string()),
                    target_type: "function".to_string(),
                    start_line: Some(1),
                    end_line: Some(3),
                    symbol_id: Some("function:loginUser".to_string()),
                    code_hash: Some("hash:function".to_string()),
                    anchor_text: Some("export function loginUser() {".to_string()),
                    code_meaning: "function meaning".to_string(),
                    local_meaning: None,
                    global_meaning: None,
                    risk_notes: None,
                    reader_notes: None,
                    status: "new_unexplained".to_string(),
                    reading_state: "unread".to_string(),
                    created_at: "2026-06-09T00:00:00.000Z".to_string(),
                    updated_at: "2026-06-09T00:00:00.000Z".to_string(),
                },
            ],
        }
    }

    fn changed_request(
        file_hash: &str,
        snapshot_id: &str,
        code: &str,
        code_nodes: Vec<CodeNodeInput>,
    ) -> HydrateCodeFileRequest {
        let seed_explanations = code_nodes
            .iter()
            .map(|node| ExplanationInput {
                id: format!("exp:{}", node.id),
                file_path: "examples/sample.ts".to_string(),
                file_hash: Some(file_hash.to_string()),
                target_type: node.node_type.clone(),
                start_line: Some(node.start_line),
                end_line: Some(node.end_line),
                symbol_id: (node.node_type == "function")
                    .then(|| format!("function:examples/sample.ts:{}", node.name)),
                code_hash: Some(node.code_hash.clone()),
                anchor_text: Some(node.anchor_text.clone()),
                code_meaning: format!("{} 占位解释", node.name),
                local_meaning: None,
                global_meaning: None,
                risk_notes: None,
                reader_notes: None,
                status: "new_unexplained".to_string(),
                reading_state: "unread".to_string(),
                created_at: "2026-06-10T00:00:00.000Z".to_string(),
                updated_at: "2026-06-10T00:00:00.000Z".to_string(),
            })
            .collect();
        HydrateCodeFileRequest {
            file: PersistenceCodeFile {
                id: "file:sample".to_string(),
                path: "examples/sample.ts".to_string(),
                project_id: Some("project:sample".to_string()),
                project_root: Some("examples".to_string()),
                relative_path: Some("sample.ts".to_string()),
                language: "typescript".to_string(),
                code: code.to_string(),
                file_hash: Some(file_hash.to_string()),
                snapshot_id: Some(snapshot_id.to_string()),
                code_nodes,
            },
            seed_explanations,
        }
    }

    fn python_request(
        file_hash: &str,
        snapshot_id: &str,
        function_hash: &str,
        code: &str,
    ) -> HydrateCodeFileRequest {
        HydrateCodeFileRequest {
            file: PersistenceCodeFile {
                id: "file:python".to_string(),
                path: "examples/service.py".to_string(),
                project_id: Some("project:python".to_string()),
                project_root: Some("examples".to_string()),
                relative_path: Some("service.py".to_string()),
                language: "python".to_string(),
                code: code.to_string(),
                file_hash: Some(file_hash.to_string()),
                snapshot_id: Some(snapshot_id.to_string()),
                code_nodes: vec![
                    node(
                        "target:python:file",
                        "file",
                        "service.py",
                        1,
                        3,
                        file_hash,
                        "@trace",
                    ),
                    node(
                        "target:python:function",
                        "function",
                        "greet",
                        1,
                        3,
                        function_hash,
                        "@trace",
                    ),
                ],
            },
            seed_explanations: vec![
                ExplanationInput {
                    id: "exp:target:python:file".to_string(),
                    file_path: "examples/service.py".to_string(),
                    file_hash: Some(file_hash.to_string()),
                    target_type: "file".to_string(),
                    start_line: Some(1),
                    end_line: Some(3),
                    symbol_id: None,
                    code_hash: Some(file_hash.to_string()),
                    anchor_text: Some("@trace".to_string()),
                    code_meaning: "Python file meaning".to_string(),
                    local_meaning: None,
                    global_meaning: None,
                    risk_notes: None,
                    reader_notes: None,
                    status: "new_unexplained".to_string(),
                    reading_state: "unread".to_string(),
                    created_at: "2026-06-11T00:00:00.000Z".to_string(),
                    updated_at: "2026-06-11T00:00:00.000Z".to_string(),
                },
                ExplanationInput {
                    id: "exp:target:python:function".to_string(),
                    file_path: "examples/service.py".to_string(),
                    file_hash: Some(file_hash.to_string()),
                    target_type: "function".to_string(),
                    start_line: Some(1),
                    end_line: Some(3),
                    symbol_id: Some("function:examples/service.py:greet".to_string()),
                    code_hash: Some(function_hash.to_string()),
                    anchor_text: Some("@trace".to_string()),
                    code_meaning: "Python function meaning".to_string(),
                    local_meaning: None,
                    global_meaning: None,
                    risk_notes: None,
                    reader_notes: None,
                    status: "new_unexplained".to_string(),
                    reading_state: "unread".to_string(),
                    created_at: "2026-06-11T00:00:00.000Z".to_string(),
                    updated_at: "2026-06-11T00:00:00.000Z".to_string(),
                },
            ],
        }
    }

    fn sql_request(
        file_hash: &str,
        snapshot_id: &str,
        statement_hash: &str,
        code: &str,
    ) -> HydrateCodeFileRequest {
        HydrateCodeFileRequest {
            file: PersistenceCodeFile {
                id: "file:sql".to_string(),
                path: "examples/report.sql".to_string(),
                project_id: Some("project:sql".to_string()),
                project_root: Some("examples".to_string()),
                relative_path: Some("report.sql".to_string()),
                language: "sql".to_string(),
                code: code.to_string(),
                file_hash: Some(file_hash.to_string()),
                snapshot_id: Some(snapshot_id.to_string()),
                code_nodes: vec![
                    node(
                        "target:sql:file",
                        "file",
                        "report.sql",
                        1,
                        4,
                        file_hash,
                        "SELECT user_id, COUNT(*) AS total",
                    ),
                    node(
                        "target:sql:statement",
                        "statement",
                        "SELECT statement",
                        1,
                        4,
                        statement_hash,
                        "SELECT user_id, COUNT(*) AS total",
                    ),
                ],
            },
            seed_explanations: vec![
                ExplanationInput {
                    id: "exp:target:sql:file".to_string(),
                    file_path: "examples/report.sql".to_string(),
                    file_hash: Some(file_hash.to_string()),
                    target_type: "file".to_string(),
                    start_line: Some(1),
                    end_line: Some(4),
                    symbol_id: None,
                    code_hash: Some(file_hash.to_string()),
                    anchor_text: Some("SELECT user_id, COUNT(*) AS total".to_string()),
                    code_meaning: "SQL file meaning".to_string(),
                    local_meaning: None,
                    global_meaning: None,
                    risk_notes: None,
                    reader_notes: None,
                    status: "new_unexplained".to_string(),
                    reading_state: "unread".to_string(),
                    created_at: "2026-06-11T00:00:00.000Z".to_string(),
                    updated_at: "2026-06-11T00:00:00.000Z".to_string(),
                },
                ExplanationInput {
                    id: "exp:target:sql:statement".to_string(),
                    file_path: "examples/report.sql".to_string(),
                    file_hash: Some(file_hash.to_string()),
                    target_type: "statement".to_string(),
                    start_line: Some(1),
                    end_line: Some(4),
                    symbol_id: Some("statement:examples/report.sql:1-4".to_string()),
                    code_hash: Some(statement_hash.to_string()),
                    anchor_text: Some("SELECT user_id, COUNT(*) AS total".to_string()),
                    code_meaning: "SQL statement meaning".to_string(),
                    local_meaning: None,
                    global_meaning: None,
                    risk_notes: None,
                    reader_notes: None,
                    status: "new_unexplained".to_string(),
                    reading_state: "unread".to_string(),
                    created_at: "2026-06-11T00:00:00.000Z".to_string(),
                    updated_at: "2026-06-11T00:00:00.000Z".to_string(),
                },
            ],
        }
    }

    fn node(
        id: &str,
        node_type: &str,
        name: &str,
        start_line: usize,
        end_line: usize,
        code_hash: &str,
        anchor_text: &str,
    ) -> CodeNodeInput {
        CodeNodeInput {
            id: id.to_string(),
            node_type: node_type.to_string(),
            name: name.to_string(),
            start_line,
            end_line,
            code_hash: code_hash.to_string(),
            anchor_text: anchor_text.to_string(),
        }
    }

    fn mark_explanation_valid(database_path: &Path, explanation_id: &str) {
        let conn = open_database(database_path).expect("database should open");
        conn.execute(
            "UPDATE explanation_nodes SET status = 'valid' WHERE id = ?1",
            params![explanation_id],
        )
        .expect("explanation node should update");
        conn.execute(
            "UPDATE explanation_targets SET status = 'valid' WHERE explanation_id = ?1",
            params![explanation_id],
        )
        .expect("explanation target should update");
    }

    fn temp_database_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "codereader-{name}-{}.sqlite",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ))
    }
}
