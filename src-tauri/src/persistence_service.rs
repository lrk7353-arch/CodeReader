#![cfg_attr(test, allow(dead_code))]

#[cfg(test)]
use rusqlite::params;
use rusqlite::{Connection, OpenFlags, MAIN_DB};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(not(test))]
use tauri::{AppHandle, Manager};

#[cfg(not(test))]
use crate::app_error::AppError;
use crate::utils::sha256_hex;

#[path = "persistence/schema.rs"]
mod schema;

#[path = "persistence/prompt_registry.rs"]
mod prompt_registry;

#[path = "persistence/model_config.rs"]
mod model_config;

#[path = "persistence/user_activity.rs"]
mod user_activity;

#[path = "persistence/resume_state.rs"]
mod resume_state;

#[path = "persistence/change_tracking.rs"]
mod change_tracking;

#[path = "persistence/explanation_hydration.rs"]
mod explanation_hydration;

#[allow(unused_imports)]
pub(crate) use explanation_hydration::{hydrate_code_file_at_path, save_generated_explanation};

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
#[allow(unused_imports)]
pub(crate) use prompt_registry::pick_prompt_version_for_target;
#[cfg(not(test))]
pub use prompt_registry::rollback_prompt_version;
#[cfg(not(test))]
pub use prompt_registry::upsert_prompt_version;
#[allow(unused_imports)]
pub(crate) use prompt_registry::{
    list_prompt_versions_at_path, load_prompt_templates, rollback_prompt_version_at_path,
    PromptTemplates,
};
#[allow(unused_imports)]
pub(crate) use prompt_registry::{
    PromptVersionPayload, RollbackPromptVersionPayload, RollbackPromptVersionRequest,
    UpsertPromptVersionRequest,
};
#[allow(unused_imports)]
pub(crate) use prompt_registry::{
    DEFAULT_GENERATION_PROMPT_VERSION, DEFAULT_SYSTEM_PROMPT_TEMPLATE, DEFAULT_USER_PROMPT_TEMPLATE,
};
#[cfg(not(test))]
#[doc(hidden)]
pub use resume_state::{
    __cmd__load_reader_resume_state, __cmd__save_reader_resume_state,
    __tauri_command_name_load_reader_resume_state, __tauri_command_name_save_reader_resume_state,
};
#[cfg(not(test))]
pub use resume_state::{load_reader_resume_state, save_reader_resume_state};
#[allow(unused_imports)]
pub(crate) use resume_state::{load_reader_resume_state_at_path, save_reader_resume_state_at_path};
#[allow(unused_imports)]
pub use resume_state::{ReaderResumeStatePayload, SaveReaderResumeStateRequest};
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__create_related_target;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__create_user_annotation;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__delete_reader_preference;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__delete_related_target;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__delete_user_annotation;
#[cfg(not(test))]
pub use user_activity::__cmd__save_cognition_state;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__save_explanation_feedback;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__save_reader_preference;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__save_reading_state;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__update_related_target;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__cmd__update_user_annotation;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_create_related_target;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_create_user_annotation;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_delete_reader_preference;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_delete_related_target;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_delete_user_annotation;
#[cfg(not(test))]
pub use user_activity::__tauri_command_name_save_cognition_state;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_save_explanation_feedback;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_save_reader_preference;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_save_reading_state;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_update_related_target;
#[cfg(not(test))]
#[doc(hidden)]
pub use user_activity::__tauri_command_name_update_user_annotation;
#[cfg(not(test))]
pub use user_activity::{
    create_related_target, create_user_annotation, delete_reader_preference, delete_related_target,
    delete_user_annotation, save_reader_preference, update_related_target, update_user_annotation,
};
#[allow(unused_imports)]
pub(crate) use user_activity::{
    create_related_target_at_path, create_user_annotation_at_path,
    delete_reader_preference_at_path, delete_related_target_at_path,
    delete_user_annotation_at_path, save_cognition_state_at_path, save_feedback_at_path,
    save_reader_preference_at_path, save_reading_state_at_path, update_related_target_at_path,
    update_user_annotation_at_path,
};
#[cfg(not(test))]
pub use user_activity::{save_cognition_state, save_explanation_feedback, save_reading_state};
#[allow(unused_imports)]
pub use user_activity::{
    CreateRelatedTargetRequest, CreateUserAnnotationRequest, DeleteReaderPreferenceRequest,
    DeleteRelatedTargetRequest, DeleteUserAnnotationRequest, SaveCognitionStatePayload,
    SaveCognitionStateRequest, SaveFeedbackPayload, SaveFeedbackRequest,
    SaveReaderPreferenceRequest, SaveReadingStatePayload, SaveReadingStateRequest,
    UpdateRelatedTargetRequest, UpdateUserAnnotationRequest,
};

