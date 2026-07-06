use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(not(test))]
use tauri::AppHandle;

use crate::utils::sha256_hex;

pub(crate) const DEFAULT_GENERATION_PROMPT_VERSION: &str = "code-explanation-v0.1";

pub(crate) struct PromptVersionRegistration {
    pub(crate) version: String,
    pub(crate) status: String,
    pub(crate) rollout_percent: u8,
    pub(crate) rollback_from: Option<String>,
    pub(crate) notes: Option<String>,
}

#[derive(Debug)]
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
    Ok(record_to_payload(record))
}

#[cfg(not(test))]
#[tauri::command]
pub fn list_prompt_versions(app: AppHandle) -> Result<Vec<PromptVersionPayload>, String> {
    let database_path = super::database_path(&app)?;
    let records = list_prompt_versions_at_path(&database_path)?;
    Ok(records.into_iter().map(record_to_payload).collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackPromptVersionRequest {
    target_version: String,
    failed_version: String,
    notes: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackPromptVersionPayload {
    target: PromptVersionPayload,
    failed: PromptVersionPayload,
}

#[cfg(not(test))]
#[tauri::command]
pub fn rollback_prompt_version(
    app: AppHandle,
    request: RollbackPromptVersionRequest,
) -> Result<RollbackPromptVersionPayload, String> {
    let database_path = super::database_path(&app)?;
    let (target, failed) = rollback_prompt_version_at_path(
        &database_path,
        &request.target_version,
        &request.failed_version,
        request.notes.as_deref(),
    )?;
    Ok(RollbackPromptVersionPayload {
        target: record_to_payload(target),
        failed: record_to_payload(failed),
    })
}

fn record_to_payload(record: PromptVersionRecord) -> PromptVersionPayload {
    PromptVersionPayload {
        version: record.version,
        status: record.status,
        rollout_percent: record.rollout_percent,
        rollback_from: record.rollback_from,
        notes: record.notes,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
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

#[allow(dead_code)]
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

/// Selects a prompt version for generation, honoring canary rollout percentages.
///
/// `sample` is a caller-provided random value in `[0.0, 1.0)` so the roll logic
/// stays deterministic under test. When both an `active` row and one or more
/// `canary` rows exist, the highest-percentage canary is chosen with probability
/// `canary.rollout_percent / 100`; otherwise the active row wins. With no active
/// row, the highest-percentage canary is always selected. An empty table falls
/// back to `fallback_version`, matching `active_prompt_version`.
pub(crate) fn pick_prompt_version(
    database_path: &Path,
    fallback_version: &str,
    sample: f64,
) -> Result<String, String> {
    let conn = super::open_database(database_path)?;
    let active = load_active_version(&conn)?;
    let canary = load_top_canary(&conn)?;
    match (active, canary) {
        (Some(active), Some(canary)) => {
            let threshold = (canary.rollout_percent as f64) / 100.0;
            if sample < threshold {
                Ok(canary.version)
            } else {
                Ok(active)
            }
        }
        (Some(active), None) => Ok(active),
        (None, Some(canary)) => Ok(canary.version),
        (None, None) => Ok(fallback_version.to_string()),
    }
}

/// Selects a prompt version for a specific generation target using a stable
/// hash of `project_id + file_path + target_id` as the rollout sample.
///
/// This keeps canary selection reproducible across regenerations of the same
/// target (so a known-good file does not flip between active and canary on
/// every refresh) while still distributing different targets across the canary
/// bucket according to `rollout_percent`.
pub(crate) fn pick_prompt_version_for_target(
    database_path: &Path,
    fallback_version: &str,
    project_id: &str,
    file_path: &str,
    target_id: &str,
) -> Result<String, String> {
    let digest = sha256_hex(&format!("{project_id}:{file_path}:{target_id}"));
    // Take the first 8 hex chars (32 bits) and map to [0.0, 1.0).
    let prefix = u32::from_str_radix(&digest[..8], 16).unwrap_or(0);
    let sample = (prefix as f64) / (u32::MAX as f64);
    pick_prompt_version(database_path, fallback_version, sample)
}

fn load_active_version(conn: &Connection) -> Result<Option<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT version
             FROM prompt_versions
             WHERE status = 'active' AND rollout_percent > 0
             ORDER BY updated_at DESC
             LIMIT 1",
        )
        .map_err(super::database_error)?;
    let mut rows = statement.query([]).map_err(super::database_error)?;
    if let Some(row) = rows.next().map_err(super::database_error)? {
        return row.get(0).map(Some).map_err(super::database_error);
    }
    Ok(None)
}

fn load_top_canary(conn: &Connection) -> Result<Option<PromptVersionRecord>, String> {
    let mut statement = conn
        .prepare(
            "SELECT version, status, rollout_percent, rollback_from, notes, created_at, updated_at
             FROM prompt_versions
             WHERE status = 'canary' AND rollout_percent > 0
             ORDER BY rollout_percent DESC, updated_at DESC
             LIMIT 1",
        )
        .map_err(super::database_error)?;
    let mut rows = statement.query([]).map_err(super::database_error)?;
    if let Some(row) = rows.next().map_err(super::database_error)? {
        let rollout_percent: i64 = row.get(2).map_err(super::database_error)?;
        return Ok(Some(PromptVersionRecord {
            version: row.get(0).map_err(super::database_error)?,
            status: row.get(1).map_err(super::database_error)?,
            rollout_percent: rollout_percent.clamp(0, 100) as u8,
            rollback_from: row.get(3).map_err(super::database_error)?,
            notes: row.get(4).map_err(super::database_error)?,
            created_at: row.get(5).map_err(super::database_error)?,
            updated_at: row.get(6).map_err(super::database_error)?,
        }));
    }
    Ok(None)
}

pub(crate) fn list_prompt_versions_at_path(
    database_path: &Path,
) -> Result<Vec<PromptVersionRecord>, String> {
    let conn = super::open_database(database_path)?;
    let mut statement = conn
        .prepare(
            "SELECT version, status, rollout_percent, rollback_from, notes, created_at, updated_at
             FROM prompt_versions
             ORDER BY updated_at DESC, version ASC",
        )
        .map_err(super::database_error)?;
    let rows = statement
        .query_map([], |row| {
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
        })
        .map_err(super::database_error)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(super::database_error)?);
    }
    Ok(records)
}

pub(crate) fn rollback_prompt_version_at_path(
    database_path: &Path,
    target_version: &str,
    failed_version: &str,
    notes: Option<&str>,
) -> Result<(PromptVersionRecord, PromptVersionRecord), String> {
    if target_version == failed_version {
        return Err("Rollback target and failed version must differ.".to_string());
    }

    let mut conn = super::open_database(database_path)?;
    let tx = conn.transaction().map_err(super::database_error)?;
    let now = super::now_timestamp();

    let target_exists: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM prompt_versions WHERE version = ?1",
            params![target_version],
            |row| row.get(0),
        )
        .map_err(super::database_error)?;
    if target_exists == 0 {
        return Err(format!(
            "Rollback target version '{target_version}' is not registered."
        ));
    }
    let failed_exists: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM prompt_versions WHERE version = ?1",
            params![failed_version],
            |row| row.get(0),
        )
        .map_err(super::database_error)?;
    if failed_exists == 0 {
        return Err(format!(
            "Failed version '{failed_version}' is not registered."
        ));
    }

    tx.execute(
        "UPDATE prompt_versions
         SET status = 'active', rollout_percent = 100, rollback_from = NULL, notes = NULL,
             updated_at = ?2
         WHERE version = ?1",
        params![target_version, now],
    )
    .map_err(super::database_error)?;

    tx.execute(
        "UPDATE prompt_versions
         SET status = 'rolled_back', rollout_percent = 0, rollback_from = ?2, notes = ?3,
             updated_at = ?4
         WHERE version = ?1",
        params![failed_version, target_version, notes, now],
    )
    .map_err(super::database_error)?;

    tx.commit().map_err(super::database_error)?;

    let target = load_prompt_version(&conn, target_version)?;
    let failed = load_prompt_version(&conn, failed_version)?;
    Ok((target, failed))
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
            active, DEFAULT_GENERATION_PROMPT_VERSION,
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

        let promoted =
            active_prompt_version(&database_path, "fallback-v0").expect("canary is promoted");
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
        assert!(record
            .notes
            .as_deref()
            .is_some_and(|notes| notes.contains("malformed JSON")));

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
        assert!(rollback_without_source.is_err_and(|error| error.contains("rollback_from")));
    }

    #[test]
    fn pick_prompt_version_splits_traffic_by_canary_percent() {
        let database_path = temp_database_path("prompt-pick-canary");
        super::super::open_database(&database_path).expect("database initializes");
        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration("code-explanation-v0.2-rc1", "canary", 30, None, None),
        )
        .expect("canary registers");

        // Active stays seeded default; canary is 30%.
        assert_eq!(
            pick_prompt_version(&database_path, "fallback-v0", 0.0).expect("low sample → canary"),
            "code-explanation-v0.2-rc1",
            "sample below threshold should pick canary"
        );
        assert_eq!(
            pick_prompt_version(&database_path, "fallback-v0", 0.29)
                .expect("just-under threshold → canary"),
            "code-explanation-v0.2-rc1"
        );
        assert_eq!(
            pick_prompt_version(&database_path, "fallback-v0", 0.3)
                .expect("at threshold → active"),
            DEFAULT_GENERATION_PROMPT_VERSION,
            "sample at/above threshold should pick active"
        );
        assert_eq!(
            pick_prompt_version(&database_path, "fallback-v0", 0.99)
                .expect("high sample → active"),
            DEFAULT_GENERATION_PROMPT_VERSION
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn pick_prompt_version_falls_back_without_active_or_canary() {
        let database_path = temp_database_path("prompt-pick-fallback");
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
        .expect("default deprecates");

        assert_eq!(
            pick_prompt_version(&database_path, "emergency-fallback-v0", 0.5)
                .expect("fallback resolves"),
            "emergency-fallback-v0"
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn pick_prompt_version_uses_canary_when_no_active() {
        let database_path = temp_database_path("prompt-pick-canary-only");
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
        .expect("default deprecates");
        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration("code-explanation-v0.2-rc1", "canary", 50, None, None),
        )
        .expect("canary registers");

        // No active row → canary wins regardless of sample.
        assert_eq!(
            pick_prompt_version(&database_path, "fallback-v0", 0.0)
                .expect("canary picked at low sample"),
            "code-explanation-v0.2-rc1"
        );
        assert_eq!(
            pick_prompt_version(&database_path, "fallback-v0", 0.9)
                .expect("canary picked at high sample"),
            "code-explanation-v0.2-rc1"
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn pick_prompt_version_for_target_is_stable_across_calls() {
        let database_path = temp_database_path("prompt-pick-stable");
        super::super::open_database(&database_path).expect("database initializes");
        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration("code-explanation-v0.2-rc1", "canary", 30, None, None),
        )
        .expect("canary registers");

        // Same target inputs must resolve to the same version on every call.
        let first = pick_prompt_version_for_target(
            &database_path,
            "fallback-v0",
            "project:sample",
            "examples/sample.ts",
            "exp:target:sample:function",
        )
        .expect("first call resolves");
        for _ in 0..5 {
            let again = pick_prompt_version_for_target(
                &database_path,
                "fallback-v0",
                "project:sample",
                "examples/sample.ts",
                "exp:target:sample:function",
            )
            .expect("repeat call resolves");
            assert_eq!(again, first, "same target must pick same version");
        }

        // Different targets should be able to resolve independently (no panic,
        // valid version string). We do not assert which bucket they land in.
        let other = pick_prompt_version_for_target(
            &database_path,
            "fallback-v0",
            "project:other",
            "other/path.ts",
            "exp:other",
        )
        .expect("other target resolves");
        assert!(
            other == DEFAULT_GENERATION_PROMPT_VERSION || other == "code-explanation-v0.2-rc1",
            "other target should pick a registered version"
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn list_prompt_versions_orders_by_updated_at_desc() {
        let database_path = temp_database_path("prompt-list");
        super::super::open_database(&database_path).expect("database initializes");
        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration("code-explanation-v0.2-rc1", "canary", 30, None, None),
        )
        .expect("canary registers");
        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration("code-explanation-v0.2-rc2", "canary", 40, None, None),
        )
        .expect("second canary registers");

        let records = list_prompt_versions_at_path(&database_path).expect("list resolves");
        assert_eq!(records.len(), 3, "seed default + two canaries");
        // Both canaries were upserted after the seed default, so the seed row
        // (earliest updated_at) must sort last. The two canaries may share a
        // second-precision timestamp, so their relative order falls back to
        // version ASC and is not asserted here.
        let versions: Vec<&str> = records.iter().map(|r| r.version.as_str()).collect();
        assert!(versions.contains(&"code-explanation-v0.2-rc1"));
        assert!(versions.contains(&"code-explanation-v0.2-rc2"));
        assert_eq!(
            records.last().expect("at least one record").version,
            DEFAULT_GENERATION_PROMPT_VERSION,
            "seed default should sort last"
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn rollback_prompt_version_swaps_active_and_rolled_back_atomically() {
        let database_path = temp_database_path("prompt-rollback-swap");
        super::super::open_database(&database_path).expect("database initializes");
        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration("code-explanation-v0.2-rc1", "canary", 50, None, None),
        )
        .expect("canary registers");
        // Promote canary to active by deprecating the default.
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
        .expect("default deprecates");
        upsert_prompt_version_at_path(
            &database_path,
            prompt_registration("code-explanation-v0.2-rc1", "active", 100, None, None),
        )
        .expect("canary promoted to active");

        let (target, failed) = rollback_prompt_version_at_path(
            &database_path,
            DEFAULT_GENERATION_PROMPT_VERSION,
            "code-explanation-v0.2-rc1",
            Some("Canary produced malformed JSON in 12% of requests."),
        )
        .expect("rollback swaps");

        assert_eq!(target.version, DEFAULT_GENERATION_PROMPT_VERSION);
        assert_eq!(target.status, "active");
        assert_eq!(target.rollout_percent, 100);
        assert!(target.rollback_from.is_none());
        assert_eq!(failed.version, "code-explanation-v0.2-rc1");
        assert_eq!(failed.status, "rolled_back");
        assert_eq!(failed.rollout_percent, 0);
        assert_eq!(
            failed.rollback_from.as_deref(),
            Some(DEFAULT_GENERATION_PROMPT_VERSION)
        );
        assert!(failed
            .notes
            .as_deref()
            .is_some_and(|notes| notes.contains("malformed JSON")));

        // After rollback, generation should pick the restored active version.
        assert_eq!(
            pick_prompt_version(&database_path, "fallback-v0", 0.5)
                .expect("active restored after rollback"),
            DEFAULT_GENERATION_PROMPT_VERSION
        );

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn rollback_prompt_version_rejects_same_target_and_failed() {
        let database_path = temp_database_path("prompt-rollback-same");
        super::super::open_database(&database_path).expect("database initializes");

        let error = rollback_prompt_version_at_path(
            &database_path,
            DEFAULT_GENERATION_PROMPT_VERSION,
            DEFAULT_GENERATION_PROMPT_VERSION,
            None,
        )
        .expect_err("same target/failed should reject");
        assert!(error.contains("must differ"));

        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn rollback_prompt_version_rejects_unknown_target() {
        let database_path = temp_database_path("prompt-rollback-unknown");
        super::super::open_database(&database_path).expect("database initializes");

        let error = rollback_prompt_version_at_path(
            &database_path,
            "never-registered",
            DEFAULT_GENERATION_PROMPT_VERSION,
            None,
        )
        .expect_err("unknown target should reject");
        assert!(error.contains("not registered"));

        let _ = std::fs::remove_file(database_path);
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
