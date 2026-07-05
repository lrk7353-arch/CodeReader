use rusqlite::{params, Connection};
use std::collections::HashSet;

use super::{
    database_error, i64_to_usize, optional_i64_to_usize, optional_usize_to_i64, parse_line_numbers,
    ChangeSummaryPayload, CodeNodeInput,
};
use crate::change_detection::{ChangeDetectionResult, ExplanationAnchor, SnapshotNode};
use crate::utils::sha256_hex;

pub(super) struct StoredSnapshot {
    pub(super) id: String,
    pub(super) source_content: String,
    pub(super) nodes: Vec<SnapshotNode>,
}

pub(super) fn load_previous_snapshot(
    conn: &Connection,
    project_id: &str,
    file_id: &str,
    content_hash: &str,
) -> Result<Option<StoredSnapshot>, String> {
    let snapshot = conn.query_row(
        "SELECT id, source_content
         FROM code_snapshots
         WHERE project_id = ?1 AND file_id = ?2 AND content_hash = ?3
           AND source_content IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1",
        params![project_id, file_id, content_hash],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );
    let (id, source_content) = match snapshot {
        Ok(snapshot) => snapshot,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(error) => return Err(database_error(error)),
    };
    let nodes = load_snapshot_nodes(conn, project_id, file_id, &id)?;
    Ok(Some(StoredSnapshot {
        id,
        source_content,
        nodes,
    }))
}

fn load_snapshot_nodes(
    conn: &Connection,
    project_id: &str,
    file_id: &str,
    snapshot_id: &str,
) -> Result<Vec<SnapshotNode>, String> {
    let mut statement = conn
        .prepare(
            "SELECT code_node_id, node_type, COALESCE(symbol_name, ''), start_line,
                    end_line, code_hash, COALESCE(anchor_text, '')
             FROM code_snapshot_nodes
             WHERE project_id = ?1 AND file_id = ?2 AND snapshot_id = ?3
             ORDER BY start_line, end_line, node_type",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map(
            params![project_id, file_id, snapshot_id],
            snapshot_node_from_row,
        )
        .map_err(database_error)?;
    collect_snapshot_nodes(rows)
}

pub(super) fn load_current_code_nodes(
    conn: &Connection,
    project_id: &str,
    file_id: &str,
) -> Result<Vec<SnapshotNode>, String> {
    let mut statement = conn
        .prepare(
            "SELECT id, node_type, COALESCE(symbol_name, ''), start_line,
                    end_line, COALESCE(code_hash, ''), COALESCE(symbol_name, '')
             FROM code_nodes
             WHERE project_id = ?1 AND file_id = ?2
             ORDER BY start_line, end_line, node_type",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map(params![project_id, file_id], snapshot_node_from_row)
        .map_err(database_error)?;
    collect_snapshot_nodes(rows)
}

fn snapshot_node_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SnapshotNode> {
    Ok(SnapshotNode {
        id: row.get(0)?,
        node_type: row.get(1)?,
        name: row.get(2)?,
        start_line: i64_to_usize(row.get(3)?),
        end_line: i64_to_usize(row.get(4)?),
        code_hash: row.get(5)?,
        anchor_text: row.get(6)?,
    })
}

fn collect_snapshot_nodes(
    rows: rusqlite::MappedRows<
        '_,
        impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<SnapshotNode>,
    >,
) -> Result<Vec<SnapshotNode>, String> {
    let mut nodes = Vec::new();
    for row in rows {
        nodes.push(row.map_err(database_error)?);
    }
    Ok(nodes)
}

pub(super) fn snapshot_nodes_from_input(nodes: &[CodeNodeInput]) -> Vec<SnapshotNode> {
    nodes
        .iter()
        .map(|node| SnapshotNode {
            id: node.id.clone(),
            node_type: node.node_type.clone(),
            name: node.name.clone(),
            start_line: node.start_line,
            end_line: node.end_line,
            code_hash: node.code_hash.clone(),
            anchor_text: node.anchor_text.clone(),
        })
        .collect()
}

pub(super) fn load_explanation_anchors(
    conn: &Connection,
    project_id: &str,
    file_id: &str,
    snapshot_id: &str,
) -> Result<Vec<ExplanationAnchor>, String> {
    let mut statement = conn
        .prepare(
            "SELECT e.id, t.status, t.target_type, t.start_line, t.end_line, t.code_hash,
                    t.anchor_text, t.code_node_id, e.depends_on_lines, e.affects_lines
             FROM explanation_nodes e
             JOIN explanation_targets t
               ON t.project_id = e.project_id AND t.explanation_id = e.id
             WHERE e.project_id = ?1 AND e.file_id = ?2 AND e.snapshot_id = ?3",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map(params![project_id, file_id, snapshot_id], |row| {
            Ok(ExplanationAnchor {
                id: row.get(0)?,
                status: row.get(1)?,
                target_type: row.get(2)?,
                start_line: optional_i64_to_usize(row.get(3)?),
                end_line: optional_i64_to_usize(row.get(4)?),
                code_hash: row.get(5)?,
                anchor_text: row.get(6)?,
                code_node_id: row.get(7)?,
                depends_on_lines: parse_line_numbers(row.get(8)?),
                affects_lines: parse_line_numbers(row.get(9)?),
            })
        })
        .map_err(database_error)?;
    let mut explanations = Vec::new();
    for row in rows {
        explanations.push(row.map_err(database_error)?);
    }
    Ok(explanations)
}

