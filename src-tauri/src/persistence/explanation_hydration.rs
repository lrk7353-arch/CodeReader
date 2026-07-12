use rusqlite::{params, Connection, Error as SqliteError, TransactionBehavior};
use std::collections::HashSet;
use std::path::Path;

use super::change_tracking::{
    apply_change_detection, load_change_summary, load_covered_code_node_ids,
    load_current_code_nodes, load_explanation_anchors, load_previous_snapshot,
    snapshot_nodes_from_input, ChangeDetectionPersistence,
};
use super::{
    database_error, display_path, join_notes, line_count, now_timestamp, open_database,
    optional_i64_to_usize, optional_usize_to_i64, parse_line_numbers, reading_state_id,
    serialize_line_fingerprints, serialize_line_numbers, snapshot_node_id, stable_project_id,
    CodeNodeInput, ExplanationInput, ExplanationPayload, GeneratedExplanationInput,
    HydrateCodeFileRequest, HydratedCodeFilePayload, EXPLANATION_SCHEMA_VERSION, PROMPT_VERSION,
};
use crate::app_error::STALE_GENERATION_PERSISTENCE_ERROR;
use crate::change_detection::detect_changes;
use crate::utils::sha256_hex;

pub(crate) fn hydrate_code_file_at_path(
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
    let previous_hash = tx
        .query_row(
            "SELECT last_analyzed_hash FROM files WHERE id = ?1",
            params![request.file.id],
            |row| row.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten();
    let previous_snapshot = previous_hash
        .as_deref()
        .and_then(|hash| load_previous_snapshot(&tx, &project_id, &request.file.id, hash).ok())
        .flatten();
    let change_detection = if previous_hash
        .as_deref()
        .is_some_and(|hash| hash != file_hash)
    {
        let previous_snapshot_id = previous_snapshot
            .as_ref()
            .map(|snapshot| snapshot.id.clone())
            .or_else(|| {
                previous_hash
                    .as_ref()
                    .map(|hash| format!("snapshot:{}", &hash[..16.min(hash.len())]))
            });
        let old_nodes = previous_snapshot
            .as_ref()
            .map(|snapshot| snapshot.nodes.clone())
            .unwrap_or_else(|| {
                load_current_code_nodes(&tx, &project_id, &request.file.id).unwrap_or_default()
            });
        let explanations = previous_snapshot_id
            .as_deref()
            .map(|old_snapshot_id| {
                load_explanation_anchors(&tx, &project_id, &request.file.id, old_snapshot_id)
            })
            .transpose()?
            .unwrap_or_default();
        let old_code = previous_snapshot
            .as_ref()
            .map(|snapshot| snapshot.source_content.as_str())
            .unwrap_or(request.file.code.as_str());
        let new_nodes = snapshot_nodes_from_input(&request.file.code_nodes);
        Some((
            previous_snapshot_id,
            detect_changes(
                old_code,
                &request.file.code,
                &old_nodes,
                &new_nodes,
                &explanations,
            ),
        ))
    } else {
        None
    };

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
        "INSERT INTO code_snapshots
         (id, project_id, file_id, content_hash, line_count, source_content,
          line_fingerprints, snapshot_reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'file_loaded', ?8)
         ON CONFLICT(id) DO UPDATE SET
           source_content = COALESCE(code_snapshots.source_content, excluded.source_content),
           line_fingerprints = COALESCE(code_snapshots.line_fingerprints, excluded.line_fingerprints)",
        params![
            snapshot_id,
            project_id,
            request.file.id,
            file_hash,
            line_count as i64,
            request.file.code,
            serialize_line_fingerprints(&request.file.code)?,
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

        tx.execute(
            "INSERT OR REPLACE INTO code_snapshot_nodes
             (id, project_id, file_id, snapshot_id, code_node_id, node_type,
              symbol_name, start_line, end_line, code_hash, anchor_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                snapshot_node_id(&snapshot_id, &node.id),
                project_id,
                request.file.id,
                snapshot_id,
                node.id,
                node.node_type,
                node.name,
                node.start_line as i64,
                node.end_line as i64,
                node.code_hash,
                node.anchor_text
            ],
        )
        .map_err(database_error)?;
    }

    let mut covered_new_node_ids = if let Some((before_snapshot_id, detection)) = &change_detection
    {
        apply_change_detection(
            &tx,
            ChangeDetectionPersistence {
                project_id: &project_id,
                file_id: &request.file.id,
                after_hash: &file_hash,
                after_snapshot_id: &snapshot_id,
                before_snapshot_id: before_snapshot_id.as_deref(),
                detection,
                created_at: &now,
            },
        )?;
        detection.covered_new_node_ids.clone()
    } else {
        HashSet::new()
    };
    covered_new_node_ids.extend(load_covered_code_node_ids(
        &tx,
        &project_id,
        &request.file.id,
        &snapshot_id,
    )?);

    for explanation in &request.seed_explanations {
        let code_node_id = code_node_id_for(explanation, &request.file.code_nodes);
        if code_node_id
            .as_ref()
            .is_some_and(|node_id| covered_new_node_ids.contains(node_id))
        {
            continue;
        }
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
                EXPLANATION_SCHEMA_VERSION,
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
               status = CASE
                 WHEN explanation_targets.status = 'valid'
                   AND explanation_targets.snapshot_id = excluded.snapshot_id
                   AND explanation_targets.code_hash = excluded.code_hash
                   AND excluded.status IN ('new_unexplained', 'transient')
                 THEN explanation_targets.status
                 ELSE excluded.status
               END,
               updated_at = CASE
                 WHEN explanation_targets.status = 'valid'
                   AND explanation_targets.snapshot_id = excluded.snapshot_id
                   AND explanation_targets.code_hash = excluded.code_hash
                   AND excluded.status IN ('new_unexplained', 'transient')
                 THEN explanation_targets.updated_at
                 ELSE excluded.updated_at
               END",
            params![
                target_id,
                project_id,
                explanation.id,
                explanation.target_type,
                request.file.id,
                explanation.file_path,
                explanation
                    .file_hash
                    .clone()
                    .or_else(|| Some(file_hash.clone())),
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
    let change_summary = load_change_summary(&tx, &project_id, &request.file.id, &snapshot_id)?;
    tx.commit().map_err(database_error)?;

    Ok(HydratedCodeFilePayload {
        explanations,
        database_path: display_path(database_path),
        project_id,
        change_summary,
    })
}

pub(crate) fn save_generated_explanation(
    database_path: &Path,
    input: GeneratedExplanationInput,
) -> Result<ExplanationPayload, String> {
    let mut conn = open_database(database_path)?;
    // Take the write reservation before comparing the expected file state. A
    // concurrent hydrate cannot advance the file hash between this check and
    // the explanation write.
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let now = now_timestamp();
    let project_id = input.project_id.clone().unwrap_or_else(|| {
        let root = input
            .project_root
            .as_deref()
            .unwrap_or(input.file_path.as_str());
        format!("project:{}", &sha256_hex(root)[..20])
    });
    let current_file_state = tx.query_row(
        "SELECT content_hash, last_analyzed_hash, language
         FROM files
         WHERE id = ?1 AND project_id = ?2",
        params![input.file_id, project_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    );
    let (current_content_hash, current_analyzed_hash, current_language) = match current_file_state {
        Ok(state) => state,
        Err(SqliteError::QueryReturnedNoRows) => {
            return Err(STALE_GENERATION_PERSISTENCE_ERROR.to_string())
        }
        Err(error) => return Err(database_error(error)),
    };
    if current_content_hash != input.file_hash
        || current_analyzed_hash != input.file_hash
        || current_language != input.language
    {
        return Err(STALE_GENERATION_PERSISTENCE_ERROR.to_string());
    }
    let snapshot_is_current = tx
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM code_snapshots
               WHERE id = ?1 AND project_id = ?2 AND file_id = ?3 AND content_hash = ?4
                 AND line_count = ?5
             )",
            params![
                input.snapshot_id,
                project_id,
                input.file_id,
                input.file_hash,
                input.line_count as i64
            ],
            |row| row.get::<_, bool>(0),
        )
        .map_err(database_error)?;
    if !snapshot_is_current {
        return Err(STALE_GENERATION_PERSISTENCE_ERROR.to_string());
    }
    let created_at = tx
        .query_row(
            "SELECT created_at FROM explanation_nodes WHERE id = ?1",
            params![input.explanation_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| now.clone());
    let risk_summary = join_notes(Some(&input.risk_notes));
    let depends_on_lines = serialize_line_numbers(&input.depends_on_lines)?;
    let affects_lines = serialize_line_numbers(&input.affects_lines)?;

    tx.execute(
        "INSERT INTO explanation_nodes
         (id, project_id, file_id, snapshot_id, code_node_id, explanation_type,
          start_line, end_line, code_level_meaning, local_composition_meaning,
          project_role_meaning, prior_knowledge, risk_summary, learning_note,
          review_suggestion, trust_label, trust_reason, depends_on_lines,
          affects_lines, display_mode, status, schema_version, prompt_version,
          model_info, context_id, context_sources, created_at, updated_at)
         VALUES
         (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
          ?14, ?15, ?16, ?17, ?18, ?19, ?20, 'valid', ?21, ?22, ?23,
          ?24, ?25, ?26, ?27)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           file_id = excluded.file_id,
           snapshot_id = excluded.snapshot_id,
           code_node_id = excluded.code_node_id,
           explanation_type = excluded.explanation_type,
           start_line = excluded.start_line,
           end_line = excluded.end_line,
           code_level_meaning = excluded.code_level_meaning,
           local_composition_meaning = excluded.local_composition_meaning,
           project_role_meaning = excluded.project_role_meaning,
           prior_knowledge = excluded.prior_knowledge,
           risk_summary = excluded.risk_summary,
           learning_note = excluded.learning_note,
           review_suggestion = excluded.review_suggestion,
           trust_label = excluded.trust_label,
           trust_reason = excluded.trust_reason,
           depends_on_lines = excluded.depends_on_lines,
           affects_lines = excluded.affects_lines,
           display_mode = excluded.display_mode,
           status = excluded.status,
           schema_version = excluded.schema_version,
           prompt_version = excluded.prompt_version,
           model_info = excluded.model_info,
           context_id = excluded.context_id,
           context_sources = excluded.context_sources,
           updated_at = excluded.updated_at",
        params![
            input.explanation_id,
            project_id,
            input.file_id,
            input.snapshot_id,
            input.code_node_id,
            input.target_type,
            input.start_line as i64,
            input.end_line as i64,
            input.code_level_meaning,
            input.local_composition_meaning,
            input.project_role_meaning,
            input.prior_knowledge,
            risk_summary,
            input.learning_note,
            input.review_suggestion,
            input.trust_label,
            input.trust_reason,
            depends_on_lines,
            affects_lines,
            input.display_mode,
            EXPLANATION_SCHEMA_VERSION,
            input.prompt_version,
            input.model_info,
            input.context_id,
            input.context_sources,
            created_at,
            now
        ],
    )
    .map_err(database_error)?;

    let target_id = format!("target:{}", input.explanation_id);
    tx.execute(
        "INSERT INTO explanation_targets
         (id, project_id, explanation_id, target_type, file_id, file_path, file_hash,
          snapshot_id, code_node_id, symbol_id, start_line, end_line, code_hash,
          ast_hash, anchor_text, status, created_at, updated_at)
         VALUES
         (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
          ?13, ?14, 'valid', ?15, ?16)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           explanation_id = excluded.explanation_id,
           target_type = excluded.target_type,
           file_id = excluded.file_id,
           file_path = excluded.file_path,
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
            input.explanation_id,
            input.target_type,
            input.file_id,
            input.file_path,
            input.file_hash,
            input.snapshot_id,
            input.code_node_id,
            input.symbol_id,
            input.start_line as i64,
            input.end_line as i64,
            input.code_hash,
            input.anchor_text,
            created_at,
            now
        ],
    )
    .map_err(database_error)?;

    tx.execute(
        "INSERT OR IGNORE INTO user_reading_states
         (id, project_id, explanation_id, state, note, updated_at)
         VALUES (?1, ?2, ?3, 'unread', NULL, ?4)",
        params![
            reading_state_id(&project_id, &input.explanation_id),
            project_id,
            input.explanation_id,
            now
        ],
    )
    .map_err(database_error)?;

    let reading_state = tx
        .query_row(
            "SELECT state FROM user_reading_states
             WHERE project_id = ?1 AND explanation_id = ?2",
            params![project_id, input.explanation_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "unread".to_string());
    tx.commit().map_err(database_error)?;

    Ok(ExplanationPayload {
        id: input.explanation_id,
        file_path: input.file_path,
        file_hash: Some(input.file_hash),
        target_type: input.target_type,
        target_name: input.target_name,
        start_line: Some(input.start_line),
        end_line: Some(input.end_line),
        symbol_id: input.symbol_id,
        code_hash: Some(input.code_hash),
        anchor_text: Some(input.anchor_text),
        code_meaning: input.code_level_meaning,
        local_meaning: Some(input.local_composition_meaning),
        global_meaning: Some(input.project_role_meaning),
        prior_knowledge: input.prior_knowledge,
        review_suggestion: input.review_suggestion,
        trust_label: Some(input.trust_label),
        trust_reason: Some(input.trust_reason),
        depends_on_lines: input.depends_on_lines,
        affects_lines: input.affects_lines,
        risk_notes: input.risk_notes,
        reader_notes: input.learning_note.into_iter().collect(),
        status: "valid".to_string(),
        reading_state,
        created_at,
        updated_at: now,
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
               e.prior_knowledge,
               e.risk_summary,
               e.learning_note,
               e.review_suggestion,
               e.trust_label,
               e.trust_reason,
               e.depends_on_lines,
               e.affects_lines,
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
            let risk_summary: Option<String> = row.get(14)?;
            let learning_note: Option<String> = row.get(15)?;
            let depends_on_lines: Option<String> = row.get(19)?;
            let affects_lines: Option<String> = row.get(20)?;
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
                prior_knowledge: row.get(13)?,
                review_suggestion: row.get(16)?,
                trust_label: row.get(17)?,
                trust_reason: row.get(18)?,
                depends_on_lines: parse_line_numbers(depends_on_lines),
                affects_lines: parse_line_numbers(affects_lines),
                risk_notes: super::split_notes(risk_summary),
                reader_notes: super::split_notes(learning_note),
                status: row.get(21)?,
                reading_state: row.get(22)?,
                created_at: row.get(23)?,
                updated_at: row.get(24)?,
            })
        })
        .map_err(database_error)?;

    let mut explanations = Vec::new();
    for row in rows {
        explanations.push(row.map_err(database_error)?);
    }
    Ok(explanations)
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
