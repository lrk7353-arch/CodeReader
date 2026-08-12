#[cfg(not(test))]
use crate::app_error::AppError;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(not(test))]
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReaderResumeStateRequest {
    pub project_id: String,
    pub file_id: Option<String>,
    pub explanation_id: Option<String>,
    pub selection_start_line: Option<i64>,
    pub selection_end_line: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderResumeStatePayload {
    pub project_id: String,
    pub file_id: Option<String>,
    pub explanation_id: Option<String>,
    pub selection_start_line: Option<i64>,
    pub selection_end_line: Option<i64>,
    pub updated_at: String,
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_reader_resume_state(
    app: AppHandle,
    request: SaveReaderResumeStateRequest,
) -> Result<ReaderResumeStatePayload, AppError> {
    save_reader_resume_state_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn load_reader_resume_state(
    app: AppHandle,
) -> Result<Option<ReaderResumeStatePayload>, AppError> {
    load_reader_resume_state_at_path(&super::database_path(&app).map_err(AppError::database)?)
        .map_err(AppError::database)
}

pub(crate) fn save_reader_resume_state_at_path(
    database_path: &Path,
    request: SaveReaderResumeStateRequest,
) -> Result<ReaderResumeStatePayload, String> {
    validate_opaque_id("projectId", &request.project_id)?;
    if let Some(value) = request.file_id.as_deref() {
        validate_opaque_id("fileId", value)?;
    }
    if let Some(value) = request.explanation_id.as_deref() {
        validate_opaque_id("explanationId", value)?;
    }
    match (request.selection_start_line, request.selection_end_line) {
        (None, None) => {}
        (Some(start), Some(end)) if start >= 1 && end >= start => {}
        _ => return Err("Resume selection must contain a valid inclusive line range.".to_string()),
    }

    let conn = super::open_database(database_path)?;
    let updated_at = super::now_timestamp();
    conn.execute(
        "INSERT INTO reader_resume_state
           (slot, project_id, file_id, explanation_id, selection_start_line, selection_end_line, updated_at)
         VALUES ('current', ?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(slot) DO UPDATE SET
           project_id = excluded.project_id,
           file_id = excluded.file_id,
           explanation_id = excluded.explanation_id,
           selection_start_line = excluded.selection_start_line,
           selection_end_line = excluded.selection_end_line,
           updated_at = excluded.updated_at",
        params![
            request.project_id,
            request.file_id,
            request.explanation_id,
            request.selection_start_line,
            request.selection_end_line,
            updated_at
        ],
    )
    .map_err(super::database_error)?;
    load_reader_resume_state_with_connection(&conn)?
        .ok_or_else(|| "Reader resume state was not available after a successful save.".to_string())
}

pub(crate) fn load_reader_resume_state_at_path(
    database_path: &Path,
) -> Result<Option<ReaderResumeStatePayload>, String> {
    let conn = super::open_database(database_path)?;
    load_reader_resume_state_with_connection(&conn)
}

fn load_reader_resume_state_with_connection(
    conn: &rusqlite::Connection,
) -> Result<Option<ReaderResumeStatePayload>, String> {
    conn.query_row(
        "SELECT project_id, file_id, explanation_id, selection_start_line,
                selection_end_line, updated_at
         FROM reader_resume_state WHERE slot = 'current'",
        [],
        |row| {
            Ok(ReaderResumeStatePayload {
                project_id: row.get(0)?,
                file_id: row.get(1)?,
                explanation_id: row.get(2)?,
                selection_start_line: row.get(3)?,
                selection_end_line: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(super::database_error)
}

fn validate_opaque_id(label: &str, value: &str) -> Result<(), String> {
    let value = value.trim();
    let looks_like_windows_path = value.len() >= 3
        && value.as_bytes()[0].is_ascii_alphabetic()
        && value.as_bytes()[1] == b':'
        && matches!(value.as_bytes()[2], b'/' | b'\\');
    if value.is_empty()
        || value.len() > 512
        || value.contains('\0')
        || value.contains('/')
        || value.contains('\\')
        || looks_like_windows_path
    {
        return Err(format!(
            "{label} must be an opaque identifier, not a filesystem path."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_database(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "codereader-{name}-{}-{}.sqlite",
            std::process::id(),
            super::super::now_timestamp().replace([':', '-'], "")
        ))
    }

    #[test]
    fn resume_state_survives_reopen_without_persisting_paths() {
        let path = test_database("resume-reopen");
        save_reader_resume_state_at_path(
            &path,
            SaveReaderResumeStateRequest {
                project_id: "project:abc".into(),
                file_id: Some("file:def".into()),
                explanation_id: Some("explanation:ghi".into()),
                selection_start_line: Some(4),
                selection_end_line: Some(7),
            },
        )
        .unwrap();
        let loaded = load_reader_resume_state_at_path(&path).unwrap().unwrap();
        assert_eq!(loaded.project_id, "project:abc");
        assert_eq!(loaded.selection_end_line, Some(7));
        let conn = super::super::open_database(&path).unwrap();
        let columns = conn
            .prepare("PRAGMA table_info(reader_resume_state)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(!columns.iter().any(|column| {
            column.contains("path") || column.contains("grant") || column.contains("permission")
        }));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn resume_state_rejects_absolute_paths_and_invalid_ranges() {
        let path = test_database("resume-validation");
        let error = save_reader_resume_state_at_path(
            &path,
            SaveReaderResumeStateRequest {
                project_id: "/home/user/private".into(),
                file_id: None,
                explanation_id: None,
                selection_start_line: Some(8),
                selection_end_line: Some(2),
            },
        )
        .unwrap_err();
        assert!(error.contains("opaque identifier"));
    }
}
