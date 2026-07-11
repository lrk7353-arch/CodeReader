use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use crate::app_error::AppError;
use crate::utils::sha256_hex;

#[derive(Clone)]
struct Grant {
    root: PathBuf,
    exact_file: bool,
    files: HashMap<String, PathBuf>,
}

#[derive(Clone)]
#[cfg_attr(test, allow(dead_code))]
pub(crate) struct SnapshotNode {
    pub(crate) id: String,
    pub(crate) node_type: String,
    pub(crate) name: String,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
    pub(crate) symbol_id: Option<String>,
    pub(crate) anchor_text: String,
    pub(crate) code_hash: String,
}

#[derive(Clone)]
#[cfg_attr(test, allow(dead_code))]
pub(crate) struct FileSnapshot {
    pub(crate) grant_id: String,
    pub(crate) file_id: String,
    pub(crate) path: String,
    pub(crate) project_root: Option<String>,
    pub(crate) language: String,
    pub(crate) code: String,
    pub(crate) nodes: Vec<SnapshotNode>,
}

const MAX_GRANTS: usize = 64;
const MAX_SNAPSHOTS: usize = 32;

struct BoundedRegistry<T> {
    entries: HashMap<String, T>,
    order: VecDeque<String>,
    limit: usize,
}

impl<T> BoundedRegistry<T> {
    fn new(limit: usize) -> Self {
        Self {
            entries: HashMap::new(),
            order: VecDeque::new(),
            limit,
        }
    }

    fn insert(&mut self, key: String, value: T) {
        if self.entries.contains_key(&key) {
            self.order.retain(|current| current != &key);
        }
        self.entries.insert(key.clone(), value);
        self.order.push_back(key);
        while self.entries.len() > self.limit {
            if let Some(expired) = self.order.pop_front() {
                self.entries.remove(&expired);
            }
        }
    }

    #[cfg(test)]
    fn clear(&mut self) {
        self.entries.clear();
        self.order.clear();
    }
}

static GRANTS: OnceLock<Mutex<BoundedRegistry<Grant>>> = OnceLock::new();
static SNAPSHOTS: OnceLock<Mutex<BoundedRegistry<FileSnapshot>>> = OnceLock::new();
static NEXT_GRANT: AtomicU64 = AtomicU64::new(1);

fn grants() -> &'static Mutex<BoundedRegistry<Grant>> {
    GRANTS.get_or_init(|| Mutex::new(BoundedRegistry::new(MAX_GRANTS)))
}

fn snapshots() -> &'static Mutex<BoundedRegistry<FileSnapshot>> {
    SNAPSHOTS.get_or_init(|| Mutex::new(BoundedRegistry::new(MAX_SNAPSHOTS)))
}

pub(crate) fn register_snapshot(
    snapshot_id: String,
    snapshot: FileSnapshot,
) -> Result<(), AppError> {
    let key = snapshot_key(&snapshot.grant_id, &snapshot.file_id, &snapshot_id);
    snapshots()
        .lock()
        .map_err(|_| AppError::fs_read_failed("File snapshot registry is unavailable."))?
        .insert(key, snapshot);
    Ok(())
}

pub(crate) fn resolve_snapshot(
    grant_id: &str,
    file_id: &str,
    snapshot_id: &str,
) -> Result<FileSnapshot, AppError> {
    // Revalidate the grant before releasing immutable content to a context build.
    resolve_file(grant_id, file_id)?;
    let snapshot = snapshots()
        .lock()
        .map_err(|_| AppError::fs_read_failed("File snapshot registry is unavailable."))?
        .entries
        .get(&snapshot_key(grant_id, file_id, snapshot_id))
        .cloned()
        .ok_or_else(|| invalid_grant("The file snapshot has expired."))?;
    if snapshot.grant_id != grant_id || snapshot.file_id != file_id {
        return Err(invalid_grant(
            "The snapshot is not bound to this file authorization.",
        ));
    }
    Ok(snapshot)
}

pub(crate) fn register_file(path: PathBuf, file_id: String) -> Result<String, AppError> {
    let grant_id = new_grant_id(&path);
    let mut files = HashMap::new();
    files.insert(file_id, path.clone());
    insert_grant(
        grant_id.clone(),
        Grant {
            root: path,
            exact_file: true,
            files,
        },
    )?;
    Ok(grant_id)
}

pub(crate) fn register_directory(root: PathBuf) -> Result<String, AppError> {
    let grant_id = new_grant_id(&root);
    insert_grant(
        grant_id.clone(),
        Grant {
            root,
            exact_file: false,
            files: HashMap::new(),
        },
    )?;
    Ok(grant_id)
}

pub(crate) fn register_project_file(
    grant_id: &str,
    file_id: String,
    path: PathBuf,
) -> Result<(), AppError> {
    let mut registry = grants()
        .lock()
        .map_err(|_| AppError::fs_read_failed("File authorization registry is unavailable."))?;
    let grant = registry
        .entries
        .get_mut(grant_id)
        .ok_or_else(|| invalid_grant("The folder authorization has expired."))?;
    if grant.exact_file || !path.starts_with(&grant.root) {
        return Err(invalid_grant("The file is outside the authorized folder."));
    }
    grant.files.insert(file_id, path);
    Ok(())
}

