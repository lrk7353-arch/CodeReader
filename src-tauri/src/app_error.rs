use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::llm_provider::ProviderError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppError {
    code: String,
    message: String,
    retryable: bool,
    action: Option<String>,
    correlation_id: String,
}

impl AppError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            retryable: false,
            action: None,
            correlation_id: next_correlation_id(),
        }
    }

    pub(crate) fn retryable(mut self, retryable: bool) -> Self {
        self.retryable = retryable;
        self
    }

    pub(crate) fn with_action(mut self, action: impl Into<String>) -> Self {
        self.action = Some(action.into());
        self
    }

    #[allow(dead_code)]
    pub(crate) fn code(&self) -> &str {
        &self.code
    }

    #[allow(dead_code)]
    pub(crate) fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn database(_internal_message: impl Into<String>) -> Self {
        Self::new("db.error", "无法访问本地数据。")
            .retryable(true)
            .with_action("retry_or_open_recovery")
    }

    pub(crate) fn credential_unavailable(_internal_message: impl Into<String>) -> Self {
        Self::new("credential.unavailable", "无法访问系统凭据存储。")
            .retryable(true)
            .with_action("retry_credentials")
    }

    pub(crate) fn credential_not_set(message: impl Into<String>) -> Self {
        Self::new("credential.not_set", message)
    }

    pub(crate) fn configuration(message: impl Into<String>) -> Self {
        Self::new("config.invalid", message)
    }

    pub(crate) fn llm_invalid_response(message: impl Into<String>) -> Self {
        Self::new("llm.invalid_response", message)
    }

    pub(crate) fn fs_not_a_file(message: impl Into<String>) -> Self {
        Self::new("fs.not_a_file", message)
    }

    pub(crate) fn fs_not_a_dir(message: impl Into<String>) -> Self {
        Self::new("fs.not_a_dir", message)
    }

    pub(crate) fn fs_path_resolve_failed(message: impl Into<String>) -> Self {
        Self::new("fs.path_resolve_failed", message)
    }

    pub(crate) fn fs_read_failed(message: impl Into<String>) -> Self {
        Self::new("fs.read_failed", message)
    }

    pub(crate) fn fs_too_large(message: impl Into<String>) -> Self {
        Self::new("fs.too_large", message)
    }

    pub(crate) fn fs_invalid_utf8(message: impl Into<String>) -> Self {
        Self::new("fs.invalid_utf8", message)
    }

    pub(crate) fn fs_unsupported(message: impl Into<String>) -> Self {
        Self::new("fs.unsupported", message)
    }
}

static CORRELATION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

fn next_correlation_id() -> String {
    let sequence = CORRELATION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("err-{millis:x}-{sequence:x}")
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<ProviderError> for AppError {
    fn from(error: ProviderError) -> Self {
        let retryable = matches!(
            error.code,
            crate::llm_provider::ProviderErrorCode::Timeout
                | crate::llm_provider::ProviderErrorCode::Connection
                | crate::llm_provider::ProviderErrorCode::Http
        );
        Self::new(error.code.as_str(), safe_provider_message(&error.code)).retryable(retryable)
    }
}

fn safe_provider_message(code: &crate::llm_provider::ProviderErrorCode) -> &'static str {
    use crate::llm_provider::ProviderErrorCode;
    match code {
        ProviderErrorCode::Timeout => "模型服务响应超时。",
        ProviderErrorCode::Connection => "无法连接模型服务。",
        ProviderErrorCode::Http => "模型服务暂时不可用。",
        ProviderErrorCode::ClientConfiguration => "模型服务配置无效。",
        ProviderErrorCode::InvalidResponse | ProviderErrorCode::EmptyResponse => {
            "模型服务返回了无效响应。"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm_provider::{ProviderError, ProviderErrorCode};

    #[test]
    fn provider_errors_keep_stable_llm_codes() {
        let error = AppError::from(ProviderError::new(ProviderErrorCode::Timeout, "timeout"));

        assert_eq!(error.code, "llm.timeout");
        assert_eq!(error.message, "模型服务响应超时。");
        assert!(error.retryable);
    }

    #[test]
    fn constructors_keep_stable_beta_codes() {
        assert_eq!(AppError::database("failed").code, "db.error");
        assert_eq!(
            AppError::credential_unavailable("failed").code,
            "credential.unavailable"
        );
        assert_eq!(
            AppError::credential_not_set("failed").code,
            "credential.not_set"
        );
        assert_eq!(AppError::configuration("failed").code, "config.invalid");
        assert_eq!(
            AppError::llm_invalid_response("failed").code,
            "llm.invalid_response"
        );
    }

    #[test]
    fn fs_error_constructors_keep_stable_codes() {
        assert_eq!(AppError::fs_not_a_file("x").code, "fs.not_a_file");
        assert_eq!(AppError::fs_not_a_dir("x").code, "fs.not_a_dir");
        assert_eq!(
            AppError::fs_path_resolve_failed("x").code,
            "fs.path_resolve_failed"
        );
        assert_eq!(AppError::fs_read_failed("x").code, "fs.read_failed");
        assert_eq!(AppError::fs_too_large("x").code, "fs.too_large");
        assert_eq!(AppError::fs_invalid_utf8("x").code, "fs.invalid_utf8");
        assert_eq!(AppError::fs_unsupported("x").code, "fs.unsupported");
    }

    #[test]
    fn serialized_contract_contains_recovery_metadata_without_internal_error() {
        let error = AppError::database("/home/alice/private.sqlite: disk I/O error");
        let json = serde_json::to_value(error).expect("error serializes");
        assert_eq!(json["code"], "db.error");
        assert_eq!(json["retryable"], true);
        assert_eq!(json["action"], "retry_or_open_recovery");
        assert!(json["correlationId"].as_str().unwrap().starts_with("err-"));
        assert!(!json.to_string().contains("/home/alice"));
    }
}
