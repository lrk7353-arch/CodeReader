#[cfg(not(test))]
use crate::app_error::AppError;
use rusqlite::{params, OptionalExtension};
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReadingStatePayload {
    pub(super) explanation_id: String,
    pub(super) state: String,
    pub(super) updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCognitionStateRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) visit_state: String,
    pub(super) mastery_state: String,
    pub(super) review_state: String,
    pub(super) expected_revision: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCognitionStatePayload {
    pub(super) explanation_id: String,
    pub(super) visit_state: String,
    pub(super) mastery_state: String,
    pub(super) review_state: String,
    pub(super) state: String,
    pub(super) revision: i64,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserAnnotationRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) kind: String,
    pub(super) body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserAnnotationRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) id: String,
    pub(super) kind: String,
    pub(super) body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteUserAnnotationRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReaderPreferenceRequest {
    pub(super) project_id: String,
    pub(super) display_mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteReaderPreferenceRequest {
    pub(super) project_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRelatedTargetRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) related_explanation_id: String,
    pub(super) relation_kind: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRelatedTargetRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) id: String,
    pub(super) related_explanation_id: String,
    pub(super) relation_kind: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteRelatedTargetRequest {
    pub(super) project_id: String,
    pub(super) explanation_id: String,
    pub(super) id: String,
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

#[cfg(not(test))]
#[tauri::command]
pub fn save_cognition_state(
    app: AppHandle,
    request: SaveCognitionStateRequest,
) -> Result<SaveCognitionStatePayload, AppError> {
    let database_path = super::database_path(&app).map_err(AppError::database)?;
    save_cognition_state_at_path(&database_path, request).map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn create_user_annotation(
    app: AppHandle,
    request: CreateUserAnnotationRequest,
) -> Result<super::UserAnnotationPayload, AppError> {
    create_user_annotation_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn update_user_annotation(
    app: AppHandle,
    request: UpdateUserAnnotationRequest,
) -> Result<super::UserAnnotationPayload, AppError> {
    update_user_annotation_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn delete_user_annotation(
    app: AppHandle,
    request: DeleteUserAnnotationRequest,
) -> Result<(), AppError> {
    delete_user_annotation_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_reader_preference(
    app: AppHandle,
    request: SaveReaderPreferenceRequest,
) -> Result<super::ReaderPreferencePayload, AppError> {
    save_reader_preference_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn delete_reader_preference(
    app: AppHandle,
    request: DeleteReaderPreferenceRequest,
) -> Result<(), AppError> {
    delete_reader_preference_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn create_related_target(
    app: AppHandle,
    request: CreateRelatedTargetRequest,
) -> Result<super::RelatedTargetPayload, AppError> {
    create_related_target_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn update_related_target(
    app: AppHandle,
    request: UpdateRelatedTargetRequest,
) -> Result<super::RelatedTargetPayload, AppError> {
    update_related_target_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn delete_related_target(
    app: AppHandle,
    request: DeleteRelatedTargetRequest,
) -> Result<(), AppError> {
    delete_related_target_at_path(
        &super::database_path(&app).map_err(AppError::database)?,
        request,
    )
    .map_err(AppError::database)
}

pub(crate) fn save_cognition_state_at_path(
    database_path: &Path,
    request: SaveCognitionStateRequest,
) -> Result<SaveCognitionStatePayload, String> {
    if !matches!(request.visit_state.as_str(), "unread" | "read")
        || !matches!(request.mastery_state.as_str(), "unconfirmed" | "understood")
        || !matches!(request.review_state.as_str(), "current" | "needs_review")
    {
        return Err("Invalid cognition state.".to_string());
    }
    let mut conn = super::open_database(database_path)?;
    let updated_at = super::now_timestamp();
    let transaction = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&transaction, &request.project_id, &request.explanation_id)?;
    let current_revision = transaction
        .query_row(
            "SELECT revision FROM user_reading_states WHERE project_id = ?1 AND explanation_id = ?2",
            params![request.project_id, request.explanation_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(super::database_error)?;
    if request.expected_revision.is_some() && request.expected_revision != current_revision {
        return Err(
            "Cognition state is stale; reload the current target before saving.".to_string(),
        );
    }
    let state = legacy_projection_with_annotations(
        &transaction,
        &request.project_id,
        &request.explanation_id,
        &request.visit_state,
        &request.mastery_state,
        &request.review_state,
    )?;
    let revision = current_revision.unwrap_or(-1) + 1;
    transaction.execute(
        "INSERT INTO user_reading_states (id, project_id, explanation_id, state, visit_state, mastery_state, review_state, revision, note, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9)
         ON CONFLICT(project_id, explanation_id) DO UPDATE SET state = excluded.state, visit_state = excluded.visit_state, mastery_state = excluded.mastery_state, review_state = excluded.review_state, revision = excluded.revision, updated_at = excluded.updated_at",
        params![super::reading_state_id(&request.project_id, &request.explanation_id), request.project_id, request.explanation_id, state, request.visit_state, request.mastery_state, request.review_state, revision, updated_at],
    ).map_err(super::database_error)?;
    transaction.commit().map_err(super::database_error)?;
    Ok(SaveCognitionStatePayload {
        explanation_id: request.explanation_id,
        visit_state: request.visit_state,
        mastery_state: request.mastery_state,
        review_state: request.review_state,
        state,
        revision,
        updated_at,
    })
}

pub(crate) fn save_reading_state_at_path(
    database_path: &Path,
    request: SaveReadingStateRequest,
) -> Result<SaveReadingStatePayload, String> {
    let mut conn = super::open_database(database_path)?;
    let updated_at = super::now_timestamp();
    let (visit_state, mastery_state, review_state) = cognition_from_legacy(&request.state);
    let transaction = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&transaction, &request.project_id, &request.explanation_id)?;
    ensure_legacy_annotations(&transaction, &request, &updated_at)?;
    let state = legacy_projection_with_annotations(
        &transaction,
        &request.project_id,
        &request.explanation_id,
        visit_state,
        mastery_state,
        review_state,
    )?;
    transaction.execute(
        "INSERT INTO user_reading_states (id, project_id, explanation_id, state, visit_state, mastery_state, review_state, revision, note, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)
         ON CONFLICT(project_id, explanation_id) DO UPDATE SET
           state = excluded.state,
           visit_state = excluded.visit_state, mastery_state = excluded.mastery_state, review_state = excluded.review_state,
           revision = user_reading_states.revision + 1, note = excluded.note,
           updated_at = excluded.updated_at",
        params![
            super::reading_state_id(&request.project_id, &request.explanation_id),
            request.project_id,
            request.explanation_id,
            state,
            visit_state,
            mastery_state,
            review_state,
            request.note,
            updated_at
        ],
    ).map_err(super::database_error)?;
    transaction.commit().map_err(super::database_error)?;

    Ok(SaveReadingStatePayload {
        explanation_id: request.explanation_id,
        state,
        updated_at,
    })
}

fn cognition_from_legacy(state: &str) -> (&'static str, &'static str, &'static str) {
    match state {
        "unread" => ("unread", "unconfirmed", "current"),
        "understood" => ("read", "understood", "current"),
        "needs_reexplain" => ("read", "unconfirmed", "needs_review"),
        _ => ("read", "unconfirmed", "current"),
    }
}

fn legacy_projection(visit: &str, mastery: &str, review: &str) -> String {
    if review == "needs_review" {
        "needs_reexplain"
    } else if mastery == "understood" {
        "understood"
    } else if visit == "read" {
        "read"
    } else {
        "unread"
    }
    .to_string()
}

fn legacy_projection_with_annotations(
    conn: &rusqlite::Connection,
    project_id: &str,
    explanation_id: &str,
    visit: &str,
    mastery: &str,
    review: &str,
) -> Result<String, String> {
    let marker: Option<String> = conn
        .query_row(
            "SELECT kind FROM user_annotations
             WHERE project_id = ?1 AND explanation_id = ?2
               AND id LIKE 'annotation:legacy-state:%'
               AND kind IN ('question', 'risk')
             ORDER BY CASE kind WHEN 'risk' THEN 0 ELSE 1 END LIMIT 1",
            params![project_id, explanation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(super::database_error)?;
    Ok(match marker.as_deref() {
        Some("risk") => "suspicious".to_string(),
        Some("question") => "questioned".to_string(),
        _ => legacy_projection(visit, mastery, review),
    })
}

fn ensure_legacy_annotations(
    conn: &rusqlite::Connection,
    request: &SaveReadingStateRequest,
    updated_at: &str,
) -> Result<(), String> {
    let marker = match request.state.as_str() {
        "questioned" => Some("question"),
        "suspicious" => Some("risk"),
        _ => None,
    };
    if let Some(kind) = marker {
        conn.execute(
            "DELETE FROM user_annotations
             WHERE project_id = ?1 AND explanation_id = ?2
               AND id LIKE 'annotation:legacy-state:%' AND kind <> ?3",
            params![request.project_id, request.explanation_id, kind],
        )
        .map_err(super::database_error)?;
        conn.execute(
            "INSERT INTO user_annotations (id, project_id, explanation_id, kind, body, created_at, updated_at)
             SELECT ?1, ?2, ?3, ?4, '', ?5, ?5
             WHERE NOT EXISTS (
               SELECT 1 FROM user_annotations
               WHERE project_id = ?2 AND explanation_id = ?3 AND kind = ?4
                 AND id LIKE 'annotation:legacy-state:%'
             )",
            params![format!("annotation:legacy-state:{}:{kind}", super::reading_state_id(&request.project_id, &request.explanation_id)), request.project_id, request.explanation_id, kind, updated_at],
        ).map_err(super::database_error)?;
    } else {
        conn.execute(
            "DELETE FROM user_annotations
             WHERE project_id = ?1 AND explanation_id = ?2
               AND id LIKE 'annotation:legacy-state:%'",
            params![request.project_id, request.explanation_id],
        )
        .map_err(super::database_error)?;
    }
    if let Some(note) = request
        .note
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        conn.execute(
            "INSERT INTO user_annotations (id, project_id, explanation_id, kind, body, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'note', ?4, ?5, ?5)
             ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
            params![format!("annotation:legacy-note:{}", super::reading_state_id(&request.project_id, &request.explanation_id)), request.project_id, request.explanation_id, note, updated_at],
        ).map_err(super::database_error)?;
    }
    Ok(())
}

pub(crate) fn create_user_annotation_at_path(
    database_path: &Path,
    request: CreateUserAnnotationRequest,
) -> Result<super::UserAnnotationPayload, String> {
    validate_annotation(&request.kind, &request.body)?;
    let mut conn = super::open_database(database_path)?;
    let now = super::now_timestamp();
    let tx = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&tx, &request.project_id, &request.explanation_id)?;
    let id = format!(
        "annotation:{}",
        &crate::utils::sha256_hex(&format!(
            "{}:{}:{}:{}:{}",
            request.project_id, request.explanation_id, request.kind, request.body, now
        ))[..24]
    );
    tx.execute(
        "INSERT INTO user_annotations (id, project_id, explanation_id, kind, body, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, request.project_id, request.explanation_id, request.kind, request.body, now],
    )
    .map_err(super::database_error)?;
    refresh_legacy_projection(&tx, &request.project_id, &request.explanation_id, &now)?;
    tx.commit().map_err(super::database_error)?;
    Ok(super::UserAnnotationPayload {
        id,
        project_id: request.project_id,
        explanation_id: request.explanation_id,
        kind: request.kind,
        body: request.body,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub(crate) fn update_user_annotation_at_path(
    database_path: &Path,
    request: UpdateUserAnnotationRequest,
) -> Result<super::UserAnnotationPayload, String> {
    validate_annotation(&request.kind, &request.body)?;
    let mut conn = super::open_database(database_path)?;
    let now = super::now_timestamp();
    let tx = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&tx, &request.project_id, &request.explanation_id)?;
    let created_at: String = tx.query_row(
        "SELECT created_at FROM user_annotations WHERE id = ?1 AND project_id = ?2 AND explanation_id = ?3",
        params![request.id, request.project_id, request.explanation_id],
        |row| row.get(0),
    ).optional().map_err(super::database_error)?.ok_or_else(|| "Annotation target does not exist.".to_string())?;
    tx.execute(
        "UPDATE user_annotations SET kind = ?1, body = ?2, updated_at = ?3 WHERE id = ?4 AND project_id = ?5 AND explanation_id = ?6",
        params![request.kind, request.body, now, request.id, request.project_id, request.explanation_id],
    ).map_err(super::database_error)?;
    refresh_legacy_projection(&tx, &request.project_id, &request.explanation_id, &now)?;
    tx.commit().map_err(super::database_error)?;
    Ok(super::UserAnnotationPayload {
        id: request.id,
        project_id: request.project_id,
        explanation_id: request.explanation_id,
        kind: request.kind,
        body: request.body,
        created_at,
        updated_at: now,
    })
}

pub(crate) fn delete_user_annotation_at_path(
    database_path: &Path,
    request: DeleteUserAnnotationRequest,
) -> Result<(), String> {
    let mut conn = super::open_database(database_path)?;
    let now = super::now_timestamp();
    let tx = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&tx, &request.project_id, &request.explanation_id)?;
    if tx.execute(
        "DELETE FROM user_annotations WHERE id = ?1 AND project_id = ?2 AND explanation_id = ?3",
        params![request.id, request.project_id, request.explanation_id],
    ).map_err(super::database_error)? == 0 {
        return Err("Annotation target does not exist.".to_string());
    }
    refresh_legacy_projection(&tx, &request.project_id, &request.explanation_id, &now)?;
    tx.commit().map_err(super::database_error)
}

pub(crate) fn save_reader_preference_at_path(
    database_path: &Path,
    request: SaveReaderPreferenceRequest,
) -> Result<super::ReaderPreferencePayload, String> {
    if !matches!(request.display_mode.as_str(), "plain" | "detailed") {
        return Err("Invalid reader display mode.".to_string());
    }
    let conn = super::open_database(database_path)?;
    let now = super::now_timestamp();
    let project_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
            params![request.project_id],
            |row| row.get(0),
        )
        .map_err(super::database_error)?;
    if !project_exists {
        return Err("Project target does not exist.".to_string());
    }
    conn.execute(
        "INSERT INTO project_reader_preferences (project_id, display_mode, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(project_id) DO UPDATE SET display_mode = excluded.display_mode, updated_at = excluded.updated_at",
        params![request.project_id, request.display_mode, now],
    ).map_err(super::database_error)?;
    Ok(super::ReaderPreferencePayload {
        project_id: request.project_id,
        display_mode: request.display_mode,
        updated_at: now,
    })
}

pub(crate) fn delete_reader_preference_at_path(
    database_path: &Path,
    request: DeleteReaderPreferenceRequest,
) -> Result<(), String> {
    let conn = super::open_database(database_path)?;
    if conn
        .execute(
            "DELETE FROM project_reader_preferences WHERE project_id = ?1",
            params![request.project_id],
        )
        .map_err(super::database_error)?
        == 0
    {
        return Err("Reader preference target does not exist.".to_string());
    }
    Ok(())
}

pub(crate) fn create_related_target_at_path(
    database_path: &Path,
    request: CreateRelatedTargetRequest,
) -> Result<super::RelatedTargetPayload, String> {
    validate_related_target(
        &request.explanation_id,
        &request.related_explanation_id,
        &request.relation_kind,
    )?;
    let mut conn = super::open_database(database_path)?;
    let now = super::now_timestamp();
    let tx = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&tx, &request.project_id, &request.explanation_id)?;
    ensure_explanation_target(&tx, &request.project_id, &request.related_explanation_id)?;
    let id = format!(
        "relation:{}",
        &crate::utils::sha256_hex(&format!(
            "{}:{}:{}:{}:{}",
            request.project_id,
            request.explanation_id,
            request.related_explanation_id,
            request.relation_kind,
            now
        ))[..24]
    );
    tx.execute(
        "INSERT INTO explanation_relationships (id, project_id, explanation_id, related_explanation_id, relation_kind, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, request.project_id, request.explanation_id, request.related_explanation_id, request.relation_kind, now],
    ).map_err(super::database_error)?;
    tx.commit().map_err(super::database_error)?;
    Ok(super::RelatedTargetPayload {
        id,
        project_id: request.project_id,
        explanation_id: request.explanation_id,
        related_explanation_id: request.related_explanation_id,
        relation_kind: request.relation_kind,
        related_file_id: None,
        related_target_type: None,
        related_target_name: None,
        related_start_line: None,
        related_end_line: None,
        related_status: None,
        created_at: now,
    })
}

pub(crate) fn update_related_target_at_path(
    database_path: &Path,
    request: UpdateRelatedTargetRequest,
) -> Result<super::RelatedTargetPayload, String> {
    validate_related_target(
        &request.explanation_id,
        &request.related_explanation_id,
        &request.relation_kind,
    )?;
    let mut conn = super::open_database(database_path)?;
    let tx = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&tx, &request.project_id, &request.explanation_id)?;
    ensure_explanation_target(&tx, &request.project_id, &request.related_explanation_id)?;
    let created_at: String = tx.query_row(
        "SELECT created_at FROM explanation_relationships WHERE id = ?1 AND project_id = ?2 AND explanation_id = ?3",
        params![request.id, request.project_id, request.explanation_id], |row| row.get(0)
    ).optional().map_err(super::database_error)?.ok_or_else(|| "Related target does not exist.".to_string())?;
    tx.execute(
        "UPDATE explanation_relationships SET related_explanation_id = ?1, relation_kind = ?2 WHERE id = ?3 AND project_id = ?4 AND explanation_id = ?5",
        params![request.related_explanation_id, request.relation_kind, request.id, request.project_id, request.explanation_id],
    ).map_err(super::database_error)?;
    tx.commit().map_err(super::database_error)?;
    Ok(super::RelatedTargetPayload {
        id: request.id,
        project_id: request.project_id,
        explanation_id: request.explanation_id,
        related_explanation_id: request.related_explanation_id,
        relation_kind: request.relation_kind,
        related_file_id: None,
        related_target_type: None,
        related_target_name: None,
        related_start_line: None,
        related_end_line: None,
        related_status: None,
        created_at,
    })
}

pub(crate) fn delete_related_target_at_path(
    database_path: &Path,
    request: DeleteRelatedTargetRequest,
) -> Result<(), String> {
    let mut conn = super::open_database(database_path)?;
    let tx = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&tx, &request.project_id, &request.explanation_id)?;
    if tx.execute("DELETE FROM explanation_relationships WHERE id = ?1 AND project_id = ?2 AND explanation_id = ?3", params![request.id, request.project_id, request.explanation_id]).map_err(super::database_error)? == 0 {
        return Err("Related target does not exist.".to_string());
    }
    tx.commit().map_err(super::database_error)
}

fn validate_annotation(kind: &str, body: &str) -> Result<(), String> {
    if !matches!(kind, "note" | "question" | "risk") || body.trim().is_empty() {
        return Err("Invalid annotation.".to_string());
    }
    Ok(())
}

fn validate_related_target(
    explanation_id: &str,
    related_explanation_id: &str,
    relation_kind: &str,
) -> Result<(), String> {
    if explanation_id == related_explanation_id || relation_kind.trim().is_empty() {
        return Err("Invalid related target.".to_string());
    }
    Ok(())
}

fn ensure_explanation_target(
    conn: &rusqlite::Connection,
    project_id: &str,
    explanation_id: &str,
) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM explanation_nodes WHERE project_id = ?1 AND id = ?2)",
            params![project_id, explanation_id],
            |row| row.get(0),
        )
        .map_err(super::database_error)?;
    if exists {
        Ok(())
    } else {
        Err("Explanation target does not exist in this project.".to_string())
    }
}

fn refresh_legacy_projection(
    conn: &rusqlite::Connection,
    project_id: &str,
    explanation_id: &str,
    updated_at: &str,
) -> Result<(), String> {
    let cognition = conn.query_row(
        "SELECT visit_state, mastery_state, review_state FROM user_reading_states WHERE project_id = ?1 AND explanation_id = ?2",
        params![project_id, explanation_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    ).optional().map_err(super::database_error)?.unwrap_or_else(|| ("unread".to_string(), "unconfirmed".to_string(), "current".to_string()));
    let state = legacy_projection_with_annotations(
        conn,
        project_id,
        explanation_id,
        &cognition.0,
        &cognition.1,
        &cognition.2,
    )?;
    conn.execute(
        "UPDATE user_reading_states SET state = ?1, updated_at = ?2 WHERE project_id = ?3 AND explanation_id = ?4",
        params![state, updated_at, project_id, explanation_id],
    ).map_err(super::database_error)?;
    Ok(())
}

pub(crate) fn save_feedback_at_path(
    database_path: &Path,
    request: SaveFeedbackRequest,
) -> Result<SaveFeedbackPayload, String> {
    let mut conn = super::open_database(database_path)?;
    let created_at = super::now_timestamp();
    let id = super::feedback_id(
        &request.project_id,
        &request.explanation_id,
        &request.feedback_type,
        request.user_note.as_deref(),
        &created_at,
    );

    let transaction = conn.transaction().map_err(super::database_error)?;
    ensure_explanation_target(&transaction, &request.project_id, &request.explanation_id)?;
    transaction
        .execute(
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
    transaction.commit().map_err(super::database_error)?;

    Ok(SaveFeedbackPayload {
        id,
        explanation_id: request.explanation_id,
        feedback_type: request.feedback_type,
        created_at,
    })
}
