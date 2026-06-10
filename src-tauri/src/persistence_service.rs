#![cfg_attr(test, allow(dead_code))]

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(not(test))]
use tauri::{AppHandle, Manager};

use crate::utils::sha256_hex;

const DATABASE_FILE_NAME: &str = "codereader.sqlite";
const SCHEMA_VERSION: &str = "mvp-0.1";
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

pub(crate) struct StoredModelConfig {
    pub(crate) endpoint: String,
    pub(crate) model: String,
    pub(crate) timeout_seconds: u64,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReadingStateRequest {
    project_id: String,
    explanation_id: String,
    state: String,
    note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReadingStatePayload {
    explanation_id: String,
    state: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFeedbackRequest {
    project_id: String,
    explanation_id: String,
    feedback_type: String,
    user_note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFeedbackPayload {
    id: String,
    explanation_id: String,
    feedback_type: String,
    created_at: String,
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

#[cfg(not(test))]
#[tauri::command]
pub fn save_reading_state(
    app: AppHandle,
    request: SaveReadingStateRequest,
) -> Result<SaveReadingStatePayload, String> {
    let database_path = database_path(&app)?;
    save_reading_state_at_path(&database_path, request)
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_explanation_feedback(
    app: AppHandle,
    request: SaveFeedbackRequest,
) -> Result<SaveFeedbackPayload, String> {
    let database_path = database_path(&app)?;
    save_feedback_at_path(&database_path, request)
}

fn hydrate_code_file_at_path(
    database_path: &Path,
    request: HydrateCodeFileRequest,
) -> Result<HydratedCodeFilePayload, String> {
    let mut conn = open_database(database_path)?;
    let tx = conn.transaction().map_err(database_error)?;
    let now = now_timestamp();
    let project_id = stable_project_id(&request.file);
    let project_root = request
        .file
        .project_root
        .clone()
        .unwrap_or_else(|| request.file.path.clone());
    let file_hash = request
        .file
        .file_hash
        .clone()
        .unwrap_or_else(|| sha256_hex(&request.file.code));
    let snapshot_id = request
        .file
        .snapshot_id
        .clone()
        .unwrap_or_else(|| format!("snapshot:{}", &file_hash[..16]));
    let line_count = line_count(&request.file.code);

    tx.execute(
        "INSERT INTO projects (id, root_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(id) DO UPDATE SET root_path = excluded.root_path, updated_at = excluded.updated_at",
        params![project_id, project_root, now],
    )
    .map_err(database_error)?;

    tx.execute(
        "INSERT INTO files (id, project_id, path, language, content_hash, last_analyzed_hash, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'valid', ?6)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           path = excluded.path,
           language = excluded.language,
           content_hash = excluded.content_hash,
           last_analyzed_hash = excluded.last_analyzed_hash,
           status = excluded.status,
           updated_at = excluded.updated_at",
        params![
            request.file.id,
            project_id,
            request.file.path,
            request.file.language,
            file_hash,
            now
        ],
    )
    .map_err(database_error)?;

    tx.execute(
        "INSERT OR IGNORE INTO code_snapshots
         (id, project_id, file_id, content_hash, line_count, snapshot_reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'file_loaded', ?6)",
        params![
            snapshot_id,
            project_id,
            request.file.id,
            file_hash,
            line_count as i64,
            now
        ],
    )
    .map_err(database_error)?;

    for node in &request.file.code_nodes {
        tx.execute(
            "INSERT INTO code_nodes
             (id, project_id, file_id, node_type, symbol_name, start_line, end_line, ast_hash, code_hash, parent_node_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, NULL)
             ON CONFLICT(id) DO UPDATE SET
               project_id = excluded.project_id,
               file_id = excluded.file_id,
               node_type = excluded.node_type,
               symbol_name = excluded.symbol_name,
               start_line = excluded.start_line,
               end_line = excluded.end_line,
               ast_hash = excluded.ast_hash,
               code_hash = excluded.code_hash",
            params![
                node.id,
                project_id,
                request.file.id,
                node.node_type,
                node.name,
                node.start_line as i64,
                node.end_line as i64,
                node.code_hash
            ],
        )
        .map_err(database_error)?;
    }

    for explanation in &request.seed_explanations {
        let code_node_id = code_node_id_for(explanation, &request.file.code_nodes);
        let target_id = format!("target:{}", explanation.id);
        let risk_summary = join_notes(explanation.risk_notes.as_deref());
        let learning_note = join_notes(explanation.reader_notes.as_deref());

        tx.execute(
            "INSERT OR IGNORE INTO explanation_nodes
             (id, project_id, file_id, snapshot_id, code_node_id, explanation_type,
              start_line, end_line, code_level_meaning, local_composition_meaning,
              project_role_meaning, risk_summary, learning_note, trust_label,
              trust_reason, display_mode, status, schema_version, prompt_version,
              model_info, created_at, updated_at)
             VALUES
             (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
              '未由模型生成', '当前是结构锚点占位解释，尚未调用 LLM。', 'plain',
              ?14, ?15, ?16, 'mock', ?17, ?18)",
            params![
                explanation.id,
                project_id,
                request.file.id,
                snapshot_id,
                code_node_id,
                explanation.target_type,
                optional_usize_to_i64(explanation.start_line),
                optional_usize_to_i64(explanation.end_line),
                explanation.code_meaning,
                explanation.local_meaning,
                explanation.global_meaning,
                risk_summary,
                learning_note,
                explanation.status,
                SCHEMA_VERSION,
                PROMPT_VERSION,
                explanation.created_at,
                explanation.updated_at
            ],
        )
        .map_err(database_error)?;

        tx.execute(
            "INSERT INTO explanation_targets
             (id, project_id, explanation_id, target_type, file_id, file_path, file_hash,
              snapshot_id, code_node_id, symbol_id, start_line, end_line, code_hash,
              ast_hash, anchor_text, status, created_at, updated_at)
             VALUES
             (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
              ?13, ?14, ?15, ?16, ?17)
             ON CONFLICT(id) DO UPDATE SET
               file_hash = excluded.file_hash,
               snapshot_id = excluded.snapshot_id,
               code_node_id = excluded.code_node_id,
               symbol_id = excluded.symbol_id,
               start_line = excluded.start_line,
               end_line = excluded.end_line,
               code_hash = excluded.code_hash,
               ast_hash = excluded.ast_hash,
               anchor_text = excluded.anchor_text,
               status = CASE
                 WHEN explanation_targets.status = 'valid'
                   AND explanation_targets.snapshot_id = excluded.snapshot_id
                   AND explanation_targets.code_hash = excluded.code_hash
                   AND excluded.status IN ('new_unexplained', 'transient')
                 THEN explanation_targets.status
                 ELSE excluded.status
               END,
               updated_at = CASE
                 WHEN explanation_targets.status = 'valid'
                   AND explanation_targets.snapshot_id = excluded.snapshot_id
                   AND explanation_targets.code_hash = excluded.code_hash
                   AND excluded.status IN ('new_unexplained', 'transient')
                 THEN explanation_targets.updated_at
                 ELSE excluded.updated_at
               END",
            params![
                target_id,
                project_id,
                explanation.id,
                explanation.target_type,
                request.file.id,
                explanation.file_path,
                explanation
                    .file_hash
                    .clone()
                    .or_else(|| Some(file_hash.clone())),
                snapshot_id,
                code_node_id,
                explanation.symbol_id,
                optional_usize_to_i64(explanation.start_line),
                optional_usize_to_i64(explanation.end_line),
                explanation.code_hash,
                explanation.anchor_text,
                explanation.status,
                explanation.created_at,
                explanation.updated_at
            ],
        )
        .map_err(database_error)?;

        tx.execute(
            "INSERT OR IGNORE INTO user_reading_states
             (id, project_id, explanation_id, state, note, updated_at)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5)",
            params![
                reading_state_id(&project_id, &explanation.id),
                project_id,
                explanation.id,
                explanation.reading_state,
                explanation.updated_at
            ],
        )
        .map_err(database_error)?;
    }

    let explanations = load_explanations(&tx, &project_id, &request.file.id, &snapshot_id)?;
    tx.commit().map_err(database_error)?;

    Ok(HydratedCodeFilePayload {
        explanations,
        database_path: display_path(database_path),
        project_id,
    })
}

fn save_reading_state_at_path(
    database_path: &Path,
    request: SaveReadingStateRequest,
) -> Result<SaveReadingStatePayload, String> {
    let conn = open_database(database_path)?;
    let updated_at = now_timestamp();
    conn.execute(
        "INSERT INTO user_reading_states (id, project_id, explanation_id, state, note, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(project_id, explanation_id) DO UPDATE SET
           state = excluded.state,
           note = excluded.note,
           updated_at = excluded.updated_at",
        params![
            reading_state_id(&request.project_id, &request.explanation_id),
            request.project_id,
            request.explanation_id,
            request.state,
            request.note,
            updated_at
        ],
    )
    .map_err(database_error)?;

    Ok(SaveReadingStatePayload {
        explanation_id: request.explanation_id,
        state: request.state,
        updated_at,
    })
}

fn save_feedback_at_path(
    database_path: &Path,
    request: SaveFeedbackRequest,
) -> Result<SaveFeedbackPayload, String> {
    let conn = open_database(database_path)?;
    let created_at = now_timestamp();
    let id = feedback_id(
        &request.project_id,
        &request.explanation_id,
        &request.feedback_type,
        request.user_note.as_deref(),
        &created_at,
    );

    conn.execute(
        "INSERT INTO explanation_feedback
         (id, project_id, explanation_id, feedback_type, user_note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            request.project_id,
            request.explanation_id,
            request.feedback_type,
            request.user_note,
            created_at
        ],
    )
    .map_err(database_error)?;

    Ok(SaveFeedbackPayload {
        id,
        explanation_id: request.explanation_id,
        feedback_type: request.feedback_type,
        created_at,
    })
}

pub(crate) fn load_model_config(database_path: &Path) -> Result<Option<StoredModelConfig>, String> {
    let conn = open_database(database_path)?;
    let mut statement = conn
        .prepare(
            "SELECT endpoint, model, timeout_seconds, updated_at
             FROM model_provider_settings
             WHERE id = 'default'",
        )
        .map_err(database_error)?;
    let mut rows = statement.query([]).map_err(database_error)?;
    let Some(row) = rows.next().map_err(database_error)? else {
        return Ok(None);
    };
    let timeout_seconds: i64 = row.get(2).map_err(database_error)?;
    Ok(Some(StoredModelConfig {
        endpoint: row.get(0).map_err(database_error)?,
        model: row.get(1).map_err(database_error)?,
        timeout_seconds: usize::try_from(timeout_seconds.max(1))
            .unwrap_or(60)
            .min(300) as u64,
        updated_at: row.get(3).map_err(database_error)?,
    }))
}

pub(crate) fn save_model_config(
    database_path: &Path,
    endpoint: &str,
    model: &str,
    timeout_seconds: u64,
) -> Result<StoredModelConfig, String> {
    let conn = open_database(database_path)?;
    let updated_at = now_timestamp();
    conn.execute(
        "INSERT INTO model_provider_settings
         (id, endpoint, model, timeout_seconds, updated_at)
         VALUES ('default', ?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET
           endpoint = excluded.endpoint,
           model = excluded.model,
           timeout_seconds = excluded.timeout_seconds,
           updated_at = excluded.updated_at",
        params![endpoint, model, timeout_seconds as i64, updated_at],
    )
    .map_err(database_error)?;

    Ok(StoredModelConfig {
        endpoint: endpoint.to_string(),
        model: model.to_string(),
        timeout_seconds,
        updated_at,
    })
}

pub(crate) fn delete_model_config(database_path: &Path) -> Result<(), String> {
    let conn = open_database(database_path)?;
    conn.execute(
        "DELETE FROM model_provider_settings WHERE id = 'default'",
        [],
    )
    .map_err(database_error)?;
    Ok(())
}

pub(crate) fn save_generated_explanation(
    database_path: &Path,
    input: GeneratedExplanationInput,
) -> Result<ExplanationPayload, String> {
    let mut conn = open_database(database_path)?;
    let tx = conn.transaction().map_err(database_error)?;
    let now = now_timestamp();
    let project_id = input.project_id.clone().unwrap_or_else(|| {
        let root = input
            .project_root
            .as_deref()
            .unwrap_or(input.file_path.as_str());
        format!("project:{}", &sha256_hex(root)[..20])
    });
    let project_root = input
        .project_root
        .clone()
        .unwrap_or_else(|| input.file_path.clone());
    let created_at = tx
        .query_row(
            "SELECT created_at FROM explanation_nodes WHERE id = ?1",
            params![input.explanation_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| now.clone());
    let risk_summary = join_notes(Some(&input.risk_notes));
    let depends_on_lines = serialize_line_numbers(&input.depends_on_lines)?;
    let affects_lines = serialize_line_numbers(&input.affects_lines)?;

    tx.execute(
        "INSERT INTO projects (id, root_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(id) DO UPDATE SET root_path = excluded.root_path, updated_at = excluded.updated_at",
        params![project_id, project_root, now],
    )
    .map_err(database_error)?;
    tx.execute(
        "INSERT INTO files
         (id, project_id, path, language, content_hash, last_analyzed_hash, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'valid', ?6)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           path = excluded.path,
           language = excluded.language,
           content_hash = excluded.content_hash,
           last_analyzed_hash = excluded.last_analyzed_hash,
           status = excluded.status,
           updated_at = excluded.updated_at",
        params![
            input.file_id,
            project_id,
            input.file_path,
            input.language,
            input.file_hash,
            now
        ],
    )
    .map_err(database_error)?;
    tx.execute(
        "INSERT OR IGNORE INTO code_snapshots
         (id, project_id, file_id, content_hash, line_count, snapshot_reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'llm_generation', ?6)",
        params![
            input.snapshot_id,
            project_id,
            input.file_id,
            input.file_hash,
            input.line_count as i64,
            now
        ],
    )
    .map_err(database_error)?;

    tx.execute(
        "INSERT INTO explanation_nodes
         (id, project_id, file_id, snapshot_id, code_node_id, explanation_type,
          start_line, end_line, code_level_meaning, local_composition_meaning,
          project_role_meaning, prior_knowledge, risk_summary, learning_note,
          review_suggestion, trust_label, trust_reason, depends_on_lines,
          affects_lines, display_mode, status, schema_version, prompt_version,
          model_info, context_id, context_sources, created_at, updated_at)
         VALUES
         (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
          ?14, ?15, ?16, ?17, ?18, ?19, ?20, 'valid', ?21, ?22, ?23,
          ?24, ?25, ?26, ?27)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           file_id = excluded.file_id,
           snapshot_id = excluded.snapshot_id,
           code_node_id = excluded.code_node_id,
           explanation_type = excluded.explanation_type,
           start_line = excluded.start_line,
           end_line = excluded.end_line,
           code_level_meaning = excluded.code_level_meaning,
           local_composition_meaning = excluded.local_composition_meaning,
           project_role_meaning = excluded.project_role_meaning,
           prior_knowledge = excluded.prior_knowledge,
           risk_summary = excluded.risk_summary,
           learning_note = excluded.learning_note,
           review_suggestion = excluded.review_suggestion,
           trust_label = excluded.trust_label,
           trust_reason = excluded.trust_reason,
           depends_on_lines = excluded.depends_on_lines,
           affects_lines = excluded.affects_lines,
           display_mode = excluded.display_mode,
           status = excluded.status,
           schema_version = excluded.schema_version,
           prompt_version = excluded.prompt_version,
           model_info = excluded.model_info,
           context_id = excluded.context_id,
           context_sources = excluded.context_sources,
           updated_at = excluded.updated_at",
        params![
            input.explanation_id,
            project_id,
            input.file_id,
            input.snapshot_id,
            input.code_node_id,
            input.target_type,
            input.start_line as i64,
            input.end_line as i64,
            input.code_level_meaning,
            input.local_composition_meaning,
            input.project_role_meaning,
            input.prior_knowledge,
            risk_summary,
            input.learning_note,
            input.review_suggestion,
            input.trust_label,
            input.trust_reason,
            depends_on_lines,
            affects_lines,
            input.display_mode,
            SCHEMA_VERSION,
            input.prompt_version,
            input.model_info,
            input.context_id,
            input.context_sources,
            created_at,
            now
        ],
    )
    .map_err(database_error)?;

    let target_id = format!("target:{}", input.explanation_id);
    tx.execute(
        "INSERT INTO explanation_targets
         (id, project_id, explanation_id, target_type, file_id, file_path, file_hash,
          snapshot_id, code_node_id, symbol_id, start_line, end_line, code_hash,
          ast_hash, anchor_text, status, created_at, updated_at)
         VALUES
         (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
          ?13, ?14, 'valid', ?15, ?16)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           explanation_id = excluded.explanation_id,
           target_type = excluded.target_type,
           file_id = excluded.file_id,
           file_path = excluded.file_path,
           file_hash = excluded.file_hash,
           snapshot_id = excluded.snapshot_id,
           code_node_id = excluded.code_node_id,
           symbol_id = excluded.symbol_id,
           start_line = excluded.start_line,
           end_line = excluded.end_line,
           code_hash = excluded.code_hash,
           ast_hash = excluded.ast_hash,
           anchor_text = excluded.anchor_text,
           status = excluded.status,
           updated_at = excluded.updated_at",
        params![
            target_id,
            project_id,
            input.explanation_id,
            input.target_type,
            input.file_id,
            input.file_path,
            input.file_hash,
            input.snapshot_id,
            input.code_node_id,
            input.symbol_id,
            input.start_line as i64,
            input.end_line as i64,
            input.code_hash,
            input.anchor_text,
            created_at,
            now
        ],
    )
    .map_err(database_error)?;

    tx.execute(
        "INSERT OR IGNORE INTO user_reading_states
         (id, project_id, explanation_id, state, note, updated_at)
         VALUES (?1, ?2, ?3, 'unread', NULL, ?4)",
        params![
            reading_state_id(&project_id, &input.explanation_id),
            project_id,
            input.explanation_id,
            now
        ],
    )
    .map_err(database_error)?;

    let reading_state = tx
        .query_row(
            "SELECT state FROM user_reading_states
             WHERE project_id = ?1 AND explanation_id = ?2",
            params![project_id, input.explanation_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "unread".to_string());
    tx.commit().map_err(database_error)?;

    Ok(ExplanationPayload {
        id: input.explanation_id,
        file_path: input.file_path,
        file_hash: Some(input.file_hash),
        target_type: input.target_type,
        target_name: input.target_name,
        start_line: Some(input.start_line),
        end_line: Some(input.end_line),
        symbol_id: input.symbol_id,
        code_hash: Some(input.code_hash),
        anchor_text: Some(input.anchor_text),
        code_meaning: input.code_level_meaning,
        local_meaning: Some(input.local_composition_meaning),
        global_meaning: Some(input.project_role_meaning),
        prior_knowledge: input.prior_knowledge,
        review_suggestion: input.review_suggestion,
        trust_label: Some(input.trust_label),
        trust_reason: Some(input.trust_reason),
        depends_on_lines: input.depends_on_lines,
        affects_lines: input.affects_lines,
        risk_notes: input.risk_notes,
        reader_notes: input.learning_note.into_iter().collect(),
        status: "valid".to_string(),
        reading_state,
        created_at,
        updated_at: now,
    })
}

fn load_explanations(
    conn: &Connection,
    project_id: &str,
    file_id: &str,
    snapshot_id: &str,
) -> Result<Vec<ExplanationPayload>, String> {
    let mut statement = conn
        .prepare(
            "SELECT
               e.id,
               t.file_path,
               t.file_hash,
               t.target_type,
               n.symbol_name,
               t.start_line,
               t.end_line,
               t.symbol_id,
               t.code_hash,
               t.anchor_text,
               e.code_level_meaning,
               e.local_composition_meaning,
               e.project_role_meaning,
               e.prior_knowledge,
               e.risk_summary,
               e.learning_note,
               e.review_suggestion,
               e.trust_label,
               e.trust_reason,
               e.depends_on_lines,
               e.affects_lines,
               t.status,
               COALESCE(s.state, 'unread') AS reading_state,
               e.created_at,
               e.updated_at
             FROM explanation_nodes e
             JOIN explanation_targets t ON t.explanation_id = e.id AND t.project_id = e.project_id
             LEFT JOIN code_nodes n ON n.id = e.code_node_id
             LEFT JOIN user_reading_states s
               ON s.project_id = e.project_id AND s.explanation_id = e.id
             WHERE e.project_id = ?1 AND e.file_id = ?2 AND e.snapshot_id = ?3
             ORDER BY
               CASE t.target_type
                 WHEN 'file' THEN 0
                 WHEN 'import' THEN 1
                 WHEN 'export' THEN 2
                 WHEN 'class' THEN 3
                 WHEN 'function' THEN 4
                 WHEN 'block' THEN 5
                 WHEN 'range' THEN 6
                 WHEN 'line' THEN 7
                 ELSE 8
               END,
               COALESCE(t.start_line, 0),
               COALESCE(t.end_line, 0)",
        )
        .map_err(database_error)?;

    let rows = statement
        .query_map(params![project_id, file_id, snapshot_id], |row| {
            let risk_summary: Option<String> = row.get(14)?;
            let learning_note: Option<String> = row.get(15)?;
            let depends_on_lines: Option<String> = row.get(19)?;
            let affects_lines: Option<String> = row.get(20)?;
            Ok(ExplanationPayload {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                target_type: row.get(3)?,
                target_name: row.get(4)?,
                start_line: optional_i64_to_usize(row.get(5)?),
                end_line: optional_i64_to_usize(row.get(6)?),
                symbol_id: row.get(7)?,
                code_hash: row.get(8)?,
                anchor_text: row.get(9)?,
                code_meaning: row.get(10)?,
                local_meaning: row.get(11)?,
                global_meaning: row.get(12)?,
                prior_knowledge: row.get(13)?,
                review_suggestion: row.get(16)?,
                trust_label: row.get(17)?,
                trust_reason: row.get(18)?,
                depends_on_lines: parse_line_numbers(depends_on_lines),
                affects_lines: parse_line_numbers(affects_lines),
                risk_notes: split_notes(risk_summary),
                reader_notes: split_notes(learning_note),
                status: row.get(21)?,
                reading_state: row.get(22)?,
                created_at: row.get(23)?,
                updated_at: row.get(24)?,
            })
        })
        .map_err(database_error)?;

    let mut explanations = Vec::new();
    for row in rows {
        explanations.push(row.map_err(database_error)?);
    }
    Ok(explanations)
}

fn open_database(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create database directory: {error}"))?;
    }
    let conn = Connection::open(path).map_err(database_error)?;
    initialize_schema(&conn)?;
    Ok(conn)
}

fn initialize_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          root_path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          path TEXT NOT NULL,
          language TEXT,
          content_hash TEXT NOT NULL,
          last_analyzed_hash TEXT,
          status TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS code_snapshots (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          line_count INTEGER NOT NULL,
          snapshot_reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS code_nodes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          node_type TEXT NOT NULL,
          symbol_name TEXT,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          ast_hash TEXT,
          code_hash TEXT,
          parent_node_id TEXT
        );

        CREATE TABLE IF NOT EXISTS explanation_nodes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          snapshot_id TEXT NOT NULL,
          code_node_id TEXT,
          explanation_type TEXT NOT NULL,
          start_line INTEGER,
          end_line INTEGER,
          code_level_meaning TEXT,
          local_composition_meaning TEXT,
          project_role_meaning TEXT,
          surface_meaning TEXT,
          actual_meaning TEXT,
          relational_meaning TEXT,
          global_role TEXT,
          prior_knowledge TEXT,
          risk_summary TEXT,
          learning_note TEXT,
          review_suggestion TEXT,
          trust_label TEXT,
          trust_reason TEXT,
          raw_confidence REAL,
          depends_on_lines TEXT,
          affects_lines TEXT,
          display_mode TEXT,
          status TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          model_info TEXT,
          context_id TEXT,
          context_sources TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS explanation_targets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          explanation_id TEXT NOT NULL,
          target_type TEXT NOT NULL,
          file_id TEXT,
          file_path TEXT,
          file_hash TEXT,
          snapshot_id TEXT,
          code_node_id TEXT,
          symbol_id TEXT,
          start_line INTEGER,
          end_line INTEGER,
          code_hash TEXT,
          ast_hash TEXT,
          anchor_text TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS explanation_feedback (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          explanation_id TEXT NOT NULL,
          feedback_type TEXT NOT NULL,
          user_note TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_reading_states (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          explanation_id TEXT NOT NULL,
          state TEXT NOT NULL,
          note TEXT,
          updated_at TEXT NOT NULL,
          UNIQUE(project_id, explanation_id)
        );

        CREATE TABLE IF NOT EXISTS change_records (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          before_snapshot_id TEXT,
          after_snapshot_id TEXT NOT NULL,
          added_lines INTEGER,
          modified_lines INTEGER,
          deleted_lines INTEGER,
          added_nodes INTEGER,
          modified_nodes INTEGER,
          deleted_nodes INTEGER,
          summary TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS model_provider_settings (
          id TEXT PRIMARY KEY,
          endpoint TEXT NOT NULL,
          model TEXT NOT NULL,
          timeout_seconds INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_explanation_nodes_file
          ON explanation_nodes(project_id, file_id, snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_explanation_targets_explanation
          ON explanation_targets(project_id, explanation_id);
        CREATE INDEX IF NOT EXISTS idx_reading_states_explanation
          ON user_reading_states(project_id, explanation_id);
        ",
    )
    .map_err(database_error)?;

    ensure_column(conn, "explanation_nodes", "depends_on_lines", "TEXT")?;
    ensure_column(conn, "explanation_nodes", "affects_lines", "TEXT")?;
    ensure_column(conn, "explanation_nodes", "context_id", "TEXT")?;
    ensure_column(conn, "explanation_nodes", "context_sources", "TEXT")?;
    Ok(())
}

#[cfg(not(test))]
pub(crate) fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve CodeReader data directory: {error}"))?;
    Ok(app_data_dir.join(DATABASE_FILE_NAME))
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(database_error)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(database_error)?;
    for existing in columns {
        if existing.map_err(database_error)? == column {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )
    .map_err(database_error)?;
    Ok(())
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

fn code_node_id_for(explanation: &ExplanationInput, nodes: &[CodeNodeInput]) -> Option<String> {
    let maybe_embedded_id = explanation.id.strip_prefix("exp:");
    if let Some(node_id) = maybe_embedded_id {
        if nodes.iter().any(|node| node.id == node_id) {
            return Some(node_id.to_string());
        }
    }

    nodes
        .iter()
        .find(|node| {
            node.node_type == explanation.target_type
                && Some(node.start_line) == explanation.start_line
                && Some(node.end_line) == explanation.end_line
                && explanation
                    .code_hash
                    .as_deref()
                    .map(|hash| hash == node.code_hash)
                    .unwrap_or(true)
        })
        .map(|node| node.id.clone())
}

fn reading_state_id(project_id: &str, explanation_id: &str) -> String {
    format!(
        "reading:{}",
        &sha256_hex(&format!("{project_id}:{explanation_id}"))[..24]
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
                    },
                    CodeNodeInput {
                        id: "target:sample:function".to_string(),
                        node_type: "function".to_string(),
                        name: "loginUser".to_string(),
                        start_line: 1,
                        end_line: 3,
                        code_hash: "hash:function".to_string(),
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