const DATABASE_FILE_NAME: &str = "codereader.sqlite";
const LEGACY_APP_IDENTIFIER: &str = "com.codereader.app";
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
    reader_preference: Option<ReaderPreferencePayload>,
    related_targets: Vec<RelatedTargetPayload>,
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
    read_only_recovery: bool,
    backup_path: Option<String>,
    recovery_message: Option<String>,
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
    pub(crate) visit_state: String,
    pub(crate) mastery_state: String,
    pub(crate) review_state: String,
    pub(crate) cognition_revision: i64,
    pub(crate) annotations: Vec<UserAnnotationPayload>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAnnotationPayload {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) explanation_id: String,
    pub(crate) kind: String,
    pub(crate) body: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderPreferencePayload {
    pub(crate) project_id: String,
    pub(crate) display_mode: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedTargetPayload {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) explanation_id: String,
    pub(crate) related_explanation_id: String,
    pub(crate) relation_kind: String,
    pub(crate) related_file_id: Option<String>,
    pub(crate) related_target_type: Option<String>,
    pub(crate) related_target_name: Option<String>,
    pub(crate) related_start_line: Option<usize>,
    pub(crate) related_end_line: Option<usize>,
    pub(crate) related_status: Option<String>,
    pub(crate) created_at: String,
}

#[derive(Clone)]
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
) -> Result<HydratedCodeFilePayload, AppError> {
    let database_path = database_path(&app).map_err(AppError::database)?;
    hydrate_code_file_at_path(&database_path, request).map_err(AppError::database)
}

#[cfg(not(test))]
#[tauri::command]
pub fn initialize_persistence(app: AppHandle) -> Result<PersistenceStatusPayload, AppError> {
    let database_path = current_database_path(&app).map_err(AppError::database)?;
    let preparation =
        prepare_legacy_database(&database_path, &legacy_database_path(&database_path));
    if preparation.is_err() {
        let _ = set_database_state(&database_path, DatabaseState::ReadOnlyRecovery);
    }
    match preparation.and_then(|_| open_database(&database_path)) {
        Ok(_) => Ok(PersistenceStatusPayload {
            database_path: display_path(&database_path),
            initialized: true,
            read_only_recovery: false,
            backup_path: latest_backup_path(&database_path).map(|path| display_path(&path)),
            recovery_message: None,
        }),
        Err(_) => Ok(PersistenceStatusPayload {
            database_path: display_path(&database_path),
            initialized: false,
            read_only_recovery: true,
            backup_path: latest_backup_path(&database_path).map(|path| display_path(&path)),
            recovery_message: Some(recovery_message(&database_path)),
        }),
    }
}

pub(crate) fn open_database(path: &Path) -> Result<Connection, String> {
    let path = normalized_database_key(path);
    let lock = database_lock(&path)?;
    let _guard = lock
        .lock()
        .map_err(|_| "SQLite initialization lock is unavailable".to_string())?;
    if database_state(&path)? == DatabaseState::ReadOnlyRecovery {
        return Err(
            "SQLite is in read-only recovery after an unsafe initialization failure".to_string(),
        );
    }

    match open_database_inner(&path) {
        Ok(conn) => {
            set_database_state(&path, DatabaseState::Ready)?;
            Ok(conn)
        }
        Err(error) => {
            set_database_state(&path, DatabaseState::ReadOnlyRecovery)?;
            Err(error)
        }
    }
}

fn open_database_inner(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create database directory: {error}"))?;
    }
    let existed = path
        .metadata()
        .map(|metadata| metadata.len() > 0)
        .unwrap_or(false);
    let mut conn = match Connection::open(path) {
        Ok(conn) => conn,
        Err(error) => {
            let error = database_error(error);
            return Err(if existed {
                preserve_unreadable_database(path, error)
            } else {
                error
            });
        }
    };
    if let Err(error) = configure_connection(&conn) {
        drop(conn);
        return Err(if existed {
            preserve_unreadable_database(path, error)
        } else {
            error
        });
    }
    if let Err(error) = verify_integrity(&conn) {
        drop(conn);
        return Err(if existed {
            preserve_unreadable_database(path, error)
        } else {
            error
        });
    }

    let version = schema::database_version(&conn)?;
    let backup_path = if existed && version != schema::LATEST_DATABASE_VERSION {
        Some(create_database_backup(&conn, path)?)
    } else {
        None
    };
    let counts_before = table_row_counts(&conn)?;
    if let Err(error) = schema::migrate_with_verification(&mut conn, |transaction| {
        verify_database(transaction, &counts_before)
    }) {
        drop(conn);
        if let Some(backup_path) = backup_path.as_deref() {
            restore_database_backup(backup_path, path)?;
        }
        return Err(error);
    }
    Ok(conn)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DatabaseState {
    Unknown,
    Ready,
    ReadOnlyRecovery,
}

#[derive(Default)]
struct DatabaseRegistry {
    locks: HashMap<PathBuf, Arc<Mutex<()>>>,
    states: HashMap<PathBuf, DatabaseState>,
}

static DATABASE_REGISTRY: OnceLock<Mutex<DatabaseRegistry>> = OnceLock::new();
static LEGACY_IMPORT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn registry() -> &'static Mutex<DatabaseRegistry> {
    DATABASE_REGISTRY.get_or_init(|| Mutex::new(DatabaseRegistry::default()))
}

fn normalized_database_key(path: &Path) -> PathBuf {
    path.to_path_buf()
}

