#[cfg(not(test))]
use crate::app_error::AppError;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(not(test))]
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReadingStateRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) state: String,
    pub(super) note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReadingStatePayload {
    pub(super) explanation_id: String,
    pub(super) state: String,
    pub(super) updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFeedbackRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) feedback_type: String,
    pub(super) user_note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFeedbackPayload {
    pub(super) id: String,
    pub(super) explanation_id: String,
    pub(super) feedback_type: String,
    pub(super) created_at: String,
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_reading_state(
    app: AppHandle,
    request: SaveReadingStateRequest,
) -> Result<SaveReadingStatePayload, AppError> {
    let database_path = super::database_path(&app).map_err(AppError::database)?;
    save_reading_state_at_path(&database_path, request).map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_explanation_feedback(
    app: AppHandle,
    request: SaveFeedbackRequest,
) -> Result<SaveFeedbackPayload, AppError> {
    let database_path = super::database_path(&app).map_err(AppError::database)?;
    save_feedback_at_path(&database_path, request).map_err(AppError::database)
}

pub(crate) fn save_reading_state_at_path(
    database_path: &Path,
    request: SaveReadingStateRequest,
) -> Result<SaveReadingStatePayload, String> {
    let conn = super::open_database(database_path)?;
    let updated_at = super::now_timestamp();
    conn.execute(
        "INSERT INTO user_reading_states (id, project_id, explanation_id, state, note, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(project_id, explanation_id) DO UPDATE SET
           state = excluded.state,
           note = excluded.note,
           updated_at = excluded.updated_at",
        params![
            super::reading_state_id(&request.project_id, &request.explanation_id),
            request.project_id,
            request.explanation_id,
            request.state,
            request.note,
            updated_at
        ],
    )
    .map_err(super::database_error)?;

    Ok(SaveReadingStatePayload {
        explanation_id: request.explanation_id,
        state: request.state,
        updated_at,
    })
}

pub(crate) fn save_feedback_at_path(
    database_path: &Path,
    request: SaveFeedbackRequest,
) -> Result<SaveFeedbackPayload, String> {
    let conn = super::open_database(database_path)?;
    let created_at = super::now_timestamp();
    let id = super::feedback_id(
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
    .map_err(super::database_error)?;

    Ok(SaveFeedbackPayload {
        id,
        explanation_id: request.explanation_id,
        feedback_type: request.feedback_type,
        created_at,
    })
}
