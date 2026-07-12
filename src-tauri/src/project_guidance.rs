#![cfg_attr(test, allow(dead_code))]

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path};
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(not(test))]
use tauri::AppHandle;

#[cfg(not(test))]
use crate::app_error::AppError;
use crate::persistence_service;
use crate::utils::sha256_hex;

const MAX_READING_PATH_STEPS: usize = 8;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGuideFileInput {
    id: String,
    relative_path: String,
    language: String,
    can_preview: bool,
    can_explain: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateProjectGuideRequest {
    root_path: String,
    files: Vec<ProjectGuideFileInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadProjectGuideRequest {
    project_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMapItemPayload {
    id: String,
    file_id: String,
    relative_path: String,
    role: String,
    reason: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPathStepPayload {
    id: String,
    position: usize,
    file_id: String,
    relative_path: String,
    role: String,
    reason: String,
    reading_state: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgressPayload {
    total: usize,
    unread: usize,
    read: usize,
    understood: usize,
    questioned: usize,
    suspicious: usize,
    needs_reexplain: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGuidePayload {
    project_id: String,
    root_path: String,
    generated_at: String,
    map_items: Vec<ProjectMapItemPayload>,
    reading_path: Vec<ReadingPathStepPayload>,
    progress: ReadingProgressPayload,
}

#[cfg_attr(not(test), tauri::command)]
#[cfg(not(test))]
pub fn generate_project_guide(
    app: AppHandle,
    request: GenerateProjectGuideRequest,
) -> Result<ProjectGuidePayload, AppError> {
    let database_path = persistence_service::database_path(&app).map_err(AppError::database)?;
    generate_project_guide_at_path(&database_path, request).map_err(AppError::database)
}

#[cfg_attr(not(test), tauri::command)]
#[cfg(not(test))]
pub fn load_project_guide(
    app: AppHandle,
    request: LoadProjectGuideRequest,
) -> Result<Option<ProjectGuidePayload>, AppError> {
    let database_path = persistence_service::database_path(&app).map_err(AppError::database)?;
    let conn = persistence_service::open_database(&database_path).map_err(AppError::database)?;
    load_project_guide_from_connection(&conn, &request.project_id).map_err(AppError::database)
}

fn generate_project_guide_at_path(
    database_path: &Path,
    request: GenerateProjectGuideRequest,
) -> Result<ProjectGuidePayload, String> {
    let root_path = request.root_path.trim();
    if root_path.is_empty() {
        return Err("Project guide requires a project root.".to_string());
    }

    let mut files = validate_and_sort_files(request.files)?;
    if files.is_empty() {
        return Err("Project guide requires at least one scanned file.".to_string());
    }

    let project_id = stable_project_id(root_path);
    let source_fingerprint = source_fingerprint(&files);
    let mut conn = persistence_service::open_database(database_path)?;
    let existing_fingerprint = conn
        .query_row(
            "SELECT source_fingerprint FROM project_guides WHERE project_id = ?1",
            params![project_id],
            |row| row.get::<_, String>(0),
        )
        .ok();

    if existing_fingerprint.as_deref() == Some(source_fingerprint.as_str()) {
        if let Some(guide) = load_project_guide_from_connection(&conn, &project_id)? {
            return Ok(guide);
        }
    }

    let map_items = build_project_map(&mut files);
    let reading_path = build_reading_path(&map_items, &files);
    let generated_at = now_timestamp();
    let tx = conn.transaction().map_err(database_error)?;
    tx.execute(
        "INSERT INTO projects (id, root_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(id) DO UPDATE SET root_path = excluded.root_path, updated_at = excluded.updated_at",
        params![project_id, root_path, generated_at],
    )
    .map_err(database_error)?;
    tx.execute(
        "INSERT INTO project_guides
         (project_id, root_path, source_fingerprint, generated_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(project_id) DO UPDATE SET
           root_path = excluded.root_path,
           source_fingerprint = excluded.source_fingerprint,
           generated_at = excluded.generated_at,
           updated_at = excluded.updated_at",
        params![project_id, root_path, source_fingerprint, generated_at],
    )
    .map_err(database_error)?;
    tx.execute(
        "DELETE FROM project_map_items WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(database_error)?;
    tx.execute(
        "DELETE FROM reading_paths WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(database_error)?;

    for (sort_order, item) in map_items.iter().enumerate() {
        tx.execute(
            "INSERT INTO project_map_items
             (id, project_id, file_id, relative_path, role, reason, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                item.id,
                project_id,
                item.file_id,
                item.relative_path,
                item.role,
                item.reason,
                sort_order as i64
            ],
        )
        .map_err(database_error)?;
    }
    for step in &reading_path {
        tx.execute(
            "INSERT INTO reading_paths
             (id, project_id, position, file_id, relative_path, role, reason)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                step.id,
                project_id,
                step.position as i64,
                step.file_id,
                step.relative_path,
                step.role,
                step.reason
            ],
        )
        .map_err(database_error)?;
    }
    tx.commit().map_err(database_error)?;

    load_project_guide_from_connection(&conn, &project_id)?
        .ok_or_else(|| "Project guide was saved but could not be reloaded.".to_string())
}

fn validate_and_sort_files(
    files: Vec<ProjectGuideFileInput>,
) -> Result<Vec<ProjectGuideFileInput>, String> {
    let mut deduplicated = HashMap::new();
    for mut file in files {
        file.id = file.id.trim().to_string();
        file.relative_path = file.relative_path.trim().replace('\\', "/");
        file.language = file.language.trim().to_ascii_lowercase();
        if file.id.is_empty() || file.relative_path.is_empty() {
            return Err("Project guide received a file without a stable id or path.".to_string());
        }
        let path = Path::new(&file.relative_path);
        if path.is_absolute()
            || path.components().any(|component| {
                matches!(
                    component,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(format!(
                "Project guide rejected an unsafe relative path: {}",
                file.relative_path
            ));
        }
        deduplicated.insert(file.id.clone(), file);
    }
    let mut files: Vec<_> = deduplicated.into_values().collect();
    files.sort_by(|left, right| {
        left.relative_path
            .to_ascii_lowercase()
            .cmp(&right.relative_path.to_ascii_lowercase())
            .then(left.id.cmp(&right.id))
    });
    Ok(files)
}

fn build_project_map(files: &mut [ProjectGuideFileInput]) -> Vec<ProjectMapItemPayload> {
    let mut items: Vec<_> = files
        .iter()
        .map(|file| {
            let role = classify_role(file);
            ProjectMapItemPayload {
                id: stable_item_id("map", &file.id),
                file_id: file.id.clone(),
                relative_path: file.relative_path.clone(),
                reason: map_reason(role, file),
                role: role.to_string(),
            }
        })
        .collect();
    items.sort_by(|left, right| {
        role_rank(&left.role)
            .cmp(&role_rank(&right.role))
            .then(path_rank(&left.relative_path).cmp(&path_rank(&right.relative_path)))
            .then(
                left.relative_path
                    .to_ascii_lowercase()
                    .cmp(&right.relative_path.to_ascii_lowercase()),
            )
    });
    items
}

fn build_reading_path(
    map_items: &[ProjectMapItemPayload],
    files: &[ProjectGuideFileInput],
) -> Vec<ReadingPathStepPayload> {
    let previewable: HashSet<_> = files
        .iter()
        .filter(|file| file.can_preview)
        .map(|file| file.id.as_str())
        .collect();
    let mut selected = Vec::new();
    let mut selected_file_ids = HashSet::new();
    for (role, limit) in [
        ("documentation", 1usize),
        ("entry", 2),
        ("config", 1),
        ("business", 3),
        ("data", 2),
        ("test", 1),
        ("style", 1),
    ] {
        for item in map_items
            .iter()
            .filter(|item| item.role == role && previewable.contains(item.file_id.as_str()))
            .take(limit)
        {
            if selected_file_ids.insert(item.file_id.clone()) {
                selected.push(item);
            }
            if selected.len() == MAX_READING_PATH_STEPS {
                break;
            }
        }
        if selected.len() == MAX_READING_PATH_STEPS {
            break;
        }
    }
    if selected.is_empty() {
        if let Some(item) = map_items
            .iter()
            .find(|item| previewable.contains(item.file_id.as_str()))
        {
            selected.push(item);
        }
    }

    selected
        .into_iter()
        .enumerate()
        .map(|(index, item)| ReadingPathStepPayload {
            id: stable_item_id("path", &item.file_id),
            position: index + 1,
            file_id: item.file_id.clone(),
            relative_path: item.relative_path.clone(),
            role: item.role.clone(),
            reason: reading_reason(&item.role),
            reading_state: "unread".to_string(),
        })
        .collect()
}

fn load_project_guide_from_connection(
    conn: &Connection,
    project_id: &str,
) -> Result<Option<ProjectGuidePayload>, String> {
    let metadata = conn.query_row(
        "SELECT root_path, generated_at FROM project_guides WHERE project_id = ?1",
        params![project_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );
    let (root_path, generated_at) = match metadata {
        Ok(value) => value,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(error) => return Err(database_error(error)),
    };

    let mut map_statement = conn
        .prepare(
            "SELECT id, file_id, relative_path, role, reason
             FROM project_map_items
             WHERE project_id = ?1
             ORDER BY sort_order ASC, relative_path ASC",
        )
        .map_err(database_error)?;
    let map_items = map_statement
        .query_map(params![project_id], |row| {
            Ok(ProjectMapItemPayload {
                id: row.get(0)?,
                file_id: row.get(1)?,
                relative_path: row.get(2)?,
                role: row.get(3)?,
                reason: row.get(4)?,
            })
        })
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;

    let mut path_statement = conn
        .prepare(
            "SELECT id, position, file_id, relative_path, role, reason
             FROM reading_paths
             WHERE project_id = ?1
             ORDER BY position ASC",
        )
        .map_err(database_error)?;
    let mut reading_path = path_statement
        .query_map(params![project_id], |row| {
            Ok(ReadingPathStepPayload {
                id: row.get(0)?,
                position: i64_to_usize(row.get(1)?),
                file_id: row.get(2)?,
                relative_path: row.get(3)?,
                role: row.get(4)?,
                reason: row.get(5)?,
                reading_state: "unread".to_string(),
            })
        })
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;

    let mut progress = ReadingProgressPayload {
        total: reading_path.len(),
        ..ReadingProgressPayload::default()
    };
    for step in &mut reading_path {
        step.reading_state = aggregate_file_reading_state(conn, project_id, &step.file_id)?;
        match step.reading_state.as_str() {
            "read" => progress.read += 1,
            "understood" => progress.understood += 1,
            "questioned" => progress.questioned += 1,
            "suspicious" => progress.suspicious += 1,
            "needs_reexplain" => progress.needs_reexplain += 1,
            _ => progress.unread += 1,
        }
    }

    Ok(Some(ProjectGuidePayload {
        project_id: project_id.to_string(),
        root_path,
        generated_at,
        map_items,
        reading_path,
        progress,
    }))
}

fn aggregate_file_reading_state(
    conn: &Connection,
    project_id: &str,
    file_id: &str,
) -> Result<String, String> {
    let mut statement = conn
        .prepare(
            "SELECT s.state
             FROM user_reading_states s
             INNER JOIN explanation_nodes e
               ON e.id = s.explanation_id AND e.project_id = s.project_id
             WHERE s.project_id = ?1 AND e.file_id = ?2 AND e.status != 'deleted'",
        )
        .map_err(database_error)?;
    let states = statement
        .query_map(params![project_id, file_id], |row| row.get::<_, String>(0))
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;
    Ok(aggregate_states(&states).to_string())
}

fn aggregate_states(states: &[String]) -> &'static str {
    if states.iter().any(|state| state == "suspicious") {
        return "suspicious";
    }
    if states.iter().any(|state| state == "questioned") {
        return "questioned";
    }
    if states.iter().any(|state| state == "needs_reexplain") {
        return "needs_reexplain";
    }
    let meaningful: Vec<_> = states
        .iter()
        .filter(|state| state.as_str() != "unread")
        .collect();
    if meaningful.is_empty() {
        return "unread";
    }
    if meaningful.len() == states.len()
        && meaningful
            .iter()
            .all(|state| state.as_str() == "understood")
    {
        return "understood";
    }
    "read"
}

fn classify_role(file: &ProjectGuideFileInput) -> &'static str {
    let path = file.relative_path.to_ascii_lowercase();
    let name = path.rsplit('/').next().unwrap_or(path.as_str());
    let stem = name.split('.').next().unwrap_or(name);
    let segments: Vec<_> = path.split('/').collect();

    if is_documentation(name, &segments) {
        return "documentation";
    }
    if is_configuration(name) {
        return "config";
    }
    if is_test_file(name, &segments) {
        return "test";
    }
    if is_style_file(name, &file.language, &segments) {
        return "style";
    }
    if is_data_file(name, &file.language, &segments) {
        return "data";
    }
    if is_entry_file(stem, name, &segments, file.can_explain) {
        return "entry";
    }
    if file.can_explain {
        return "business";
    }
    "other"
}

fn is_documentation(name: &str, segments: &[&str]) -> bool {
    name.starts_with("readme")
        || name.starts_with("changelog")
        || name.starts_with("license")
        || matches!(
            name.rsplit('.').next().unwrap_or(""),
            "md" | "markdown" | "mdx"
        )
        || segments
            .iter()
            .any(|segment| *segment == "docs" || *segment == "documentation")
}

fn is_configuration(name: &str) -> bool {
    name.starts_with(".env")
        || name.starts_with("tsconfig")
        || name.starts_with("jsconfig")
        || name.starts_with("vite.config")
        || name.starts_with("webpack.config")
        || name.starts_with("eslint.config")
        || name.starts_with("prettier.config")
        || matches!(
            name,
            "package.json"
                | "pyproject.toml"
                | "cargo.toml"
                | "go.mod"
                | "dockerfile"
                | "docker-compose.yml"
                | "docker-compose.yaml"
                | "requirements.txt"
                | "makefile"
        )
        || name.ends_with(".config.js")
        || name.ends_with(".config.ts")
        || name.ends_with(".config.json")
}

fn is_test_file(name: &str, segments: &[&str]) -> bool {
    name.contains(".test.")
        || name.contains(".spec.")
        || name.starts_with("test_")
        || name.ends_with("_test.py")
        || segments
            .iter()
            .any(|segment| matches!(*segment, "test" | "tests" | "__tests__"))
}

fn is_style_file(name: &str, language: &str, segments: &[&str]) -> bool {
    language == "css"
        || matches!(
            name.rsplit('.').next().unwrap_or(""),
            "css" | "scss" | "sass" | "less"
        )
        || segments
            .iter()
            .any(|segment| matches!(*segment, "style" | "styles" | "theme" | "themes"))
}

fn is_data_file(name: &str, language: &str, segments: &[&str]) -> bool {
    language == "sql"
        || [
            "database",
            "db",
            "model",
            "models",
            "repository",
            "repositories",
            "schema",
            "schemas",
            "store",
            "stores",
            "migration",
            "migrations",
            "data",
        ]
        .iter()
        .any(|signal| {
            segments.iter().any(|segment| segment == signal)
                || name.contains(&format!("-{signal}."))
                || name.contains(&format!("_{signal}."))
                || name.starts_with(&format!("{signal}."))
        })
}

fn is_entry_file(stem: &str, name: &str, segments: &[&str], can_explain: bool) -> bool {
    can_explain
        && (matches!(
            stem,
            "app" | "main" | "index" | "server" | "cli" | "manage" | "__main__"
        ) || name.starts_with("main.")
            || name.starts_with("index.")
            || segments
                .iter()
                .any(|segment| matches!(*segment, "bin" | "entrypoints")))
}

fn map_reason(role: &str, file: &ProjectGuideFileInput) -> String {
    let capability = if file.can_explain {
        "可进行结构化解释"
    } else if file.can_preview {
        "可只读预览"
    } else {
        "仅展示项目位置"
    };
    format!("{}；{capability}。", role_summary(role))
}

fn reading_reason(role: &str) -> String {
    match role {
        "documentation" => "先了解项目目标、运行方式和目录约定。".to_string(),
        "entry" => "从启动入口建立主流程，再沿调用方向继续阅读。".to_string(),
        "config" => "确认依赖、脚本和运行边界，避免误解项目环境。".to_string(),
        "business" => "阅读核心业务流程，理解输入、分支和输出。".to_string(),
        "data" => "补全数据来源、存储结构和持久化边界。".to_string(),
        "test" => "通过测试用例确认关键行为、输入边界和预期结果。".to_string(),
        "style" => "最后查看界面样式如何承接功能结构。".to_string(),
        _ => "这是当前项目中较适合作为起点的可预览文件。".to_string(),
    }
}

fn role_summary(role: &str) -> &'static str {
    match role {
        "documentation" => "项目说明文件",
        "entry" => "应用或模块入口",
        "config" => "运行与工具配置",
        "business" => "核心业务代码",
        "data" => "数据与持久化层",
        "style" => "界面样式资源",
        "test" => "测试与验收代码",
        _ => "其他项目文件",
    }
}

fn role_rank(role: &str) -> usize {
    match role {
        "documentation" => 0,
        "entry" => 1,
        "config" => 2,
        "business" => 3,
        "data" => 4,
        "style" => 5,
        "test" => 6,
        _ => 7,
    }
}

fn path_rank(path: &str) -> (usize, usize) {
    (path.matches('/').count(), path.len())
}

fn source_fingerprint(files: &[ProjectGuideFileInput]) -> String {
    let source = files
        .iter()
        .map(|file| {
            format!(
                "{}|{}|{}|{}|{}",
                file.id, file.relative_path, file.language, file.can_preview, file.can_explain
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    sha256_hex(&source)
}

fn stable_project_id(root_path: &str) -> String {
    format!("project:{}", &sha256_hex(root_path)[..20])
}

fn stable_item_id(prefix: &str, file_id: &str) -> String {
    format!("{prefix}:{}", &sha256_hex(file_id)[..20])
}

fn now_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{millis}")
}

fn i64_to_usize(value: i64) -> usize {
    usize::try_from(value.max(0)).unwrap_or_default()
}

fn database_error(error: rusqlite::Error) -> String {
    format!("CodeReader database error: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn classifies_files_and_builds_a_stable_first_mile_path() {
        let mut files = vec![
            file("config", "package.json", "json", true, false),
            file("entry", "src/app.ts", "typescript", true, true),
            file(
                "business",
                "src/auth/login-controller.ts",
                "typescript",
                true,
                true,
            ),
            file("data", "src/auth/user-store.ts", "typescript", true, true),
            file("style", "src/styles/app.css", "css", true, false),
            file("test", "src/auth/login.test.ts", "typescript", true, true),
        ];

        let map = build_project_map(&mut files);
        let roles: HashMap<_, _> = map
            .iter()
            .map(|item| (item.file_id.as_str(), item.role.as_str()))
            .collect();
        assert_eq!(roles["entry"], "entry");
        assert_eq!(roles["config"], "config");
        assert_eq!(roles["business"], "business");
        assert_eq!(roles["data"], "data");
        assert_eq!(roles["style"], "style");
        assert_eq!(roles["test"], "test");

        let path = build_reading_path(&map, &files);
        assert_eq!(
            path.iter()
                .map(|step| step.file_id.as_str())
                .collect::<Vec<_>>(),
            vec!["entry", "config", "business", "data", "test", "style"]
        );
    }

    #[test]
    fn uses_tests_as_a_real_reading_step_when_project_has_only_tests() {
        let mut files = vec![
            file("unit", "tests/login.test.ts", "typescript", true, true),
            file(
                "integration",
                "tests/login.integration.test.ts",
                "typescript",
                true,
                true,
            ),
        ];

        let map = build_project_map(&mut files);
        let path = build_reading_path(&map, &files);

        assert_eq!(path.len(), 1);
        assert_eq!(path[0].file_id, "unit");
        assert_eq!(path[0].role, "test");
        assert!(path[0].reason.contains("测试用例"));
    }

    #[test]
    fn persists_and_restores_guidance_with_file_progress() {
        let database_path = temp_database_path("guide");
        let request = GenerateProjectGuideRequest {
            root_path: "/project/demo".to_string(),
            files: vec![
                file("entry", "src/app.ts", "typescript", true, true),
                file(
                    "business",
                    "src/login-controller.ts",
                    "typescript",
                    true,
                    true,
                ),
            ],
        };
        let first = generate_project_guide_at_path(&database_path, request)
            .expect("project guide should generate");
        assert_eq!(first.reading_path.len(), 2);
        assert_eq!(first.progress.unread, 2);

        let conn = persistence_service::open_database(&database_path).expect("database opens");
        conn.execute(
            "INSERT INTO explanation_nodes
             (id, project_id, file_id, snapshot_id, explanation_type, status,
              schema_version, prompt_version, created_at, updated_at)
             VALUES ('exp-entry', ?1, 'entry', 'snapshot-entry', 'file', 'valid',
                     'test', 'test', '1', '1')",
            params![first.project_id],
        )
        .expect("explanation inserts");
        conn.execute(
            "INSERT INTO user_reading_states
             (id, project_id, explanation_id, state, note, updated_at)
             VALUES ('reading-entry', ?1, 'exp-entry', 'understood', NULL, '2')",
            params![first.project_id],
        )
        .expect("reading state inserts");

        let restored = load_project_guide_from_connection(&conn, &first.project_id)
            .expect("guide loads")
            .expect("guide exists");
        assert_eq!(restored.generated_at, first.generated_at);
        assert_eq!(restored.progress.understood, 1);
        assert_eq!(restored.progress.unread, 1);
        assert_eq!(restored.reading_path[0].reading_state, "understood");

        drop(conn);
        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn rejects_parent_directory_paths() {
        let error = validate_and_sort_files(vec![file(
            "unsafe",
            "../secret.ts",
            "typescript",
            true,
            true,
        )])
        .expect_err("unsafe path should fail");
        assert!(error.contains("unsafe relative path"));
    }

    fn file(
        id: &str,
        relative_path: &str,
        language: &str,
        can_preview: bool,
        can_explain: bool,
    ) -> ProjectGuideFileInput {
        ProjectGuideFileInput {
            id: id.to_string(),
            relative_path: relative_path.to_string(),
            language: language.to_string(),
            can_preview,
            can_explain,
        }
    }

    fn temp_database_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "codereader-project-guide-{name}-{}.sqlite",
            now_timestamp()
        ))
    }
}
