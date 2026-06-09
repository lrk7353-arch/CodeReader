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
    id: String,
    file_path: String,
    file_hash: Option<String>,
    target_type: String,
    target_name: Option<String>,
    start_line: Option<usize>,
    end_line: Option<usize>,
    symbol_id: Option<String>,
    code_hash: Option<String>,
    anchor_text: Option<String>,
    code_meaning: String,
    local_meaning: Option<String>,
    global_meaning: Option<String>,
    risk_notes: Vec<String>,
    reader_notes: Vec<String>,
    status: String,
    reading_state: String,
    created_at: String,
    updated_at: String,
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
               status = excluded.status,
               updated_at = excluded.updated_at",
            params![
                target_id,
                project_id,
                explanation.id,
                explanation.target_type,
                request.file.id,
                explanation.file_path,
                explanation.file_hash.clone().or_else(|| Some(file_hash.clone())),
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
               e.risk_summary,
               e.learning_note,
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
            let risk_summary: Option<String> = row.get(13)?;
            let learning_note: Option<String> = row.get(14)?;
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
                risk_notes: split_notes(risk_summary),
                reader_notes: split_notes(learning_note),
                status: row.get(15)?,
                reading_state: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
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
          display_mode TEXT,
          status TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          model_info TEXT,
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

        CREATE INDEX IF NOT EXISTS idx_explanation_nodes_file
          ON explanation_nodes(project_id, file_id, snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_explanation_targets_explanation
          ON explanation_targets(project_id, explanation_id);
        CREATE INDEX IF NOT EXISTS idx_reading_states_explanation
          ON user_reading_states(project_id, explanation_id);
        ",
    )
    .map_err(database_error)
}

#[cfg(not(test))]
fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
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
        hydrate_code_file_at_path(&database_path, sample_request()).expect("hydrate should prepare DB");
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
