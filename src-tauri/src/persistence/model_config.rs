use rusqlite::params;
use std::path::Path;

pub(crate) struct StoredModelConfig {
    pub(crate) endpoint: String,
    pub(crate) model: String,
    pub(crate) timeout_seconds: u64,
    pub(crate) updated_at: String,
}

pub(crate) fn load_model_config(database_path: &Path) -> Result<Option<StoredModelConfig>, String> {
    let conn = super::open_database(database_path)?;
    let mut statement = conn
        .prepare(
            "SELECT endpoint, model, timeout_seconds, updated_at
             FROM model_provider_settings
             WHERE id = 'default'",
        )
        .map_err(super::database_error)?;
    let mut rows = statement.query([]).map_err(super::database_error)?;
    let Some(row) = rows.next().map_err(super::database_error)? else {
        return Ok(None);
    };
    let timeout_seconds: i64 = row.get(2).map_err(super::database_error)?;
    Ok(Some(StoredModelConfig {
        endpoint: row.get(0).map_err(super::database_error)?,
        model: row.get(1).map_err(super::database_error)?,
        timeout_seconds: usize::try_from(timeout_seconds.max(1))
            .unwrap_or(60)
            .min(300) as u64,
        updated_at: row.get(3).map_err(super::database_error)?,
    }))
}

pub(crate) fn save_model_config(
    database_path: &Path,
    endpoint: &str,
    model: &str,
    timeout_seconds: u64,
) -> Result<StoredModelConfig, String> {
    let conn = super::open_database(database_path)?;
    let updated_at = super::now_timestamp();
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
    .map_err(super::database_error)?;

    Ok(StoredModelConfig {
        endpoint: endpoint.to_string(),
        model: model.to_string(),
        timeout_seconds,
        updated_at,
    })
}

pub(crate) fn delete_model_config(database_path: &Path) -> Result<(), String> {
    let conn = super::open_database(database_path)?;
    conn.execute(
        "DELETE FROM model_provider_settings WHERE id = 'default'",
        [],
    )
    .map_err(super::database_error)?;
    Ok(())
}