pub(super) fn load_covered_code_node_ids(
    conn: &Connection,
    project_id: &str,
    file_id: &str,
    snapshot_id: &str,
) -> Result<HashSet<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT DISTINCT code_node_id
             FROM explanation_nodes
             WHERE project_id = ?1 AND file_id = ?2 AND snapshot_id = ?3
               AND code_node_id IS NOT NULL",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map(params![project_id, file_id, snapshot_id], |row| {
            row.get::<_, String>(0)
        })
        .map_err(database_error)?;
    let mut node_ids = HashSet::new();
    for row in rows {
        node_ids.insert(row.map_err(database_error)?);
    }
    Ok(node_ids)
}

pub(super) struct ChangeDetectionPersistence<'a> {
    pub(super) project_id: &'a str,
    pub(super) file_id: &'a str,
    pub(super) after_hash: &'a str,
    pub(super) after_snapshot_id: &'a str,
    pub(super) before_snapshot_id: Option<&'a str>,
    pub(super) detection: &'a ChangeDetectionResult,
    pub(super) created_at: &'a str,
}

pub(super) fn apply_change_detection(
    conn: &Connection,
    context: ChangeDetectionPersistence<'_>,
) -> Result<(), String> {
    let ChangeDetectionPersistence {
        project_id,
        file_id,
        after_hash,
        after_snapshot_id,
        before_snapshot_id,
        detection,
        created_at,
    } = context;

    for migration in &detection.migrations {
        conn.execute(
            "UPDATE explanation_nodes
             SET snapshot_id = ?1, code_node_id = ?2, start_line = ?3, end_line = ?4,
                 status = ?5, updated_at = ?6
             WHERE project_id = ?7 AND file_id = ?8 AND id = ?9",
            params![
                after_snapshot_id,
                migration.code_node_id,
                optional_usize_to_i64(migration.start_line),
                optional_usize_to_i64(migration.end_line),
                migration.status,
                created_at,
                project_id,
                file_id,
                migration.explanation_id
            ],
        )
        .map_err(database_error)?;
        conn.execute(
            "UPDATE explanation_targets
             SET file_hash = ?1, snapshot_id = ?2, code_node_id = ?3,
                 start_line = ?4, end_line = ?5, code_hash = ?6, ast_hash = ?6,
                 anchor_text = ?7, status = ?8, updated_at = ?9
             WHERE project_id = ?10 AND explanation_id = ?11",
            params![
                after_hash,
                after_snapshot_id,
                migration.code_node_id,
                optional_usize_to_i64(migration.start_line),
                optional_usize_to_i64(migration.end_line),
                migration.code_hash,
                migration.anchor_text,
                migration.status,
                created_at,
                project_id,
                migration.explanation_id
            ],
        )
        .map_err(database_error)?;
    }

    let before_hash = before_snapshot_id
        .and_then(|snapshot_id| {
            conn.query_row(
                "SELECT content_hash FROM code_snapshots WHERE id = ?1",
                params![snapshot_id],
                |row| row.get::<_, String>(0),
            )
            .ok()
        })
        .unwrap_or_default();
    let affected_explanations = serde_json::to_string(&detection.affected_explanation_ids)
        .map_err(|error| format!("Failed to serialize affected explanations: {error}"))?;
    let record_id = format!(
        "change:{}",
        &sha256_hex(&format!(
            "{project_id}:{file_id}:{before_hash}:{after_hash}"
        ))[..24]
    );
    conn.execute(
        "INSERT INTO change_records
         (id, project_id, file_id, before_snapshot_id, after_snapshot_id,
          added_lines, modified_lines, deleted_lines, added_nodes, modified_nodes,
          deleted_nodes, before_hash, after_hash, affected_explanations, summary, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
         ON CONFLICT(id) DO UPDATE SET
           affected_explanations = excluded.affected_explanations,
           summary = excluded.summary,
           created_at = excluded.created_at",
        params![
            record_id,
            project_id,
            file_id,
            before_snapshot_id,
            after_snapshot_id,
            detection.counts.added_lines as i64,
            detection.counts.modified_lines as i64,
            detection.counts.deleted_lines as i64,
            detection.counts.added_nodes as i64,
            detection.counts.modified_nodes as i64,
            detection.counts.deleted_nodes as i64,
            before_hash,
            after_hash,
            affected_explanations,
            detection.summary,
            created_at
        ],
    )
    .map_err(database_error)?;
    Ok(())
}

pub(super) fn load_change_summary(
    conn: &Connection,
    project_id: &str,
    file_id: &str,
    after_snapshot_id: &str,
) -> Result<Option<ChangeSummaryPayload>, String> {
    let row = conn.query_row(
        "SELECT id, COALESCE(before_hash, ''), COALESCE(after_hash, ''),
                added_lines, modified_lines, deleted_lines, added_nodes,
                modified_nodes, deleted_nodes, affected_explanations, summary, created_at
         FROM change_records
         WHERE project_id = ?1 AND file_id = ?2 AND after_snapshot_id = ?3
         ORDER BY created_at DESC
         LIMIT 1",
        params![project_id, file_id, after_snapshot_id],
        |row| {
            let affected: Option<String> = row.get(9)?;
            Ok(ChangeSummaryPayload {
                id: row.get(0)?,
                before_hash: row.get(1)?,
                after_hash: row.get(2)?,
                added_lines: i64_to_usize(row.get(3)?),
                modified_lines: i64_to_usize(row.get(4)?),
                deleted_lines: i64_to_usize(row.get(5)?),
                added_nodes: i64_to_usize(row.get(6)?),
                modified_nodes: i64_to_usize(row.get(7)?),
                deleted_nodes: i64_to_usize(row.get(8)?),
                affected_explanation_ids: affected
                    .and_then(|value| serde_json::from_str(&value).ok())
                    .unwrap_or_default(),
                summary: row.get(10)?,
                created_at: row.get(11)?,
            })
        },
    );
    match row {
        Ok(summary) => Ok(Some(summary)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(database_error(error)),
    }
}