fn database_lock(path: &Path) -> Result<Arc<Mutex<()>>, String> {
    let mut registry = registry()
        .lock()
        .map_err(|_| "SQLite state registry is unavailable".to_string())?;
    Ok(registry
        .locks
        .entry(path.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone())
}

fn database_state(path: &Path) -> Result<DatabaseState, String> {
    let registry = registry()
        .lock()
        .map_err(|_| "SQLite state registry is unavailable".to_string())?;
    Ok(registry
        .states
        .get(path)
        .copied()
        .unwrap_or(DatabaseState::Unknown))
}

fn set_database_state(path: &Path, state: DatabaseState) -> Result<(), String> {
    registry()
        .lock()
        .map_err(|_| "SQLite state registry is unavailable".to_string())?
        .states
        .insert(path.to_path_buf(), state);
    Ok(())
}

fn restore_database_backup(backup_path: &Path, database_path: &Path) -> Result<(), String> {
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = database_path.as_os_str().to_os_string();
        sidecar.push(suffix);
        match std::fs::remove_file(PathBuf::from(sidecar)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Failed to remove SQLite recovery sidecar: {error}")),
        }
    }
    std::fs::copy(backup_path, database_path)
        .map(|_| ())
        .map_err(|error| format!("Database migration failed and backup restore failed: {error}"))
}

fn configure_connection(conn: &Connection) -> Result<(), String> {
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(database_error)?;
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .map_err(database_error)?;
    if !journal_mode.eq_ignore_ascii_case("wal") {
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(database_error)?;
    }
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA synchronous = NORMAL;",
    )
    .map_err(database_error)
}

fn verify_integrity(conn: &Connection) -> Result<(), String> {
    let result: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(database_error)?;
    if result == "ok" {
        Ok(())
    } else {
        Err("SQLite integrity verification failed".to_string())
    }
}

fn verify_database(conn: &Connection, counts_before: &[(String, i64)]) -> Result<(), String> {
    verify_integrity(conn)?;
    let foreign_key_errors: i64 = conn
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(database_error)?;
    if foreign_key_errors != 0 {
        return Err("SQLite foreign-key verification failed".to_string());
    }
    let counts_after = table_row_counts(conn)?;
    for (table, before) in counts_before {
        if let Some((_, after)) = counts_after.iter().find(|(name, _)| name == table) {
            if after < before {
                return Err(format!("SQLite row-count verification failed for {table}"));
            }
        }
    }
    Ok(())
}

fn table_row_counts(conn: &Connection) -> Result<Vec<(String, i64)>, String> {
    let mut statement = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .map_err(database_error)?;
    let names = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;
    names
        .into_iter()
        .map(|name| {
            let escaped = name.replace('"', "\"\"");
            let count = conn
                .query_row(&format!("SELECT COUNT(*) FROM \"{escaped}\""), [], |row| {
                    row.get(0)
                })
                .map_err(database_error)?;
            Ok((name, count))
        })
        .collect()
}

fn create_database_backup(conn: &Connection, path: &Path) -> Result<PathBuf, String> {
    let backup_path = backup_path(path);
    conn.backup(MAIN_DB, &backup_path, None)
        .map_err(database_error)?;
    let backup = Connection::open(&backup_path).map_err(database_error)?;
    verify_integrity(&backup)?;
    Ok(backup_path)
}

fn create_raw_backup(path: &Path) -> Result<PathBuf, String> {
    let backup_path = backup_path(path);
    std::fs::copy(path, &backup_path)
        .map_err(|error| format!("Failed to preserve unreadable database: {error}"))?;
    Ok(backup_path)
}

fn preserve_unreadable_database(path: &Path, original_error: String) -> String {
    match create_raw_backup(path) {
        Ok(_) => original_error,
        Err(backup_error) => format!(
            "{original_error}; a verified recovery backup could not be created: {backup_error}"
        ),
    }
}

fn recovery_message(path: &Path) -> String {
    if latest_backup_path(path).is_some() {
        "The local database could not be upgraded safely. The original data and a verified backup were preserved for recovery.".to_string()
    } else {
        "The local database could not be upgraded safely. The original data was left untouched, but CodeReader could not verify a recovery backup. Free disk space or permissions and retry recovery before making changes.".to_string()
    }
}

fn backup_path(path: &Path) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    path.with_extension(format!("sqlite.backup-{millis}"))
}

fn latest_backup_path(path: &Path) -> Option<PathBuf> {
    let parent = path.parent()?;
    let prefix = format!("{}.", path.file_name()?.to_string_lossy());
    let mut backups = std::fs::read_dir(parent)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|candidate| {
            candidate.file_name().is_some_and(|name| {
                let name = name.to_string_lossy();
                name.starts_with(&prefix) && name.contains("backup-")
            })
        })
        .collect::<Vec<_>>();
    backups.sort();
    backups.pop()
}

#[cfg(not(test))]
pub(crate) fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let current = current_database_path(app)?;
    if let Err(error) = prepare_legacy_database(&current, &legacy_database_path(&current)) {
        let _ = set_database_state(&current, DatabaseState::ReadOnlyRecovery);
        return Err(error);
    }
    Ok(current)
}

#[cfg(not(test))]
fn current_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve CodeReader data directory: {error}"))?;
    Ok(app_data_dir.join(DATABASE_FILE_NAME))
}

fn legacy_database_path(current: &Path) -> PathBuf {
    current
        .parent()
        .and_then(Path::parent)
        .map(|app_data_root| {
            app_data_root
                .join(LEGACY_APP_IDENTIFIER)
                .join(DATABASE_FILE_NAME)
        })
        .unwrap_or_else(|| PathBuf::from(LEGACY_APP_IDENTIFIER).join(DATABASE_FILE_NAME))
}

