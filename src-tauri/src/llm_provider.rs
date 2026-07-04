use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

const MAX_PROVIDER_ERROR_CHARS: usize = 320;

pub(crate) type ProviderFuture<'a> =
    Pin<Box<dyn Future<Output = Result<String, ProviderError>> + Send + 'a>>;

#[derive(Clone)]
pub(crate) struct ProviderMessage {
    role: &'static str,
    content: String,
}

impl ProviderMessage {
    pub(crate) fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system",
            content: content.into(),
        }
    }

    pub(crate) fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user",
            content: content.into(),
        }
    }

    pub(crate) fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant",
            content: content.into(),
        }
    }
}

pub(crate) struct CompletionRequest<'a> {
    pub(crate) endpoint: &'a str,
    pub(crate) model: &'a str,
    pub(crate) api_key: Option<&'a str>,
    pub(crate) messages: Vec<ProviderMessage>,
}

pub(crate) trait LlmProvider {
    fn complete<'a>(&'a self, request: CompletionRequest<'a>) -> ProviderFuture<'a>;
}

pub(crate) struct OpenAiCompatibleProvider {
    client: Client,
}

impl OpenAiCompatibleProvider {
    pub(crate) fn new(timeout_seconds: u64) -> Result<Self, ProviderError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_seconds))
            .build()
            .map_err(|error| {
                ProviderError::new(
                    ProviderErrorCode::ClientConfiguration,
                    format!("无法创建模型请求客户端：{error}"),
                )
            })?;
        Ok(Self { client })
    }
}

impl LlmProvider for OpenAiCompatibleProvider {
    fn complete<'a>(&'a self, request: CompletionRequest<'a>) -> ProviderFuture<'a> {
        Box::pin(async move {
            let payload = ChatCompletionRequest {
                model: request.model,
                messages: request.messages,
                temperature: 0.1,
            };
            let mut last_error =
                ProviderError::new(ProviderErrorCode::Connection, "模型请求未完成。");

            for attempt in 0..2 {
                let mut builder = self.client.post(request.endpoint).json(&payload);
                if let Some(api_key) = request.api_key {
                    builder = builder.bearer_auth(api_key);
                }
                match builder.send().await {
                    Ok(response) if response.status().is_success() => {
                        let payload =
                            response
                                .json::<ChatCompletionResponse>()
                                .await
                                .map_err(|error| {
                                    ProviderError::new(
                                        ProviderErrorCode::InvalidResponse,
                                        format!(
                                            "模型响应不是有效的 Chat Completions JSON：{error}"
                                        ),
                                    )
                                })?;
                        return payload
                            .choices
                            .into_iter()
                            .find_map(|choice| choice.message.content)
                            .filter(|content| !content.trim().is_empty())
                            .ok_or_else(|| {
                                ProviderError::new(
                                    ProviderErrorCode::EmptyResponse,
                                    "模型响应中没有可用的 message.content。",
                                )
                            });
                    }
                    Ok(response) => {
                        let status = response.status();
                        let detail = provider_error_detail(response).await;
                        last_error = ProviderError::new(
                            ProviderErrorCode::Http,
                            format!("模型请求失败（HTTP {status}）：{detail}"),
                        );
                        if attempt == 0 && retryable_status(status) {
                            continue;
                        }
                        return Err(last_error);
                    }
                    Err(error) => {
                        last_error = if error.is_timeout() {
                            ProviderError::new(
                                ProviderErrorCode::Timeout,
                                "模型请求超时，现有解释未被覆盖。",
                            )
                        } else if error.is_connect() {
                            ProviderError::new(
                                ProviderErrorCode::Connection,
                                "无法连接模型端点，请检查 URL、网络或本地模型服务是否已启动。",
                            )
                        } else {
                            ProviderError::new(
                                ProviderErrorCode::Connection,
                                format!("无法连接模型端点：{error}"),
                            )
                        };
                        if attempt == 0 {
                            continue;
                        }
                    }
                }
            }
            Err(last_error)
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProviderErrorCode {
    ClientConfiguration,
    Timeout,
    Connection,
    Http,
    InvalidResponse,
    EmptyResponse,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProviderError {
    pub(crate) code: ProviderErrorCode,
    pub(crate) message: String,
}

impl ProviderError {
    pub(crate) fn new(code: ProviderErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "[{}] {}", self.code.as_str(), self.message)
    }
}

impl ProviderErrorCode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::ClientConfiguration => "llm.client_configuration",
            Self::Timeout => "llm.timeout",
            Self::Connection => "llm.connection",
            Self::Http => "llm.http",
            Self::InvalidResponse => "llm.invalid_response",
            Self::EmptyResponse => "llm.empty_response",
        }
    }
}

#[derive(Serialize)]
struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: Vec<ProviderMessage>,
    temperature: f32,
}

impl Serialize for ProviderMessage {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct WireMessage<'a> {
            role: &'static str,
            content: &'a str,
        }

        WireMessage {
            role: self.role,
            content: &self.content,
        }
        .serialize(serializer)
    }
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: Option<String>,
}

async fn provider_error_detail(response: reqwest::Response) -> String {
    let body = response.text().await.unwrap_or_default();
    let message = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.trim().to_string());
    let message = if message.is_empty() {
        "服务未返回错误详情。".to_string()
    } else {
        message
    };
    message.chars().take(MAX_PROVIDER_ERROR_CHARS).collect()
}

fn retryable_status(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}