/// Resolve an opaque file id and re-check the filesystem at use time. This
/// deliberately canonicalizes again so a symlink swap cannot escape a grant.
pub(crate) fn resolve_file(
    grant_id: &str,
    file_id: &str,
) -> Result<(PathBuf, Option<PathBuf>), AppError> {
    let grant = {
        let registry = grants()
            .lock()
            .map_err(|_| AppError::fs_read_failed("File authorization registry is unavailable."))?;
        registry
            .entries
            .get(grant_id)
            .cloned()
            .ok_or_else(|| invalid_grant("The file authorization has expired."))?
    };
    let recorded = grant
        .files
        .get(file_id)
        .ok_or_else(|| invalid_grant("The file id is not part of this authorization."))?;
    let canonical = std::fs::canonicalize(recorded)
        .map_err(|_| AppError::fs_read_failed("The authorized file is no longer available."))?;
    let canonical_root = std::fs::canonicalize(&grant.root)
        .map_err(|_| AppError::fs_read_failed("The authorized location is no longer available."))?;
    if (grant.exact_file && canonical != canonical_root)
        || (!grant.exact_file && !canonical.starts_with(&canonical_root))
    {
        return Err(invalid_grant(
            "The file no longer belongs to the authorized location.",
        ));
    }
    if !canonical.is_file() {
        return Err(AppError::fs_not_a_file(
            "The authorized item is not a file.",
        ));
    }
    Ok((canonical, (!grant.exact_file).then_some(canonical_root)))
}

pub(crate) fn resolve_directory(
    grant_id: &str,
    directory_id: Option<&str>,
    id_for_path: impl Fn(&Path) -> String,
) -> Result<PathBuf, AppError> {
    let grant = {
        let registry = grants()
            .lock()
            .map_err(|_| AppError::fs_read_failed("File authorization registry is unavailable."))?;
        registry
            .entries
            .get(grant_id)
            .cloned()
            .ok_or_else(|| invalid_grant("The folder authorization has expired."))?
    };
    if grant.exact_file {
        return Err(invalid_grant("This authorization only covers one file."));
    }
    let root = std::fs::canonicalize(&grant.root)
        .map_err(|_| AppError::fs_read_failed("The authorized folder is no longer available."))?;
    if directory_id.is_none() {
        return Ok(root);
    }
    let wanted = directory_id.unwrap_or_default();
    for entry in walkdir::WalkDir::new(&root)
        .max_depth(8)
        .follow_links(false)
    {
        let Ok(entry) = entry else { continue };
        if entry.file_type().is_dir() && id_for_path(entry.path()) == wanted {
            let canonical = std::fs::canonicalize(entry.path())
                .map_err(|_| AppError::fs_read_failed("The folder is no longer available."))?;
            if canonical.starts_with(&root) {
                return Ok(canonical);
            }
        }
    }
    Err(invalid_grant(
        "The folder id is not part of this authorization.",
    ))
}

fn insert_grant(id: String, grant: Grant) -> Result<(), AppError> {
    grants()
        .lock()
        .map_err(|_| AppError::fs_read_failed("File authorization registry is unavailable."))?
        .insert(id, grant);
    Ok(())
}

fn new_grant_id(path: &Path) -> String {
    let nonce = NEXT_GRANT.fetch_add(1, Ordering::Relaxed);
    let material = format!("{}:{nonce}", path.to_string_lossy());
    format!("grant:{}", &sha256_hex(&material)[..24])
}

fn snapshot_key(grant_id: &str, file_id: &str, snapshot_id: &str) -> String {
    format!("{grant_id}:{file_id}:{snapshot_id}")
}

fn invalid_grant(message: impl Into<String>) -> AppError {
    AppError::new("fs.authorization_invalid", message)
}

#[cfg(test)]
pub(crate) fn clear_for_test() {
    if let Some(registry) = GRANTS.get() {
        registry.lock().expect("registry lock").clear();
    }
    if let Some(registry) = SNAPSHOTS.get() {
        registry.lock().expect("snapshot lock").clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("codereader-authority-{label}-{nonce}"))
    }

    #[test]
    fn opaque_file_grant_resolves_only_registered_file() {
        clear_for_test();
        let root = test_root("file");
        std::fs::create_dir_all(&root).expect("create root");
        let file = root.join("notes.md");
        std::fs::write(&file, "# Notes").expect("write file");
        let canonical = std::fs::canonicalize(&file).expect("canonical file");
        let grant = register_file(canonical.clone(), "file:notes".into()).expect("register");

        let (resolved, project_root) = resolve_file(&grant, "file:notes").expect("resolve");
        assert_eq!(resolved, canonical);
        assert!(project_root.is_none());
        assert_eq!(
            resolve_file(&grant, "file:other")
                .expect_err("unknown id")
                .code(),
            "fs.authorization_invalid"
        );
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn directory_grant_rechecks_containment() {
        clear_for_test();
        let root = test_root("directory");
        std::fs::create_dir_all(root.join("docs")).expect("create dirs");
        let file = root.join("docs/readme.md");
        std::fs::write(&file, "safe").expect("write file");
        let canonical_root = std::fs::canonicalize(&root).expect("canonical root");
        let canonical_file = std::fs::canonicalize(&file).expect("canonical file");
        let grant = register_directory(canonical_root.clone()).expect("register");
        register_project_file(&grant, "file:readme".into(), canonical_file.clone())
            .expect("register child");

        let (resolved, project_root) = resolve_file(&grant, "file:readme").expect("resolve");
        assert_eq!(resolved, canonical_file);
        assert_eq!(project_root, Some(canonical_root));
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