fn prepare_legacy_database(current: &Path, legacy: &Path) -> Result<bool, String> {
    let import_lock = LEGACY_IMPORT_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = import_lock
        .lock()
        .map_err(|_| "Legacy database import lock is unavailable".to_string())?;

    // Existing production data always wins. In particular, never merge or
    // overwrite when both identifiers already have a database.
    if current.exists() || !legacy.exists() {
        return Ok(false);
    }
    if let Some(parent) = current.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create current database directory: {error}"))?;
    }

    let legacy_connection = Connection::open_with_flags(legacy, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(database_error)?;
    verify_integrity(&legacy_connection)?;
    let backup_path = create_database_backup(&legacy_connection, legacy)?;

    let import_result = copy_file_if_absent(&backup_path, current).and_then(|_| {
        let imported = Connection::open_with_flags(current, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(database_error)?;
        verify_integrity(&imported)
    });
    if let Err(error) = import_result {
        let _ = std::fs::remove_file(current);
        return Err(format!("Legacy database import failed safely: {error}"));
    }
    Ok(true)
}

fn copy_file_if_absent(source: &Path, destination: &Path) -> Result<(), String> {
    let mut source_file = std::fs::File::open(source)
        .map_err(|error| format!("Failed to open verified legacy backup: {error}"))?;
    let mut destination_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|error| format!("Refused to overwrite current database: {error}"))?;
    std::io::copy(&mut source_file, &mut destination_file)
        .map_err(|error| format!("Failed to import verified legacy backup: {error}"))?;
    destination_file
        .sync_all()
        .map_err(|error| format!("Failed to flush imported legacy database: {error}"))
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

        let backup = latest_backup_path(&database_path).expect("corrupt database is preserved");
        assert_eq!(std::fs::read(&backup).expect("backup reads"), contents);
        let _ = std::fs::remove_file(backup);
        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn legacy_database_is_backed_up_and_rows_survive_migration() {
        let database_path = temp_database_path("legacy-backup");
        let conn = open_database(&database_path).expect("current database opens");
        conn.execute(
            "INSERT INTO projects (id, root_path, created_at, updated_at)
             VALUES ('project:fixture', '/fixture', 'before', 'before')",
            [],
        )
        .expect("fixture row inserts");
        conn.execute_batch(
            "DROP INDEX uq_prompt_versions_single_active;
             PRAGMA user_version = 3;",
        )
        .expect("database is converted to a v3 fixture");
        drop(conn);

        let migrated = open_database(&database_path).expect("legacy database migrates");
        let count: i64 = migrated
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE id = 'project:fixture'",
                [],
                |row| row.get(0),
            )
            .expect("fixture row queries");
        assert_eq!(count, 1);
        assert_eq!(
            schema::database_version(&migrated).expect("version reads"),
            schema::LATEST_DATABASE_VERSION
        );
        drop(migrated);

        let backup = latest_backup_path(&database_path).expect("migration backup exists");
        let backup_conn = Connection::open(&backup).expect("backup opens");
        assert_eq!(
            schema::database_version(&backup_conn).expect("backup version reads"),
            3
        );
        drop(backup_conn);
        let _ = std::fs::remove_file(backup);
        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn failed_v5_migration_restores_the_verified_backup_without_overwriting_data() {
        let database_path = temp_database_path("v5-failure-restore");
        let conn = open_database(&database_path).expect("current database opens");
        conn.execute(
            "INSERT INTO projects (id, root_path, created_at, updated_at)
             VALUES ('project:restore', '/fixture', 'before', 'before')",
            [],
        )
        .expect("fixture row inserts");
        conn.execute_batch(
            "DROP TABLE user_reading_states;
             PRAGMA user_version = 4;",
        )
        .expect("fixture forces an additive migration failure");
        drop(conn);

        let error = open_database(&database_path).expect_err("v5 migration must fail safely");
        assert!(error.contains("user_reading_states"));
        let backup = latest_backup_path(&database_path).expect("verified backup exists");
        let restored =
            Connection::open(&database_path).expect("restored database remains readable");
        assert_eq!(
            schema::database_version(&restored).expect("restored version reads"),
            4
        );
        let project_count: i64 = restored
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE id = 'project:restore'",
                [],
                |row| row.get(0),
            )
            .expect("original project remains after restore");
        assert_eq!(project_count, 1);
        drop(restored);
        let backup_conn = Connection::open(&backup).expect("backup opens");
        assert_eq!(
            schema::database_version(&backup_conn).expect("backup version reads"),
            4
        );
        drop(backup_conn);
        let _ = std::fs::remove_file(backup);
        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn supported_historical_databases_import_migrate_and_reopen_without_loss() {
        let fixtures = [
            (
                "v0_10",
                1,
                include_str!("../tests/fixtures/persistence/v0_10.sql"),
            ),
            (
                "v0_11_early",
                2,
                include_str!("../tests/fixtures/persistence/v0_11_early.sql"),
            ),
            (
                "v0_11_current",
                3,
                include_str!("../tests/fixtures/persistence/v0_11_current.sql"),
            ),
        ];

        for (name, version, fixture) in fixtures {
            let root = temp_app_data_root(name);
            let current = root.join("com.codereader.desktop").join(DATABASE_FILE_NAME);
            let legacy = root.join(LEGACY_APP_IDENTIFIER).join(DATABASE_FILE_NAME);
            create_historical_fixture(&legacy, version, fixture);
            let legacy_bytes = std::fs::read(&legacy).expect("legacy database reads");

            assert!(prepare_legacy_database(&current, &legacy).expect("legacy import succeeds"));
            let imported = open_database(&current).expect("imported database migrates");
            assert_eq!(
                schema::database_version(&imported).expect("version reads"),
                schema::LATEST_DATABASE_VERSION
            );
            for table in [
                "explanation_nodes",
                "explanation_targets",
                "user_reading_states",
                "project_guides",
                "model_provider_settings",
            ] {
                let count: i64 = imported
                    .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                        row.get(0)
                    })
                    .expect("historical row count reads");
                assert!(count >= 1, "{name} preserves {table}");
            }
            drop(imported);

            let reopened = open_database(&current).expect("migrated database reopens");
            let explanation: String = reopened
                .query_row(
                    "SELECT code_level_meaning FROM explanation_nodes WHERE id = 'exp:fixture'",
                    [],
                    |row| row.get(0),
                )
                .expect("historical explanation remains readable");
            assert!(explanation.starts_with("Anonymous"));
            drop(reopened);

            assert_eq!(
                std::fs::read(&legacy).expect("legacy source remains readable"),
                legacy_bytes,
                "{name} never overwrites the source database"
            );
            assert!(
                latest_backup_path(&legacy).is_some(),
                "{name} has a verified backup"
            );
            let _ = std::fs::remove_dir_all(root);
        }
    }

    #[test]
    fn legacy_import_never_overwrites_an_existing_current_database() {
        let root = temp_app_data_root("legacy-conflict");
        let current = root.join("com.codereader.desktop").join(DATABASE_FILE_NAME);
        let legacy = root.join(LEGACY_APP_IDENTIFIER).join(DATABASE_FILE_NAME);
        std::fs::create_dir_all(current.parent().expect("current parent")).expect("current dir");
        std::fs::create_dir_all(legacy.parent().expect("legacy parent")).expect("legacy dir");
        std::fs::write(&current, b"current-owner-data").expect("current database fixture writes");
        std::fs::write(&legacy, b"legacy-owner-data").expect("legacy database fixture writes");

        assert!(!prepare_legacy_database(&current, &legacy).expect("conflict is not imported"));
        assert_eq!(
            std::fs::read(&current).expect("current reads"),
            b"current-owner-data"
        );
        assert_eq!(
            std::fs::read(&legacy).expect("legacy reads"),
            b"legacy-owner-data"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn unsafe_initialization_blocks_later_database_writes_for_the_same_path() {
        let database_path = temp_database_path("read-only-recovery");
        std::fs::write(&database_path, b"not a sqlite database").expect("corrupt fixture writes");

        open_database(&database_path).expect_err("unsafe initialization fails");
        let error = open_database(&database_path).expect_err("recovery state blocks retry writes");
        assert!(error.contains("read-only recovery"));
        assert_eq!(
            std::fs::read(&database_path).expect("original database remains"),
            b"not a sqlite database"
        );
        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn recovery_message_never_claims_a_backup_when_none_exists() {
        let database_path = temp_database_path("recovery-message");
        let message = recovery_message(&database_path);
        assert!(message.contains("left untouched"));
        assert!(!message.contains("a verified backup were preserved"));
    }

    #[test]
    fn newer_database_is_preserved_with_a_recovery_backup() {
        let database_path = temp_database_path("future-backup");
        let conn = open_database(&database_path).expect("current database opens");
        conn.pragma_update(None, "user_version", schema::LATEST_DATABASE_VERSION + 1)
            .expect("future version writes");
        drop(conn);

        let error = open_database(&database_path).expect_err("future database is rejected");
        assert!(error.contains("newer than this CodeReader build supports"));
        let preserved = Connection::open(&database_path).expect("original remains readable");
        assert_eq!(
            schema::database_version(&preserved).expect("preserved version reads"),
            schema::LATEST_DATABASE_VERSION + 1
        );
        drop(preserved);
        let backup = latest_backup_path(&database_path).expect("recovery backup exists");
        let backup_conn = Connection::open(&backup).expect("backup opens");
        assert_eq!(
            schema::database_version(&backup_conn).expect("backup version reads"),
            schema::LATEST_DATABASE_VERSION + 1
        );
        drop(backup_conn);
        let _ = std::fs::remove_file(backup);
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
        assert_eq!(file_explanation.visit_state, "read");
        assert_eq!(file_explanation.mastery_state, "understood");
        assert_eq!(file_explanation.review_state, "current");

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn legacy_marker_replacement_preserves_empty_notes_and_new_cognition_saves() {
        let database_path = temp_database_path("legacy-markers");
        hydrate_code_file_at_path(&database_path, sample_request()).expect("hydrate prepares db");
        let target = "exp:target:sample:file".to_string();

        save_reading_state_at_path(
            &database_path,
            SaveReadingStateRequest {
                project_id: "project:sample".to_string(),
                explanation_id: target.clone(),
                state: "questioned".to_string(),
                note: None,
            },
        )
        .expect("empty questioned state persists a marker");

        let saved = save_cognition_state_at_path(
            &database_path,
            SaveCognitionStateRequest {
                project_id: "project:sample".to_string(),
                explanation_id: target.clone(),
                visit_state: "read".to_string(),
                mastery_state: "understood".to_string(),
                review_state: "current".to_string(),
                expected_revision: Some(1),
            },
        )
        .expect("new cognition save preserves the legacy marker projection");
        assert_eq!(saved.state, "questioned");

        save_reading_state_at_path(
            &database_path,
            SaveReadingStateRequest {
                project_id: "project:sample".to_string(),
                explanation_id: target.clone(),
                state: "suspicious".to_string(),
                note: Some("legacy note".to_string()),
            },
        )
        .expect("risk marker and legacy note persist");

        let reopened = hydrate_code_file_at_path(&database_path, sample_request())
            .expect("reopen returns cognition and annotations");
        let explanation = reopened
            .explanations
            .iter()
            .find(|item| item.id == target)
            .expect("target exists");
        assert_eq!(explanation.reading_state, "suspicious");
        assert_eq!(explanation.annotations.len(), 2);
        assert!(!explanation
            .annotations
            .iter()
            .any(|item| item.kind == "question"));
        assert!(explanation
            .annotations
            .iter()
            .any(|item| item.kind == "risk"));
        assert!(explanation
            .annotations
            .iter()
            .any(|item| item.kind == "note" && item.body == "legacy note"));

        let stale = save_cognition_state_at_path(
            &database_path,
            SaveCognitionStateRequest {
                project_id: "project:sample".to_string(),
                explanation_id: target,
                visit_state: "read".to_string(),
                mastery_state: "unconfirmed".to_string(),
                review_state: "needs_review".to_string(),
                expected_revision: Some(1),
            },
        )
        .expect_err("stale revision is rejected");
        assert!(stale.contains("stale"));

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn legacy_ipc_creates_its_own_marker_after_new_question_and_risk_annotations() {
        let database_path = temp_database_path("legacy-marker-origin");
        let project_id = "project:sample".to_string();
        let explanation_id = "exp:target:sample:file".to_string();
        hydrate_code_file_at_path(&database_path, sample_request())
            .expect("hydrate prepares target");
        let new_question = create_user_annotation_at_path(
            &database_path,
            CreateUserAnnotationRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                kind: "question".to_string(),
                body: "new question remains orthogonal".to_string(),
            },
        )
        .expect("new question creates");
        let new_risk = create_user_annotation_at_path(
            &database_path,
            CreateUserAnnotationRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                kind: "risk".to_string(),
                body: "new risk remains orthogonal".to_string(),
            },
        )
        .expect("new risk creates");

        let questioned = save_reading_state_at_path(
            &database_path,
            SaveReadingStateRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                state: "questioned".to_string(),
                note: None,
            },
        )
        .expect("legacy question save creates a legacy marker");
        assert_eq!(questioned.state, "questioned");
        let suspicious = save_reading_state_at_path(
            &database_path,
            SaveReadingStateRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                state: "suspicious".to_string(),
                note: None,
            },
        )
        .expect("legacy risk save creates a legacy marker");
        assert_eq!(suspicious.state, "suspicious");

        let conn = open_database(&database_path).expect("database opens");
        let annotations: Vec<(String, String)> = conn
            .prepare(
                "SELECT id, kind FROM user_annotations
                 WHERE project_id = ?1 AND explanation_id = ?2 ORDER BY id",
            )
            .expect("annotation query prepares")
            .query_map(params![project_id, explanation_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .expect("annotation query runs")
            .collect::<Result<Vec<_>, _>>()
            .expect("annotations collect");
        assert!(annotations
            .iter()
            .any(|(id, kind)| id == &new_question.id && kind == "question"));
        assert!(annotations
            .iter()
            .any(|(id, kind)| id == &new_risk.id && kind == "risk"));
        let legacy_markers = annotations
            .iter()
            .filter(|(id, _)| id.starts_with("annotation:legacy-state:"))
            .collect::<Vec<_>>();
        assert_eq!(legacy_markers.len(), 1);
        assert_eq!(legacy_markers[0].1, "risk");
        drop(conn);

        for marker in ["questioned", "suspicious"] {
            for next_state in ["unread", "read", "understood", "needs_reexplain"] {
                save_reading_state_at_path(
                    &database_path,
                    SaveReadingStateRequest {
                        project_id: project_id.clone(),
                        explanation_id: explanation_id.clone(),
                        state: marker.to_string(),
                        note: None,
                    },
                )
                .expect("legacy marker saves");
                let saved = save_reading_state_at_path(
                    &database_path,
                    SaveReadingStateRequest {
                        project_id: project_id.clone(),
                        explanation_id: explanation_id.clone(),
                        state: next_state.to_string(),
                        note: None,
                    },
                )
                .expect("non-marker state replaces legacy marker");
                assert_eq!(saved.state, next_state);

                let conn = open_database(&database_path).expect("database opens");
                let marker_count: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM user_annotations
                         WHERE project_id = ?1 AND explanation_id = ?2
                           AND id LIKE 'annotation:legacy-state:%'",
                        params![project_id, explanation_id],
                        |row| row.get(0),
                    )
                    .expect("marker count reads");
                assert_eq!(marker_count, 0);
                drop(conn);

                let reopened = hydrate_code_file_at_path(&database_path, sample_request())
                    .expect("restart hydrates replacement state");
                let target = reopened
                    .explanations
                    .iter()
                    .find(|item| item.id == "exp:target:sample:file")
                    .expect("target hydrates");
                assert_eq!(target.reading_state, next_state);
            }
        }

        let reopened = hydrate_code_file_at_path(&database_path, sample_request())
            .expect("restart hydrates legacy projection");
        let target = reopened
            .explanations
            .iter()
            .find(|item| item.id == "exp:target:sample:file")
            .expect("target hydrates");
        assert_eq!(target.reading_state, "needs_reexplain");
        assert!(target
            .annotations
            .iter()
            .any(|item| item.id == new_question.id));
        assert!(target.annotations.iter().any(|item| item.id == new_risk.id));
        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn constrained_r1_records_round_trip_through_restart() {
        let database_path = temp_database_path("r1-record-crud");
        let project_id = "project:sample".to_string();
        let explanation_id = "exp:target:sample:file".to_string();
        hydrate_code_file_at_path(&database_path, sample_request())
            .expect("hydrate prepares targets");

        let annotation = create_user_annotation_at_path(
            &database_path,
            CreateUserAnnotationRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                kind: "note".to_string(),
                body: "remember this boundary".to_string(),
            },
        )
        .expect("annotation creates within the explanation target");
        update_user_annotation_at_path(
            &database_path,
            UpdateUserAnnotationRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                id: annotation.id.clone(),
                kind: "question".to_string(),
                body: "why is this boundary needed?".to_string(),
            },
        )
        .expect("annotation updates within the explanation target");
        let preference = save_reader_preference_at_path(
            &database_path,
            SaveReaderPreferenceRequest {
                project_id: project_id.clone(),
                display_mode: "detailed".to_string(),
            },
        )
        .expect("project preference saves");
        assert_eq!(preference.display_mode, "detailed");
        let relation = create_related_target_at_path(
            &database_path,
            CreateRelatedTargetRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                related_explanation_id: "exp:target:sample:function".to_string(),
                relation_kind: "depends_on".to_string(),
            },
        )
        .expect("related target creates inside the project");
        update_related_target_at_path(
            &database_path,
            UpdateRelatedTargetRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                id: relation.id.clone(),
                related_explanation_id: "exp:target:sample:function".to_string(),
                relation_kind: "clarifies".to_string(),
            },
        )
        .expect("related target updates inside the project");

        let reopened = hydrate_code_file_at_path(&database_path, sample_request())
            .expect("restart hydration restores R1 records");
        assert_eq!(
            reopened
                .reader_preference
                .expect("preference hydrates")
                .display_mode,
            "detailed"
        );
        assert_eq!(reopened.related_targets.len(), 1);
        assert_eq!(reopened.related_targets[0].relation_kind, "clarifies");
        assert_eq!(
            reopened.related_targets[0].related_file_id.as_deref(),
            Some("file:sample")
        );
        assert_eq!(
            reopened.related_targets[0].related_target_type.as_deref(),
            Some("function")
        );
        assert_eq!(reopened.related_targets[0].related_start_line, Some(1));
        let reopened_target = reopened
            .explanations
            .iter()
            .find(|explanation| explanation.id == explanation_id)
            .expect("annotated explanation hydrates");
        assert!(reopened_target
            .annotations
            .iter()
            .any(|item| item.id == annotation.id && item.kind == "question"));
        assert_eq!(
            reopened_target.reading_state, "unread",
            "new question annotations never become legacy state markers"
        );

        update_user_annotation_at_path(
            &database_path,
            UpdateUserAnnotationRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                id: annotation.id.clone(),
                kind: "risk".to_string(),
                body: "a new risk annotation is orthogonal".to_string(),
            },
        )
        .expect("new risk annotation updates");
        let with_new_risk = hydrate_code_file_at_path(&database_path, sample_request())
            .expect("new risk hydration succeeds");
        assert_eq!(
            with_new_risk
                .explanations
                .iter()
                .find(|item| item.id == explanation_id)
                .expect("target persists")
                .reading_state,
            "unread"
        );

        delete_user_annotation_at_path(
            &database_path,
            DeleteUserAnnotationRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                id: annotation.id,
            },
        )
        .expect("annotation deletes within the explanation target");
        let without_new_risk = hydrate_code_file_at_path(&database_path, sample_request())
            .expect("deleted annotation hydration succeeds");
        assert_eq!(
            without_new_risk
                .explanations
                .iter()
                .find(|item| item.id == explanation_id)
                .expect("target persists")
                .reading_state,
            "unread"
        );
        delete_related_target_at_path(
            &database_path,
            DeleteRelatedTargetRequest {
                project_id: project_id.clone(),
                explanation_id: explanation_id.clone(),
                id: relation.id,
            },
        )
        .expect("related target deletes within the explanation target");
        delete_reader_preference_at_path(
            &database_path,
            DeleteReaderPreferenceRequest { project_id },
        )
        .expect("preference deletes within the project");
        assert!(create_user_annotation_at_path(
            &database_path,
            CreateUserAnnotationRequest {
                project_id: "project:other".to_string(),
                explanation_id,
                kind: "note".to_string(),
                body: "must not cross project boundary".to_string(),
            },
        )
        .is_err());
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

        hydrate_code_file_at_path(
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
                seed_explanations: Vec::new(),
            },
        )
        .expect("generation input is hydrated before persistence");

        let saved = save_generated_explanation(&database_path, input.clone())
            .expect("generated explanation saves");
        assert_eq!(saved.code_meaning, "读取输入。");
        assert_eq!(saved.trust_label.as_deref(), Some("context_needed"));

        save_cognition_state_at_path(
            &database_path,
            SaveCognitionStateRequest {
                project_id: "project:test".to_string(),
                explanation_id: "exp:test".to_string(),
                visit_state: "read".to_string(),
                mastery_state: "understood".to_string(),
                review_state: "current".to_string(),
                expected_revision: Some(0),
            },
        )
        .expect("understood state saves");
        save_cognition_state_at_path(
            &database_path,
            SaveCognitionStateRequest {
                project_id: "project:test".to_string(),
                explanation_id: "exp:test".to_string(),
                visit_state: "read".to_string(),
                mastery_state: "understood".to_string(),
                review_state: "needs_review".to_string(),
                expected_revision: Some(1),
            },
        )
        .expect("review state saves");
        let conn = open_database(&database_path).expect("database opens for legacy marker");
        conn.execute(
            "INSERT INTO user_annotations (id, project_id, explanation_id, kind, body, created_at, updated_at)
             VALUES ('annotation:legacy-state:reading:test:risk', 'project:test', 'exp:test', 'risk', '', '2', '2')",
            [],
        )
        .expect("legacy marker inserts");
        conn.execute(
            "UPDATE user_reading_states SET state = 'suspicious' WHERE project_id = 'project:test' AND explanation_id = 'exp:test'",
            [],
        )
        .expect("legacy projection fixture updates");
        drop(conn);
        let regenerated = save_generated_explanation(&database_path, input.clone())
            .expect("regeneration preserves cognition and annotations");
        assert_eq!(regenerated.reading_state, "suspicious");
        assert_eq!(regenerated.visit_state, "read");
        assert_eq!(regenerated.mastery_state, "understood");
        assert_eq!(regenerated.review_state, "needs_review");
        assert_eq!(regenerated.cognition_revision, 2);
        assert!(regenerated
            .annotations
            .iter()
            .any(|annotation| annotation.id.starts_with("annotation:legacy-state:")));

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

        hydrate_code_file_at_path(
            &database_path,
            HydrateCodeFileRequest {
                file: PersistenceCodeFile {
                    id: "file:test".to_string(),
                    path: "C:/test-project/src/example.ts".to_string(),
                    project_id: Some("project:test".to_string()),
                    project_root: Some("C:/test-project".to_string()),
                    relative_path: Some("src/example.ts".to_string()),
                    language: "typescript".to_string(),
                    code: "const changed = true;".to_string(),
                    file_hash: Some("file-hash:changed".to_string()),
                    snapshot_id: Some("snapshot:test:changed".to_string()),
                    code_nodes: Vec::new(),
                },
                seed_explanations: Vec::new(),
            },
        )
        .expect("newer file snapshot hydrates");
        let stale = match save_generated_explanation(&database_path, input) {
            Ok(_) => panic!("old generation must not overwrite the newer file state"),
            Err(error) => error,
        };
        assert_eq!(stale, "stale generation result");
        let connection = open_database(&database_path).expect("database reopens");
        let hash: String = connection
            .query_row(
                "SELECT content_hash FROM files WHERE id = 'file:test'",
                [],
                |row| row.get(0),
            )
            .expect("current file hash reads");
        assert_eq!(hash, "file-hash:changed");
        drop(connection);

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn moved_function_migrates_valid_explanation_to_new_lines() {
        let database_path = temp_database_path("change-moved");
        hydrate_code_file_at_path(&database_path, sample_request())
            .expect("baseline should hydrate");
        mark_explanation_valid(&database_path, "exp:target:sample:function");
        let connection = open_database(&database_path).expect("database opens");
        connection
            .execute(
                "UPDATE user_reading_states
                 SET state = 'understood', visit_state = 'read', mastery_state = 'understood',
                     review_state = 'current', revision = 4
                 WHERE project_id = 'project:sample' AND explanation_id = 'exp:target:sample:function'",
                [],
            )
            .expect("understood cognition saves");
        drop(connection);

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
        assert_eq!(explanation.mastery_state, "understood");
        assert_eq!(explanation.review_state, "current");
        assert_eq!(explanation.cognition_revision, 4);
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
        let connection = open_database(&database_path).expect("database opens");
        connection
            .execute(
                "UPDATE user_reading_states
                 SET state = 'understood', visit_state = 'read', mastery_state = 'understood',
                     review_state = 'current', revision = 4
                 WHERE project_id = 'project:sample' AND explanation_id = 'exp:target:sample:function'",
                [],
            )
            .expect("understood cognition saves");
        drop(connection);

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
        assert_eq!(explanation.mastery_state, "understood");
        assert_eq!(explanation.review_state, "needs_review");
        assert_eq!(explanation.reading_state, "needs_reexplain");
        assert_eq!(explanation.cognition_revision, 5);
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

    fn temp_app_data_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "codereader-{name}-app-data-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ))
    }

    fn create_historical_fixture(path: &Path, version: i64, fixture: &str) {
        std::fs::create_dir_all(path.parent().expect("fixture parent"))
            .expect("fixture directory creates");
        let connection = Connection::open(path).expect("fixture database opens");
        for migration in 1..=version {
            schema::run_migration(&connection, migration).expect("historical schema builds");
        }
        connection
            .execute_batch(fixture)
            .expect("anonymous historical fixture loads");
    }
}
