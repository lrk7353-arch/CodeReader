use rusqlite::{params, Connection};

use super::database_error;

pub(super) const LATEST_DATABASE_VERSION: i64 = 3;

pub(super) fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(database_error)?;

    let current_version = database_version(conn)?;
    if current_version > LATEST_DATABASE_VERSION {
        return Err(format!(
            "SQLite schema version {current_version} is newer than this CodeReader build supports (latest: {LATEST_DATABASE_VERSION})."
        ));
    }

    for version in (current_version + 1)..=LATEST_DATABASE_VERSION {
        run_migration(conn, version)?;
    }
    Ok(())
}

fn database_version(conn: &Connection) -> Result<i64, String> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(database_error)
}

fn run_migration(conn: &Connection, version: i64) -> Result<(), String> {
    conn.execute_batch("BEGIN IMMEDIATE;")
        .map_err(database_error)?;

    let result = match version {
        1 => migrate_to_v1(conn),
        2 => migrate_to_v2(conn),
        3 => migrate_to_v3(conn),
        _ => Err(format!(
            "No SQLite migration is registered for version {version}."
        )),
    }
    .and_then(|_| {
        conn.pragma_update(None, "user_version", version)
            .map_err(database_error)
    });

    match result {
        Ok(()) => conn.execute_batch("COMMIT;").map_err(database_error),
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(error)
        }
    }
}

fn migrate_to_v3(conn: &Connection) -> Result<(), String> {
    ensure_column(conn, "prompt_versions", "system_prompt_template", "TEXT")?;
    ensure_column(conn, "prompt_versions", "user_prompt_template", "TEXT")?;

    // Backfill the seed version with the built-in default templates so the
    // default active version carries its prompt content (not just a label).
    // Canary versions can then override either template via upsert.
    conn.execute(
        "UPDATE prompt_versions
         SET system_prompt_template = ?1,
             user_prompt_template = ?2
         WHERE version = ?3
           AND system_prompt_template IS NULL
           AND user_prompt_template IS NULL",
        params![
            super::prompt_registry::DEFAULT_SYSTEM_PROMPT_TEMPLATE,
            super::prompt_registry::DEFAULT_USER_PROMPT_TEMPLATE,
            super::prompt_registry::DEFAULT_GENERATION_PROMPT_VERSION
        ],
    )
    .map_err(database_error)?;
    Ok(())
}

fn migrate_to_v2(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS prompt_versions (
          version TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          rollout_percent INTEGER NOT NULL,
          rollback_from TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_prompt_versions_status
          ON prompt_versions(status, rollout_percent, updated_at);

        INSERT OR IGNORE INTO prompt_versions
          (version, status, rollout_percent, rollback_from, notes, created_at, updated_at)
        VALUES
          ('code-explanation-v0.1', 'active', 100, NULL, 'Default Beta prompt', datetime('now'), datetime('now'));
        ",
    )
    .map_err(database_error)
}

