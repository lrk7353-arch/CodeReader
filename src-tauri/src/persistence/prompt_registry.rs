use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(not(test))]
use tauri::AppHandle;

pub(crate) const DEFAULT_GENERATION_PROMPT_VERSION: &str = "code-explanation-v0.1";

pub(crate) struct PromptVersionRegistration {
    pub(crate) version: String,
    pub(crate) status: String,
    pub(crate) rollout_percent: u8,
    pub(crate) rollback_from: Option<String>,
    pub(crate) notes: Option<String>,
}

pub(crate) struct PromptVersionRecord {
    pub(crate) version: String,
    pub(crate) status: String,
    pub(crate) rollout_percent: u8,
    pub(crate) rollback_from: Option<String>,
    pub(crate) notes: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPromptVersionRequest {
    version: String,
    status: String,
    rollout_percent: u8,
    rollback_from: Option<String>,
    notes: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptVersionPayload {
    version: String,
    status: String,
    rollout_percent: u8,
    rollback_from: Option<String>,
    notes: Option<String>,
    created_at: String,
    updated_at: String,
}

#[cfg(not(test))]
#[tauri::command]
pub fn upsert_prompt_version(
    app: AppHandle,
    request: UpsertPromptVersionRequest,
) -> Result<PromptVersionPayload, String> {
    let database_path = super::database_path(&app)?;
    let record = upsert_prompt_version_at_path(
        &database_path,
        PromptVersionRegistration {
            version: request.version,
            status: request.status,
            rollout_percent: request.rollout_percent,
            rollback_from: request.rollback_from,
            notes: request.notes,
        },
    )?;
    Ok(PromptVersionPayload {
        version: record.version,
        status: record.status,
        rollout_percent: record.rollout_percent,
        rollback_from: record.rollback_from,
        notes: record.notes,
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

pub(crate) fn upsert_prompt_version_at_path(
    database_path: &Path,
    input: PromptVersionRegistration,
) -> Result<PromptVersionRecord, String> {
    validate_prompt_version(&input)?;
    let conn = super::open_database(database_path)?;
    let now = super::now_timestamp();
    let created_at = conn
        .query_row(
            "SELECT created_at FROM prompt_versions WHERE version = ?1",
            params![input.version],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| now.clone());
    conn.execute(
        "INSERT INTO prompt_versions
         (version, status, rollout_percent, rollback_from, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(version) DO UPDATE SET
           status = excluded.status,
           rollout_percent = excluded.rollout_percent,
           rollback_from = excluded.rollback_from,
           notes = excluded.notes,
           updated_at = excluded.updated_at",
        params![
            input.version,
            input.status,
            input.rollout_percent as i64,
            input.rollback_from,
            input.notes,
            created_at,
            now
        ],
    )
    .map_err(super::database_error)?;

    load_prompt_version(&conn, &input.version)
}

pub(crate) fn active_prompt_version(
    database_path: &Path,
    fallback_version: &str,
) -> Result<String, String> {
    let conn = super::open_database(database_path)?;
    let mut statement = conn
        .prepare(
            "SELECT version
             FROM prompt_versions
             WHERE status IN ('active', 'canary') AND rollout_percent > 0
             ORDER BY
               CASE status WHEN 'active' THEN 0 ELSE 1 END,
               rollout_percent DESC,
               updated_at DESC
             LIMIT 1",
        )
        .map_err(super::database_error)?;
    let mut rows = statement.query([]).map_err(super::database_error)?;
    if let Some(row) = rows.next().map_err(super::database_error)? {
        return row.get(0).map_err(super::database_error);
    }
    Ok(fallback_version.to_string())
}

fn load_prompt_version(conn: &Connection, version: &str) -> Result<PromptVersionRecord, String> {
    conn.query_row(
        "SELECT version, status, rollout_percent, rollback_from, notes, created_at, updated_at
         FROM prompt_versions
         WHERE version = ?1",
        params![version],
        |row| {
            let rollout_percent: i64 = row.get(2)?;
            Ok(PromptVersionRecord {
                version: row.get(0)?,
                status: row.get(1)?,
                rollout_percent: rollout_percent.clamp(0, 100) as u8,
                rollback_from: row.get(3)?,
                notes: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .map_err(super::database_error)
}

fn validate_prompt_version(input: &PromptVersionRegistration) -> Result<(), String> {
    if input.version.trim().is_empty() {
        return Err("Prompt version cannot be empty.".to_string());
    }
    if input.version.chars().count() > 160 {
        return Err("Prompt version is too long.".to_string());
    }
    if !matches!(
        input.status.as_str(),
        "active" | "canary" | "rolled_back" | "deprecated"
    ) {
        return Err("Prompt version status is invalid.".to_string());
    }
    if input.status == "rolled_back" && input.rollback_from.as_deref().unwrap_or("").is_empty() {
        return Err("Rolled-back prompt versions must record rollback_from.".to_string());
    }
    if input.status == "active" && input.rollout_percent != 100 {
        return Err("Active prompt versions must use 100 percent rollout.".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn active_prompt_version_returns_seeded_default() {
        let database_path = temp_database_path("prompt-seeded");
        super::super::open_database(&database_path).expect("database initializes");

        let active = active_prompt_version(&database_path, "fallback-v0")
            .expect("active prompt version resolves");
        assert_eq!(active, DEFAULT_GENERATION_PROMPT_VERSION);

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn upsert_prompt_version_promotes_canary_after_active_is_deprecated() {
        let database_path = temp_database_path("prompt-canary");
        super::super::open_database(&database_path).expect("database initializes");

        let canary = upsert_prompt_version_at_path(
            &database_path,
            prompt_registration("code-explanation-v0.2-rc1", "canary", 50, None, None),
        )
        .expect("canary registers");
        assert_eq!(canary.status, "canary");
        assert_eq!(canary.rollout_percent, 50);
        assert!(canary.created_at == canary.updated_at);

        let active = active_prompt_version(&database_path, "fallback-v0")
            .expect("active prompt version resolves");
        assert_eq!(
            active,
            DEFAULT_GENERATION_PROMPT_VERSION,
            "active must outrank canary"
        );

        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration(
                DEFAULT_GENERATION_PROMPT_VERSION,
                "deprecated",
                0,
                None,
                None,
            ),
        )
        .expect("default version deprecates");

        let promoted = active_prompt_version(&database_path, "fallback-v0")
            .expect("canary is promoted");
        assert_eq!(promoted, "code-explanation-v0.2-rc1");

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn upsert_prompt_version_records_rollback_metadata() {
        let database_path = temp_database_path("prompt-rollback");
        super::super::open_database(&database_path).expect("database initializes");

        let record = upsert_prompt_version_at_path(
            &database_path,
            prompt_registration(
                "code-explanation-v0.2-rc1",
                "rolled_back",
                0,
                Some(DEFAULT_GENERATION_PROMPT_VERSION),
                Some("Canary produced malformed JSON in 12% of requests."),
            ),
        )
        .expect("rollback records");

        assert_eq!(record.status, "rolled_back");
        assert_eq!(
            record.rollback_from.as_deref(),
            Some(DEFAULT_GENERATION_PROMPT_VERSION)
        );
        assert!(record.notes.as_deref().is_some_and(|notes| notes
            .contains("malformed JSON")));

        let active = active_prompt_version(&database_path, "fallback-v0")
            .expect("active prompt version resolves");
        assert_eq!(
            active, DEFAULT_GENERATION_PROMPT_VERSION,
            "rolled-back row must not be selected"
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn active_prompt_version_falls_back_when_no_active_or_canary() {
        let database_path = temp_database_path("prompt-fallback");
        super::super::open_database(&database_path).expect("database initializes");

        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration(
                DEFAULT_GENERATION_PROMPT_VERSION,
                "deprecated",
                0,
                None,
                None,
            ),
        )
        .expect("default version deprecates");

        let active = active_prompt_version(&database_path, "emergency-fallback-v0")
            .expect("fallback resolves");
        assert_eq!(active, "emergency-fallback-v0");

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn validate_prompt_version_rejects_invalid_state() {
        let empty = upsert_prompt_version_at_path(
            &PathBuf::from(":memory:"),
            prompt_registration("", "active", 100, None, None),
        );
        assert!(empty.is_err_and(|error| error.contains("cannot be empty")));

        let bad_status = upsert_prompt_version_at_path(
            &PathBuf::from(":memory:"),
            prompt_registration("code-explanation-v0.3", "experimental", 100, None, None),
        );
        assert!(bad_status.is_err_and(|error| error.contains("status is invalid")));

        let active_wrong_rollout = upsert_prompt_version_at_path(
            &PathBuf::from(":memory:"),
            prompt_registration("code-explanation-v0.3", "active", 80, None, None),
        );
        assert!(active_wrong_rollout.is_err_and(|error| error.contains("100 percent")));

        let rollback_without_source = upsert_prompt_version_at_path(
            &PathBuf::from(":memory:"),
            prompt_registration("code-explanation-v0.3", "rolled_back", 0, None, None),
        );
        assert!(rollback_without_source
            .is_err_and(|error| error.contains("rollback_from")));
    }

    fn prompt_registration(
        version: &str,
        status: &str,
        rollout_percent: u8,
        rollback_from: Option<&str>,
        notes: Option<&str>,
    ) -> PromptVersionRegistration {
        PromptVersionRegistration {
            version: version.to_string(),
            status: status.to_string(),
            rollout_percent,
            rollback_from: rollback_from.map(str::to_string),
            notes: notes.map(str::to_string),
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
