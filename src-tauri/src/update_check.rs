#![cfg_attr(test, allow(dead_code))]

use crate::app_error::AppError;
use serde::{Deserialize, Serialize};

const LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/lrk7353-arch/CodeReader/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct UpdateCheckResult {
    current_version: String,
    latest_version: Option<String>,
    update_available: bool,
    release_url: Option<String>,
    release_name: Option<String>,
    published_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedRelease {
    version: String,
    name: Option<String>,
    html_url: String,
    published_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubReleaseResponse {
    tag_name: String,
    name: Option<String>,
    html_url: String,
    published_at: Option<String>,
}

#[tauri::command]
pub(crate) async fn check_for_updates() -> Result<UpdateCheckResult, AppError> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::new();
    let response = client
        .get(LATEST_RELEASE_URL)
        .header(reqwest::header::USER_AGENT, "CodeReader update checker")
        .send()
        .await
        .map_err(|error| AppError::new("update.network", error.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        return Err(AppError::new(
            "update.unavailable",
            format!("GitHub release request failed with status {status}"),
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|error| AppError::new("update.response", error.to_string()))?;
    let release =
        parse_github_release(&body).map_err(|error| AppError::new("update.response", error))?;

    Ok(UpdateCheckResult {
        update_available: is_newer_version(&release.version, &current_version),
        current_version,
        latest_version: Some(release.version),
        release_url: Some(release.html_url),
        release_name: release.name,
        published_at: release.published_at,
    })
}

fn parse_github_release(body: &str) -> Result<ParsedRelease, String> {
    let response: GithubReleaseResponse =
        serde_json::from_str(body).map_err(|error| error.to_string())?;
    let version = response
        .tag_name
        .strip_prefix('v')
        .unwrap_or(response.tag_name.as_str())
        .to_string();
    if version.is_empty() || response.html_url.is_empty() {
        return Err("release response is missing required fields".to_string());
    }

    Ok(ParsedRelease {
        version,
        name: response.name,
        html_url: response.html_url,
        published_at: response.published_at,
    })
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    parse_version(latest) > parse_version(current)
}

fn parse_version(value: &str) -> (u64, u64, u64, u8, u64) {
    let clean = value.strip_prefix('v').unwrap_or(value);
    let mut split = clean.splitn(2, '-');
    let core = split.next().unwrap_or_default();
    let prerelease = split.next();
    let mut parts = core.split('.');
    let major = parts
        .next()
        .and_then(|part| part.parse().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|part| part.parse().ok())
        .unwrap_or(0);
    let patch = parts
        .next()
        .and_then(|part| part.parse().ok())
        .unwrap_or(0);
    let prerelease_rank = if prerelease.is_some() { 0 } else { 1 };
    let beta_number = prerelease
        .and_then(|part| part.strip_prefix("beta."))
        .and_then(|part| part.parse().ok())
        .unwrap_or(0);

    (major, minor, patch, prerelease_rank, beta_number)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_stable_versions() {
        assert!(is_newer_version("0.11.1", "0.11.0"));
        assert!(!is_newer_version("0.11.0", "0.11.0"));
        assert!(!is_newer_version("0.10.9", "0.11.0"));
    }

    #[test]
    fn compares_beta_versions() {
        assert!(is_newer_version("0.11.0-beta.5", "0.11.0-beta.4"));
        assert!(is_newer_version("0.11.0", "0.11.0-beta.4"));
        assert!(!is_newer_version("0.11.0-beta.3", "0.11.0-beta.4"));
    }

    #[test]
    fn parses_github_latest_release() {
        let json = r#"{
            "tag_name": "v0.11.0-beta.5",
            "name": "CodeReader 0.11.0 beta 5",
            "html_url": "https://github.com/lrk7353-arch/CodeReader/releases/tag/v0.11.0-beta.5",
            "published_at": "2026-07-07T12:00:00Z"
        }"#;

        let release = parse_github_release(json).expect("release parses");

        assert_eq!(release.version, "0.11.0-beta.5");
        assert_eq!(
            release.html_url,
            "https://github.com/lrk7353-arch/CodeReader/releases/tag/v0.11.0-beta.5"
        );
    }
}
