#![cfg_attr(test, allow(dead_code))]

use crate::app_error::AppError;
use reqwest::{redirect::Policy, Url};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/lrk7353-arch/CodeReader/releases/latest";
const RELEASES_URL: &str =
    "https://api.github.com/repos/lrk7353-arch/CodeReader/releases?per_page=20";
const MAX_RELEASE_RESPONSE_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct UpdateCheckResult {
    current_version: String,
    latest_version: Option<String>,
    update_available: bool,
    release_url: Option<String>,
    release_name: Option<String>,
    published_at: Option<String>,
    channel: String,
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
    #[serde(default)]
    draft: bool,
}

#[tauri::command]
pub(crate) async fn check_for_updates() -> Result<UpdateCheckResult, AppError> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let current = Version::parse(&current_version)
        .map_err(|_| AppError::new("update.version", "当前版本号格式无效。"))?;
    let channel = if current.pre.is_empty() {
        "stable"
    } else {
        "prerelease"
    };
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .redirect(Policy::custom(|attempt| {
            let allowed = attempt.url().scheme() == "https"
                && attempt.url().host_str() == Some("api.github.com")
                && attempt.previous().len() < 3;
            if allowed {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| AppError::new("update.client", "无法初始化更新检查。"))?;
    let response = client
        .get(if channel == "stable" {
            LATEST_RELEASE_URL
        } else {
            RELEASES_URL
        })
        .header(reqwest::header::USER_AGENT, "CodeReader update checker")
        .send()
        .await
        .map_err(|_| AppError::new("update.network", "无法连接更新服务。").retryable(true))?;

    validate_api_response_url(response.url())?;

    let status = response.status();
    if !status.is_success() {
        return Err(AppError::new(
            "update.unavailable",
            format!("更新服务暂时不可用（HTTP {}）。", status.as_u16()),
        ));
    }

    if response.content_length().unwrap_or_default() > MAX_RELEASE_RESPONSE_BYTES as u64 {
        return Err(AppError::new(
            "update.response_too_large",
            "更新响应超过安全限制。",
        ));
    }

    let body = response
        .bytes()
        .await
        .map_err(|_| AppError::new("update.response", "无法读取更新响应。"))?;
    if body.len() > MAX_RELEASE_RESPONSE_BYTES {
        return Err(AppError::new(
            "update.response_too_large",
            "更新响应超过安全限制。",
        ));
    }
    let release = parse_github_release_for_channel(&body, channel)
        .map_err(|_| AppError::new("update.response", "更新响应格式无效。"))?;
    validate_release_url(&release.html_url)?;
    let latest = Version::parse(&release.version)
        .map_err(|_| AppError::new("update.version", "更新版本号格式无效。"))?;

    Ok(UpdateCheckResult {
        update_available: latest > current,
        current_version,
        latest_version: Some(release.version),
        release_url: Some(release.html_url),
        release_name: release.name,
        published_at: release.published_at,
        channel: channel.to_string(),
    })
}

fn parse_github_release(body: &[u8]) -> Result<ParsedRelease, String> {
    let response: GithubReleaseResponse =
        serde_json::from_slice(body).map_err(|error| error.to_string())?;
    release_to_parsed(response)
}

fn parse_github_release_for_channel(body: &[u8], channel: &str) -> Result<ParsedRelease, String> {
    if channel == "stable" {
        return parse_github_release(body);
    }
    let releases: Vec<GithubReleaseResponse> =
        serde_json::from_slice(body).map_err(|error| error.to_string())?;
    releases
        .into_iter()
        .filter(|release| !release.draft)
        .filter_map(|release| {
            let parsed = release_to_parsed(release).ok()?;
            let version = Version::parse(&parsed.version).ok()?;
            Some((version, parsed))
        })
        .max_by(|(left, _), (right, _)| left.cmp(right))
        .map(|(_, release)| release)
        .ok_or_else(|| "release response has no valid release".to_string())
}

fn release_to_parsed(response: GithubReleaseResponse) -> Result<ParsedRelease, String> {
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

fn validate_api_response_url(url: &Url) -> Result<(), AppError> {
    if url.scheme() == "https" && url.host_str() == Some("api.github.com") {
        Ok(())
    } else {
        Err(AppError::new(
            "update.redirect",
            "更新服务返回了不受信任的重定向。",
        ))
    }
}

fn validate_release_url(value: &str) -> Result<(), AppError> {
    let url =
        Url::parse(value).map_err(|_| AppError::new("update.release_url", "更新页面地址无效。"))?;
    let valid = url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.path().starts_with("/lrk7353-arch/CodeReader/releases/")
        && url.username().is_empty()
        && url.password().is_none();
    if valid {
        Ok(())
    } else {
        Err(AppError::new(
            "update.release_url",
            "更新页面来源不受信任。",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_stable_versions() {
        assert!(Version::parse("0.11.1").unwrap() > Version::parse("0.11.0").unwrap());
    }

    #[test]
    fn compares_beta_versions() {
        assert!(
            Version::parse("0.11.0-beta.5").unwrap() > Version::parse("0.11.0-beta.4").unwrap()
        );
        assert!(Version::parse("0.11.0").unwrap() > Version::parse("0.11.0-beta.4").unwrap());
    }

    #[test]
    fn parses_github_latest_release() {
        let json = r#"{
            "tag_name": "v0.11.0-beta.5",
            "name": "CodeReader 0.11.0 beta 5",
            "html_url": "https://github.com/lrk7353-arch/CodeReader/releases/tag/v0.11.0-beta.5",
            "published_at": "2026-07-07T12:00:00Z"
        }"#;

        let release = parse_github_release(json.as_bytes()).expect("release parses");

        assert_eq!(release.version, "0.11.0-beta.5");
        assert_eq!(
            release.html_url,
            "https://github.com/lrk7353-arch/CodeReader/releases/tag/v0.11.0-beta.5"
        );
    }

    #[test]
    fn rejects_untrusted_release_urls() {
        assert!(validate_release_url(
            "https://github.com/lrk7353-arch/CodeReader/releases/tag/v1.0.0"
        )
        .is_ok());
        assert!(validate_release_url("https://evil.example/releases/tag/v1.0.0").is_err());
        assert!(validate_release_url("https://github.com/other/repo/releases/tag/v1.0.0").is_err());
    }

    #[test]
    fn prerelease_channel_selects_highest_semver_and_ignores_drafts() {
        let json = br#"[
          {"tag_name":"v1.0.0-rc.1","html_url":"https://github.com/lrk7353-arch/CodeReader/releases/tag/v1.0.0-rc.1"},
          {"tag_name":"v1.0.0-rc.3","html_url":"https://github.com/lrk7353-arch/CodeReader/releases/tag/v1.0.0-rc.3","draft":true},
          {"tag_name":"v1.0.0-rc.2","html_url":"https://github.com/lrk7353-arch/CodeReader/releases/tag/v1.0.0-rc.2"}
        ]"#;
        let release =
            parse_github_release_for_channel(json, "prerelease").expect("prerelease list parses");
        assert_eq!(release.version, "1.0.0-rc.2");
    }
}
