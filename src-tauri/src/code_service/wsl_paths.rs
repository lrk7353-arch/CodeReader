use std::path::PathBuf;

pub(super) fn mapped_wsl_workspace_path(input: &str) -> Option<PathBuf> {
    let wsl_root = normalize_wsl_absolute_path(&std::env::var("CODEREADER_WSL_ROOT").ok()?)?;
    let input_wsl_path = input_to_wsl_path(input)?;
    let relative_path = wsl_workspace_relative_path(&input_wsl_path, &wsl_root)?;
    let windows_root = PathBuf::from(std::env::var_os("CODEREADER_WINDOWS_ROOT")?);

    Some(windows_root.join(relative_path))
}

fn input_to_wsl_path(input: &str) -> Option<String> {
    let normalized = input.replace('\\', "/");
    let lower = normalized.to_ascii_lowercase();
    for prefix in ["//wsl.localhost/", "//wsl$/"] {
        if !lower.starts_with(prefix) {
            continue;
        }

        let without_prefix = &normalized[prefix.len()..];
        let (_distro, distro_path) = without_prefix.split_once('/')?;
        return normalize_wsl_absolute_path(&format!("/{distro_path}"));
    }

    if normalized.starts_with('/') {
        return normalize_wsl_absolute_path(&normalized);
    }

    None
}

fn normalize_wsl_absolute_path(input: &str) -> Option<String> {
    let normalized = input.replace('\\', "/");
    let trimmed = normalized.trim();
    if !trimmed.starts_with('/') || trimmed.starts_with("//") {
        return None;
    }

    let path = trimmed.trim_end_matches('/');
    Some(if path.is_empty() {
        "/".to_string()
    } else {
        path.to_string()
    })
}

fn wsl_workspace_relative_path(input_wsl_path: &str, wsl_root: &str) -> Option<PathBuf> {
    let input_wsl_path = normalize_wsl_absolute_path(input_wsl_path)?;
    let wsl_root = normalize_wsl_absolute_path(wsl_root)?;

    if input_wsl_path == wsl_root {
        return Some(PathBuf::new());
    }

    let root_prefix = format!("{wsl_root}/");
    if !input_wsl_path.starts_with(&root_prefix) {
        return None;
    }

    Some(slash_path_to_path_buf(&input_wsl_path[root_prefix.len()..]))
}

fn slash_path_to_path_buf(path: &str) -> PathBuf {
    path.split('/')
        .filter(|part| !part.is_empty())
        .fold(PathBuf::new(), |mut buffer, part| {
            buffer.push(part);
            buffer
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_wsl_unc_paths_to_wsl_absolute_paths() {
        assert_eq!(
            input_to_wsl_path(r"\\wsl.localhost\Ubuntu\home\konglingrui\CodeReader\src\app.tsx")
                .as_deref(),
            Some("/home/konglingrui/CodeReader/src/app.tsx")
        );
        assert_eq!(
            input_to_wsl_path("//wsl$/Ubuntu/home/konglingrui/CodeReader").as_deref(),
            Some("/home/konglingrui/CodeReader")
        );
    }

    #[test]
    fn derives_relative_paths_inside_wsl_workspace_root() {
        let relative = wsl_workspace_relative_path(
            "/home/konglingrui/CodeReader/src/app.tsx",
            "/home/konglingrui/CodeReader",
        )
        .expect("path should be inside workspace root");

        assert_eq!(relative, PathBuf::from("src").join("app.tsx"));
        assert!(wsl_workspace_relative_path(
            "/home/konglingrui/OtherProject/src/app.tsx",
            "/home/konglingrui/CodeReader"
        )
        .is_none());
    }
}
