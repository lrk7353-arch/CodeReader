use reqwest::{Client, StatusCode, Url};
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
            let is_responses = is_responses_endpoint(request.endpoint);
            let payload: Value = if is_responses {
                serde_json::to_value(ResponsesRequest {
                    model: request.model,
                    input: request.messages,
                    temperature: 0.1,
                })
            } else {
                serde_json::to_value(ChatCompletionRequest {
                    model: request.model,
                    messages: request.messages,
                    temperature: 0.1,
                })
            }
            .map_err(|error| {
                ProviderError::new(
                    ProviderErrorCode::ClientConfiguration,
                    format!("Failed to serialize model request: {error}"),
                )
            })?;

            let mut last_error =
                ProviderError::new(ProviderErrorCode::Connection, "模型请求未完成。");

            for attempt in 0..2 {
                let mut builder = self.client.post(request.endpoint).json(&payload);
                if let Some(api_key) = request.api_key {
                    builder = builder.bearer_auth(api_key);
                }
                match builder.send().await {
                    Ok(response) if response.status().is_success() => {
                        return if is_responses {
                            parse_responses_response(response).await
                        } else {
                            parse_chat_completion_response(response).await
                        };
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

#[derive(Serialize)]
struct ResponsesRequest<'a> {
    model: &'a str,
    input: Vec<ProviderMessage>,
    temperature: f32,
}

#[derive(Deserialize)]
struct ResponsesResponse {
    #[serde(default)]
    output_text: Option<String>,
    #[serde(default)]
    output: Vec<ResponsesOutput>,
}

#[derive(Deserialize)]
struct ResponsesOutput {
    #[serde(default)]
    content: Vec<ResponsesContent>,
}

#[derive(Deserialize)]
struct ResponsesContent {
    #[serde(default)]
    text: Option<String>,
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

fn is_responses_endpoint(endpoint: &str) -> bool {
    Url::parse(endpoint)
        .ok()
        .map(|url| url.path().ends_with("/responses"))
        .unwrap_or(false)
}

async fn parse_chat_completion_response(
    response: reqwest::Response,
) -> Result<String, ProviderError> {
    let payload = response
        .json::<ChatCompletionResponse>()
        .await
        .map_err(|error| {
            ProviderError::new(
                ProviderErrorCode::InvalidResponse,
                format!("Model response is not valid Chat Completions JSON: {error}"),
            )
        })?;
    payload
        .choices
        .into_iter()
        .find_map(|choice| choice.message.content)
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| {
            ProviderError::new(
                ProviderErrorCode::EmptyResponse,
                "Model response did not include usable message.content.",
            )
        })
}

async fn parse_responses_response(response: reqwest::Response) -> Result<String, ProviderError> {
    let parsed = response
        .json::<ResponsesResponse>()
        .await
        .map_err(|error| {
            ProviderError::new(
                ProviderErrorCode::InvalidResponse,
                format!("Model response is not valid Responses JSON: {error}"),
            )
        })?;
    if let Some(text) = parsed.output_text.as_deref() {
        if !text.trim().is_empty() {
            return Ok(text.to_string());
        }
    }
    for output in &parsed.output {
        for content in &output.content {
            if let Some(text) = content.text.as_deref() {
                if !text.trim().is_empty() {
                    return Ok(text.to_string());
                }
            }
        }
    }
    Err(ProviderError::new(
        ProviderErrorCode::EmptyResponse,
        "Model response did not include usable output_text or output content.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn detects_responses_endpoint_by_path() {
        assert!(is_responses_endpoint("https://api.openai.com/v1/responses"));
        assert!(is_responses_endpoint("http://127.0.0.1:11434/v1/responses"));
        assert!(is_responses_endpoint(
            "https://api.example.com/api/responses"
        ));
        assert!(!is_responses_endpoint(
            "https://api.openai.com/v1/chat/completions"
        ));
        assert!(!is_responses_endpoint("not-a-url"));
    }

    #[test]
    fn chat_completions_endpoint_sends_and_parses_chat_payload() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("test runtime builds");
        runtime.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").expect("mock binds");
            let address = listener.local_addr().expect("mock address");
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("mock accepts");
                let request = read_http_request(&mut stream);
                assert!(
                    request.body.contains("\"messages\""),
                    "chat payload should include messages field: {}",
                    request.body
                );
                assert!(
                    !request.body.contains("\"input\""),
                    "chat payload should not use input field: {}",
                    request.body
                );
                assert!(
                    request
                        .headers
                        .to_ascii_lowercase()
                        .contains("bearer sk-test-key"),
                    "bearer auth header should be sent: {}",
                    request.headers
                );
                let body = serde_json::json!({
                    "choices": [{
                        "message": {
                            "content": "chat-output"
                        }
                    }]
                })
                .to_string();
                write_http_response(&mut stream, &body);
            });

            let provider = OpenAiCompatibleProvider::new(10).expect("provider builds");
            let result = provider
                .complete(CompletionRequest {
                    endpoint: &format!("http://{address}/v1/chat/completions"),
                    model: "fixture-model",
                    api_key: Some("sk-test-key"),
                    messages: vec![
                        ProviderMessage::system("system"),
                        ProviderMessage::user("user"),
                    ],
                })
                .await;

            assert_eq!(result.expect("chat completes"), "chat-output");
            server.join().expect("server joins");
        });
    }

    #[test]
    fn responses_endpoint_sends_and_parses_output_text() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("test runtime builds");
        runtime.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").expect("mock binds");
            let address = listener.local_addr().expect("mock address");
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("mock accepts");
                let request = read_http_request(&mut stream);
                assert!(
                    request.body.contains("\"input\""),
                    "responses payload should include input field: {}",
                    request.body
                );
                assert!(
                    !request.body.contains("\"messages\""),
                    "responses payload should not use messages field: {}",
                    request.body
                );
                let body = serde_json::json!({
                    "output_text": "responses-output"
                })
                .to_string();
                write_http_response(&mut stream, &body);
            });

            let provider = OpenAiCompatibleProvider::new(10).expect("provider builds");
            let result = provider
                .complete(CompletionRequest {
                    endpoint: &format!("http://{address}/v1/responses"),
                    model: "fixture-model",
                    api_key: None,
                    messages: vec![ProviderMessage::user("user")],
                })
                .await;

            assert_eq!(result.expect("responses completes"), "responses-output");
            server.join().expect("server joins");
        });
    }

    #[test]
    fn responses_endpoint_parses_nested_output_content_text() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("test runtime builds");
        runtime.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").expect("mock binds");
            let address = listener.local_addr().expect("mock address");
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("mock accepts");
                let _ = read_http_request(&mut stream);
                let body = serde_json::json!({
                    "output": [{
                        "content": [
                            { "type": "output_text", "text": "nested-text" }
                        ]
                    }]
                })
                .to_string();
                write_http_response(&mut stream, &body);
            });

            let provider = OpenAiCompatibleProvider::new(10).expect("provider builds");
            let result = provider
                .complete(CompletionRequest {
                    endpoint: &format!("http://{address}/v1/responses"),
                    model: "fixture-model",
                    api_key: None,
                    messages: vec![ProviderMessage::user("user")],
                })
                .await;

            assert_eq!(result.expect("responses parses nested text"), "nested-text");
            server.join().expect("server joins");
        });
    }

    #[test]
    fn responses_endpoint_invalid_json_returns_invalid_response() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("test runtime builds");
        runtime.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").expect("mock binds");
            let address = listener.local_addr().expect("mock address");
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("mock accepts");
                let _ = read_http_request(&mut stream);
                write_http_response(&mut stream, "not-valid-json");
            });

            let provider = OpenAiCompatibleProvider::new(10).expect("provider builds");
            let error = provider
                .complete(CompletionRequest {
                    endpoint: &format!("http://{address}/v1/responses"),
                    model: "fixture-model",
                    api_key: None,
                    messages: vec![ProviderMessage::user("user")],
                })
                .await
                .expect_err("malformed responses payload should fail");

            assert_eq!(error.code, ProviderErrorCode::InvalidResponse);
            server.join().expect("server joins");
        });
    }

    #[test]
    fn responses_endpoint_blank_content_returns_empty_response() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("test runtime builds");
        runtime.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").expect("mock binds");
            let address = listener.local_addr().expect("mock address");
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("mock accepts");
                let _ = read_http_request(&mut stream);
                let body = serde_json::json!({
                    "output_text": "   ",
                    "output": [{
                        "content": [{ "text": "" }]
                    }]
                })
                .to_string();
                write_http_response(&mut stream, &body);
            });

            let provider = OpenAiCompatibleProvider::new(10).expect("provider builds");
            let error = provider
                .complete(CompletionRequest {
                    endpoint: &format!("http://{address}/v1/responses"),
                    model: "fixture-model",
                    api_key: None,
                    messages: vec![ProviderMessage::user("user")],
                })
                .await
                .expect_err("blank responses payload should fail");

            assert_eq!(error.code, ProviderErrorCode::EmptyResponse);
            server.join().expect("server joins");
        });
    }

    struct CapturedRequest {
        headers: String,
        body: String,
    }

    fn read_http_request(stream: &mut std::net::TcpStream) -> CapturedRequest {
        let mut buffer = Vec::new();
        let mut chunk = [0_u8; 1024];
        loop {
            let read = stream.read(&mut chunk).expect("read request");
            if read == 0 {
                break;
            }
            buffer.extend_from_slice(&chunk[..read]);
            let Some(header_end) = buffer.windows(4).position(|window| window == b"\r\n\r\n")
            else {
                continue;
            };
            let header_end = header_end + 4;
            let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
            let content_length = headers
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|value| value.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            if buffer.len() >= header_end + content_length {
                let body =
                    String::from_utf8_lossy(&buffer[header_end..header_end + content_length])
                        .to_string();
                return CapturedRequest { headers, body };
            }
        }
        panic!("failed to read complete HTTP request");
    }

    fn write_http_response(stream: &mut std::net::TcpStream, body: &str) {
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream
            .write_all(response.as_bytes())
            .expect("mock provider responds");
    }
}