fn migrate_to_v1(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
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
          source_content TEXT,
          line_fingerprints TEXT,
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

        CREATE TABLE IF NOT EXISTS code_snapshot_nodes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          snapshot_id TEXT NOT NULL,
          code_node_id TEXT NOT NULL,
          node_type TEXT NOT NULL,
          symbol_name TEXT,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          code_hash TEXT NOT NULL,
          anchor_text TEXT
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

        CREATE TABLE IF NOT EXISTS project_guides (
          project_id TEXT PRIMARY KEY,
          root_path TEXT NOT NULL,
          source_fingerprint TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_map_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          relative_path TEXT NOT NULL,
          role TEXT NOT NULL,
          reason TEXT NOT NULL,
          sort_order INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reading_paths (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          file_id TEXT NOT NULL,
          relative_path TEXT NOT NULL,
          role TEXT NOT NULL,
          reason TEXT NOT NULL
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
          before_hash TEXT,
          after_hash TEXT,
          affected_explanations TEXT,
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
        ",
    )
    .map_err(database_error)?;

    ensure_column(conn, "explanation_nodes", "depends_on_lines", "TEXT")?;
    ensure_column(conn, "explanation_nodes", "affects_lines", "TEXT")?;
    ensure_column(conn, "explanation_nodes", "context_id", "TEXT")?;
    ensure_column(conn, "explanation_nodes", "context_sources", "TEXT")?;
    ensure_column(conn, "code_snapshots", "source_content", "TEXT")?;
    ensure_column(conn, "code_snapshots", "line_fingerprints", "TEXT")?;
    ensure_column(conn, "change_records", "before_hash", "TEXT")?;
    ensure_column(conn, "change_records", "after_hash", "TEXT")?;
    ensure_column(conn, "change_records", "affected_explanations", "TEXT")?;

    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_explanation_nodes_file
          ON explanation_nodes(project_id, file_id, snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_explanation_targets_explanation
          ON explanation_targets(project_id, explanation_id);
        CREATE INDEX IF NOT EXISTS idx_reading_states_explanation
          ON user_reading_states(project_id, explanation_id);
        CREATE INDEX IF NOT EXISTS idx_project_map_project
          ON project_map_items(project_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_reading_paths_project
          ON reading_paths(project_id, position);
        CREATE INDEX IF NOT EXISTS idx_snapshot_nodes_snapshot
          ON code_snapshot_nodes(project_id, file_id, snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_change_records_file
          ON change_records(project_id, file_id, after_snapshot_id);
        ",
    )
    .map_err(database_error)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_database_migrates_to_latest_version() {
        let conn = Connection::open_in_memory().expect("database opens");

        migrate(&conn).expect("migration succeeds");

        assert_eq!(
            database_version(&conn).expect("version reads"),
            LATEST_DATABASE_VERSION
        );
        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'explanation_nodes'",
                [],
                |row| row.get(0),
            )
            .expect("table query succeeds");
        assert_eq!(table_count, 1);
        let prompt_table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'prompt_versions'",
                [],
                |row| row.get(0),
            )
            .expect("prompt table query succeeds");
        assert_eq!(prompt_table_count, 1);
    }

    #[test]
    fn unversioned_mvp_database_receives_missing_columns() {
        let conn = Connection::open_in_memory().expect("database opens");
        migrate(&conn).expect("initial migration succeeds");
        conn.pragma_update(None, "user_version", 0)
            .expect("version resets");
        conn.execute_batch(
            "
            DROP INDEX IF EXISTS idx_explanation_nodes_file;
            CREATE TABLE legacy_explanation_nodes AS SELECT
              id, project_id, file_id, snapshot_id, code_node_id, explanation_type,
              start_line, end_line, code_level_meaning, local_composition_meaning,
              project_role_meaning, surface_meaning, actual_meaning, relational_meaning,
              global_role, prior_knowledge, risk_summary, learning_note, review_suggestion,
              trust_label, trust_reason, raw_confidence, display_mode, status,
              schema_version, prompt_version, model_info, created_at, updated_at
            FROM explanation_nodes;
            DROP TABLE explanation_nodes;
            ALTER TABLE legacy_explanation_nodes RENAME TO explanation_nodes;
            ",
        )
        .expect("legacy table is created");

        migrate(&conn).expect("legacy database upgrades");

        let columns = column_names(&conn, "explanation_nodes");
        assert!(columns.contains(&"depends_on_lines".to_string()));
        assert!(columns.contains(&"affects_lines".to_string()));
        assert!(columns.contains(&"context_id".to_string()));
        assert!(columns.contains(&"context_sources".to_string()));
        assert_eq!(
            database_version(&conn).expect("version reads"),
            LATEST_DATABASE_VERSION
        );
    }

    #[test]
    fn newer_database_is_rejected() {
        let conn = Connection::open_in_memory().expect("database opens");
        conn.pragma_update(None, "user_version", LATEST_DATABASE_VERSION + 1)
            .expect("version writes");

        let error = migrate(&conn).expect_err("future schema should be rejected");

        assert!(error.contains("newer than this CodeReader build supports"));
    }

    #[test]
    fn failed_migration_rolls_back_user_version() {
        let conn = Connection::open_in_memory().expect("database opens");
        conn.pragma_update(None, "user_version", 0)
            .expect("version writes");

        let error =
            run_migration(&conn, LATEST_DATABASE_VERSION + 1).expect_err("migration should fail");

        assert!(error.contains("No SQLite migration is registered"));
        assert_eq!(database_version(&conn).expect("version reads"), 0);
        conn.execute("CREATE TABLE rollback_probe (id INTEGER)", [])
            .expect("transaction should be closed after rollback");
    }

    #[test]
    fn version_one_database_receives_prompt_registry() {
        let conn = Connection::open_in_memory().expect("database opens");
        run_migration(&conn, 1).expect("v1 migration succeeds");
        assert_eq!(database_version(&conn).expect("version reads"), 1);

        migrate(&conn).expect("v1 database upgrades");

        assert_eq!(
            database_version(&conn).expect("version reads"),
            LATEST_DATABASE_VERSION
        );
        let status: String = conn
            .query_row(
                "SELECT status FROM prompt_versions WHERE version = 'code-explanation-v0.1'",
                [],
                |row| row.get(0),
            )
            .expect("default prompt version exists");
        assert_eq!(status, "active");
    }

    #[test]
    fn v2_database_receives_prompt_template_columns() {
        let conn = Connection::open_in_memory().expect("database opens");
        run_migration(&conn, 1).expect("v1 migration succeeds");
        run_migration(&conn, 2).expect("v2 migration succeeds");
        assert_eq!(database_version(&conn).expect("version reads"), 2);

        migrate(&conn).expect("v2 database upgrades to v3");
        assert_eq!(
            database_version(&conn).expect("version reads"),
            LATEST_DATABASE_VERSION
        );

        let columns = column_names(&conn, "prompt_versions");
        assert!(columns.contains(&"system_prompt_template".to_string()));
        assert!(columns.contains(&"user_prompt_template".to_string()));

        // The seed version should be backfilled with the default templates.
        let (system, user): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT system_prompt_template, user_prompt_template
                 FROM prompt_versions WHERE version = 'code-explanation-v0.1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("seed version templates query");
        assert!(
            system.is_some(),
            "seed system template should be backfilled"
        );
        assert!(user.is_some(), "seed user template should be backfilled");
        assert!(system.unwrap().contains("CodeReader"));
        assert!(user.unwrap().contains("{payload}"));
    }

    fn column_names(conn: &Connection, table: &str) -> Vec<String> {
        let mut statement = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .expect("table info prepares");
        statement
            .query_map([], |row| row.get(1))
            .expect("columns query")
            .collect::<Result<Vec<String>, _>>()
            .expect("columns collect")
    }
}
