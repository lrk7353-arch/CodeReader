use serde::Serialize;

use crate::llm_provider::ProviderError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct AppError {
    code: &'static str,
    message: String,
}

impl AppError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn database(message: impl Into<String>) -> Self {
        Self::new("db.error", message)
    }

    pub(crate) fn credential_unavailable(message: impl Into<String>) -> Self {
        Self::new("credential.unavailable", message)
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
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<ProviderError> for AppError {
    fn from(error: ProviderError) -> Self {
        Self::new(error.code.as_str(), error.message)
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
        assert_eq!(error.message, "timeout");
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
}
