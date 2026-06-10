#![cfg_attr(test, allow(dead_code))]

use keyring::{Entry, Error as KeyringError};
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
#[cfg(not(test))]
use tauri::AppHandle;

#[cfg(not(test))]
use crate::context_builder::ContextNodeInput;
use crate::context_builder::{
    build_context_bundle, BuildContextRequest, ContextFileInput, ContextTargetInput,
};
#[cfg(not(test))]
use crate::persistence_service::{self, GeneratedExplanationInput};
use crate::persistence_service::{ExplanationPayload, StoredModelConfig};
use crate::utils::sha256_hex;

const DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_SECONDS: u64 = 60;
const KEYRING_SERVICE: &str = "com.codereader.app";
const KEYRING_USER: &str = "default-llm-api-key";
const PROMPT_VERSION: &str = "code-explanation-v0.1";
const MAX_PROVIDER_ERROR_CHARS: usize = 320;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveModelConfigRequest {
    endpoint: String,
    model: String,
    timeout_seconds: Option<u64>,
    api_key: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfigPayload {
    endpoint: String,
    model: String,
    timeout_seconds: u64,
    has_api_key: bool,
    configured: bool,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateExplanationRequest {
    file: GenerationFileInput,
    target: GenerationTargetInput,
    display_mode: Option<String>,
    code_transmission_approved: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerationFileInput {
    id: String,
    path: String,
    project_id: Option<String>,
    project_root: Option<String>,
    language: String,
    code: String,
    file_hash: Option<String>,
    snapshot_id: Option<String>,
    #[serde(default)]
    code_nodes: Vec<GenerationCodeNodeInput>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GenerationCodeNodeInput {
    id: String,
    node_type: String,
    name: String,
    start_line: usize,
    end_line: usize,
    symbol_id: Option<String>,
    code_hash: String,
    anchor_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerationTargetInput {
    id: String,
    target_type: String,
    target_name: Option<String>,
    start_line: Option<usize>,
    end_line: Option<usize>,
    symbol_id: Option<String>,
    code_hash: Option<String>,
    anchor_text: Option<String>,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateExplanationPayload {
    explanation: ExplanationPayload,
    context_id: String,
    provider: String,
    model: String,
    attempts: usize,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredExplanation {
    code_level_meaning: String,
    local_composition_meaning: String,
    project_role_meaning: String,
    #[serde(default)]
    prior_knowledge: String,
    #[serde(default)]
    risks: Vec<StructuredRisk>,
    #[serde(default)]
    review_suggestion: String,
    #[serde(default)]
    depends_on_lines: Vec<usize>,
    #[serde(default)]
    affects_lines: Vec<usize>,
    trust_label: String,
    trust_reason: String,
    display_mode: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredRisk {
    risk_type: String,
    level: String,
    description: String,
}

#[derive(Serialize)]
struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage>,
    temperature: f32,
}

#[derive(Clone, Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
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

#[cfg(not(test))]
#[tauri::command]
pub fn get_model_config(app: AppHandle) -> Result<ModelConfigPayload, String> {
    let database_path = persistence_service::database_path(&app)?;
    let stored = persistence_service::load_model_config(&database_path)?;
    model_config_payload(stored)
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_model_config(
    app: AppHandle,
    request: SaveModelConfigRequest,
) -> Result<ModelConfigPayload, String> {
    let endpoint = normalize_endpoint(&request.endpoint)?;
    let model = request.model.trim();
    if model.is_empty() {
        return Err("模型名称不能为空。".to_string());
    }
    if model.chars().count() > 160 {
        return Err("模型名称过长。".to_string());
    }
    let timeout_seconds = request
        .timeout_seconds
        .unwrap_or(DEFAULT_TIMEOUT_SECONDS)
        .clamp(10, 300);

    if let Some(api_key) = request.api_key.as_deref() {
        let api_key = api_key.trim();
        if !api_key.is_empty() {
            credential_entry()?
                .set_password(api_key)
                .map_err(keyring_error)?;
        }
    }

    let database_path = persistence_service::database_path(&app)?;
    let stored =
        persistence_service::save_model_config(&database_path, &endpoint, model, timeout_seconds)?;
    model_config_payload(Some(stored))
}

#[cfg(not(test))]
#[tauri::command]
pub fn reset_model_config(app: AppHandle) -> Result<ModelConfigPayload, String> {
    match credential_entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => {}
        Err(error) => return Err(keyring_error(error)),
    }
    let database_path = persistence_service::database_path(&app)?;
    persistence_service::delete_model_config(&database_path)?;
    model_config_payload(None)
}

#[cfg(not(test))]
#[tauri::command]
pub async fn generate_explanation(
    app: AppHandle,
    request: GenerateExplanationRequest,
) -> Result<GenerateExplanationPayload, String> {
    if !request.code_transmission_approved {
        return Err("发送已取消：必须由用户明确确认后才能把上下文片段发送给模型。".to_string());
    }

    let database_path = persistence_service::database_path(&app)?;
    let stored = persistence_service::load_model_config(&database_path)?
        .ok_or_else(|| "尚未配置 LLM。请先在模型设置中填写端点和模型名称。".to_string())?;
    let endpoint = normalize_endpoint(&stored.endpoint)?;
    let api_key = read_api_key()?;
    if api_key.is_none() && !endpoint_allows_keyless(&endpoint)? {
        return Err("当前远程模型端点没有可用的 API Key。请先打开模型设置保存密钥。".to_string());
    }

    let context_request = BuildContextRequest {
        file: ContextFileInput {
            path: request.file.path.clone(),
            language: request.file.language.clone(),
            code: request.file.code.clone(),
            code_nodes: request
                .file
                .code_nodes
                .iter()
                .map(|node| ContextNodeInput {
                    id: node.id.clone(),
                    node_type: node.node_type.clone(),
                    name: node.name.clone(),
                    start_line: node.start_line,
                    end_line: node.end_line,
                    symbol_id: node.symbol_id.clone(),
                    anchor_text: node.anchor_text.clone(),
                })
                .collect(),
        },
        target: ContextTargetInput {
            target_type: request.target.target_type.clone(),
            target_name: request.target.target_name.clone(),
            start_line: request.target.start_line,
            end_line: request.target.end_line,
            symbol_id: request.target.symbol_id.clone(),
        },
        budget: None,
    };
    let context = build_context_bundle(context_request)?;
    let display_mode = normalize_display_mode(request.display_mode.as_deref())?;
    let prompt = build_user_prompt(&context, &display_mode)?;
    let (structured, attempts) = request_structured_explanation(
        &stored,
        api_key.as_deref(),
        prompt,
        context.target.start_line,
        context.target.end_line,
        request.file.code.lines().count().max(1),
        &display_mode,
    )
    .await?;

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
    let target_code = selected_lines(
        &request.file.code,
        context.target.start_line,
        context.target.end_line,
    );
    let matching_code_node = request.file.code_nodes.iter().find(|node| {
        node.node_type == request.target.target_type
            && node.start_line == context.target.start_line
            && node.end_line == context.target.end_line
    });
    let code_hash = request
        .target
        .code_hash
        .clone()
        .or_else(|| matching_code_node.map(|node| node.code_hash.clone()))
        .unwrap_or_else(|| sha256_hex(&target_code));
    let anchor_text = request
        .target
        .anchor_text
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| first_non_empty_line(&target_code));
    let explanation_id = stable_explanation_id(
        &request.target.id,
        &request.target.status,
        &request.file.path,
        &request.target.target_type,
        context.target.start_line,
        context.target.end_line,
        &code_hash,
    );
    let code_node_id = matching_code_node.map(|node| node.id.clone());
    let risk_notes = structured
        .risks
        .iter()
        .map(|risk| {
            format!(
                "[{} / {}] {}",
                risk.risk_type.trim(),
                risk.level.trim(),
                risk.description.trim()
            )
        })
        .collect::<Vec<_>>();
    let learning_note = non_empty(&structured.prior_knowledge);
    let model_info = json!({
        "provider": "openai-compatible",
        "model": stored.model.clone(),
        "endpoint": endpoint.clone(),
    })
    .to_string();
    let context_sources = serde_json::to_string(&context.sources)
        .map_err(|error| format!("Failed to serialize context provenance: {error}"))?;

    let explanation = persistence_service::save_generated_explanation(
        &database_path,
        GeneratedExplanationInput {
            project_id: request.file.project_id,
            project_root: request.file.project_root,
            file_id: request.file.id,
            file_path: request.file.path,
            language: request.file.language,
            file_hash,
            snapshot_id,
            line_count: request.file.code.lines().count().max(1),
            explanation_id,
            code_node_id,
            target_type: request.target.target_type,
            target_name: request.target.target_name,
            symbol_id: request.target.symbol_id,
            start_line: context.target.start_line,
            end_line: context.target.end_line,
            code_hash,
            anchor_text,
            code_level_meaning: structured.code_level_meaning,
            local_composition_meaning: structured.local_composition_meaning,
            project_role_meaning: structured.project_role_meaning,
            prior_knowledge: non_empty(&structured.prior_knowledge),
            risk_notes,
            learning_note,
            review_suggestion: non_empty(&structured.review_suggestion),
            trust_label: structured.trust_label,
            trust_reason: structured.trust_reason,
            depends_on_lines: structured.depends_on_lines,
            affects_lines: structured.affects_lines,
            display_mode: structured.display_mode,
            prompt_version: PROMPT_VERSION.to_string(),
            model_info,
            context_id: context.context_id.clone(),
            context_sources,
        },
    )?;

    Ok(GenerateExplanationPayload {
        explanation,
        context_id: context.context_id,
        provider: "openai-compatible".to_string(),
        model: stored.model,
        attempts,
    })
}

fn model_config_payload(stored: Option<StoredModelConfig>) -> Result<ModelConfigPayload, String> {
    let has_api_key = read_api_key()?.is_some();
    let (endpoint, model, timeout_seconds, updated_at) = match stored {
        Some(config) => (
            config.endpoint,
            config.model,
            config.timeout_seconds,
            Some(config.updated_at),
        ),
        None => (
            DEFAULT_ENDPOINT.to_string(),
            String::new(),
            DEFAULT_TIMEOUT_SECONDS,
            None,
        ),
    };
    let configured =
        !model.is_empty() && (has_api_key || endpoint_allows_keyless(&endpoint).unwrap_or(false));
    Ok(ModelConfigPayload {
        endpoint,
        model,
        timeout_seconds,
        has_api_key,
        configured,
        updated_at,
    })
}

async fn request_structured_explanation(
    config: &StoredModelConfig,
    api_key: Option<&str>,
    prompt: String,
    target_start: usize,
    target_end: usize,
    file_line_count: usize,
    expected_display_mode: &str,
) -> Result<(StructuredExplanation, usize), String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(config.timeout_seconds))
        .build()
        .map_err(|error| format!("无法创建模型请求客户端：{error}"))?;
    let mut messages = vec![
        ChatMessage {
            role: "system",
            content: system_prompt().to_string(),
        },
        ChatMessage {
            role: "user",
            content: prompt,
        },
    ];

    let first = send_completion(&client, config, api_key, messages.clone()).await?;
    match parse_and_validate_structured_explanation(
        &first,
        target_start,
        target_end,
        file_line_count,
        expected_display_mode,
    ) {
        Ok(structured) => Ok((structured, 1)),
        Err(first_error) => {
            messages.push(ChatMessage {
                role: "assistant",
                content: first,
            });
            messages.push(ChatMessage {
                role: "user",
                content: format!(
                    "上一次输出无法通过结构校验：{first_error}。只修复 JSON 格式和字段，不要添加代码围栏或额外说明。"
                ),
            });
            let repaired = send_completion(&client, config, api_key, messages).await?;
            parse_and_validate_structured_explanation(
                &repaired,
                target_start,
                target_end,
                file_line_count,
                expected_display_mode,
            )
            .map(|structured| (structured, 2))
            .map_err(|error| {
                format!("模型连续两次返回了无效结构，现有解释未被覆盖。最后一次错误：{error}")
            })
        }
    }
}

async fn send_completion(
    client: &Client,
    config: &StoredModelConfig,
    api_key: Option<&str>,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let request = ChatCompletionRequest {
        model: &config.model,
        messages,
        temperature: 0.1,
    };
    let mut last_error = String::new();

    for attempt in 0..2 {
        let mut builder = client.post(&config.endpoint).json(&request);
        if let Some(api_key) = api_key {
            builder = builder.bearer_auth(api_key);
        }
        match builder.send().await {
            Ok(response) if response.status().is_success() => {
                let payload = response
                    .json::<ChatCompletionResponse>()
                    .await
                    .map_err(|error| {
                        format!("模型响应不是有效的 Chat Completions JSON：{error}")
                    })?;
                return payload
                    .choices
                    .into_iter()
                    .find_map(|choice| choice.message.content)
                    .filter(|content| !content.trim().is_empty())
                    .ok_or_else(|| "模型响应中没有可用的 message.content。".to_string());
            }
            Ok(response) => {
                let status = response.status();
                let detail = provider_error_detail(response).await;
                last_error = format!("模型请求失败（HTTP {status}）：{detail}");
                if attempt == 0 && retryable_status(status) {
                    continue;
                }
                return Err(last_error);
            }
            Err(error) => {
                last_error = if error.is_timeout() {
                    "模型请求超时，现有解释未被覆盖。".to_string()
                } else if error.is_connect() {
                    "无法连接模型端点，请检查 URL、网络或本地模型服务是否已启动。".to_string()
                } else {
                    format!("无法连接模型端点：{error}")
                };
                if attempt == 0 {
                    continue;
                }
            }
        }
    }
    Err(last_error)
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

fn parse_structured_explanation(content: &str) -> Result<StructuredExplanation, String> {
    let trimmed = content.trim();
    if let Ok(parsed) = serde_json::from_str(trimmed) {
        return Ok(parsed);
    }

    let without_fence = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|value| value.strip_suffix("```"))
        .map(str::trim);
    if let Some(json) = without_fence {
        if let Ok(parsed) = serde_json::from_str(json) {
            return Ok(parsed);
        }
    }

    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    if let (Some(start), Some(end)) = (start, end) {
        if start < end {
            return serde_json::from_str(&trimmed[start..=end])
                .map_err(|error| format!("JSON 解析失败：{error}"));
        }
    }
    Err("响应中没有可解析的 JSON 对象。".to_string())
}

fn parse_and_validate_structured_explanation(
    content: &str,
    target_start: usize,
    target_end: usize,
    file_line_count: usize,
    expected_display_mode: &str,
) -> Result<StructuredExplanation, String> {
    let explanation = parse_structured_explanation(content)?;
    validate_structured_explanation(
        &explanation,
        target_start,
        target_end,
        file_line_count,
        expected_display_mode,
    )?;
    Ok(explanation)
}

fn validate_structured_explanation(
    explanation: &StructuredExplanation,
    target_start: usize,
    target_end: usize,
    file_line_count: usize,
    expected_display_mode: &str,
) -> Result<(), String> {
    for (label, value) in [
        ("codeLevelMeaning", explanation.code_level_meaning.as_str()),
        (
            "localCompositionMeaning",
            explanation.local_composition_meaning.as_str(),
        ),
        (
            "projectRoleMeaning",
            explanation.project_role_meaning.as_str(),
        ),
        ("trustReason", explanation.trust_reason.as_str()),
    ] {
        let length = value.trim().chars().count();
        if length == 0 {
            return Err(format!("{label} 不能为空。"));
        }
        if length > 2400 {
            return Err(format!("{label} 超过允许长度。"));
        }
    }
    if !matches!(
        explanation.trust_label.as_str(),
        "clear" | "context_needed" | "review_recommended"
    ) {
        return Err("trustLabel 必须是 clear、context_needed 或 review_recommended。".to_string());
    }
    if !matches!(explanation.display_mode.as_str(), "plain" | "detailed") {
        return Err("displayMode 必须是 plain 或 detailed。".to_string());
    }
    if explanation.display_mode != expected_display_mode {
        return Err(format!(
            "displayMode 必须与请求的 {expected_display_mode} 模式一致。"
        ));
    }
    for risk in &explanation.risks {
        if risk.description.trim().is_empty() {
            return Err("风险 description 不能为空。".to_string());
        }
        if !matches!(risk.level.as_str(), "low" | "medium" | "high") {
            return Err("风险 level 必须是 low、medium 或 high。".to_string());
        }
    }
    for line in explanation
        .depends_on_lines
        .iter()
        .chain(explanation.affects_lines.iter())
    {
        if *line == 0 || *line > file_line_count {
            return Err(format!("关系行号 {line} 超出当前文件范围。"));
        }
    }
    if target_start == 0 || target_end < target_start || target_end > file_line_count {
        return Err("解释目标行范围无效。".to_string());
    }
    Ok(())
}

fn build_user_prompt(
    context: &crate::context_builder::ContextBundle,
    display_mode: &str,
) -> Result<String, String> {
    let payload = serde_json::to_string_pretty(context)
        .map_err(|error| format!("Failed to serialize Context Bundle: {error}"))?;
    Ok(format!(
        "请根据下列经过授权的 Context Bundle 解释目标代码。\n\
         你只能使用此 Bundle 中的信息；缺少项目上下文时必须明确降低可信标签，不得猜测。\n\
         目标展示模式：{display_mode}\n\
         只输出一个 JSON 对象，字段与系统消息中的 schema 完全一致。\n\
         Context Bundle:\n{payload}"
    ))
}

fn system_prompt() -> &'static str {
    r#"你是 CodeReader 的结构化代码解释器，不是聊天助手。
只解释用户选中的代码目标，只依据提供的 Context Bundle，不得虚构未提供的调用关系或业务背景。
输出必须是一个 JSON 对象，不要使用 Markdown 代码围栏，不要输出额外文字。
schema:
{
  "codeLevelMeaning": "string, 代码本身做什么",
  "localCompositionMeaning": "string, 在当前函数或文件中的作用",
  "projectRoleMeaning": "string, 在已知项目上下文中的角色；上下文不足时应明确说明",
  "priorKnowledge": "string，可为空",
  "risks": [
    {
      "riskType": "string",
      "level": "low | medium | high",
      "description": "string"
    }
  ],
  "reviewSuggestion": "string，可为空",
  "dependsOnLines": [1],
  "affectsLines": [2],
  "trustLabel": "clear | context_needed | review_recommended",
  "trustReason": "string，面向用户的白话依据",
  "displayMode": "plain | detailed"
}
关系行号只能引用 Context Bundle 中真实存在的当前文件行号。不要输出 raw confidence 数字。"#
}

fn normalize_endpoint(value: &str) -> Result<String, String> {
    let value = value.trim();
    let url = Url::parse(value).map_err(|_| "模型端点不是有效 URL。".to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "模型端点缺少主机名。".to_string())?;
    let local = is_local_host(host);
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err("远程模型端点必须使用 HTTPS；HTTP 仅允许 localhost。".to_string());
    }
    if url.cannot_be_a_base() {
        return Err("模型端点格式无效。".to_string());
    }
    Ok(url.to_string())
}

fn endpoint_allows_keyless(endpoint: &str) -> Result<bool, String> {
    let url = Url::parse(endpoint).map_err(|_| "模型端点不是有效 URL。".to_string())?;
    Ok(url.host_str().map(is_local_host).unwrap_or(false))
}

fn is_local_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

fn normalize_display_mode(value: Option<&str>) -> Result<String, String> {
    match value.unwrap_or("plain") {
        "plain" => Ok("plain".to_string()),
        "detailed" => Ok("detailed".to_string()),
        _ => Err("展示模式必须是 plain 或 detailed。".to_string()),
    }
}

fn credential_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(keyring_error)
}

fn read_api_key() -> Result<Option<String>, String> {
    match credential_entry()?.get_password() {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(keyring_error(error)),
    }
}

fn keyring_error(error: KeyringError) -> String {
    format!("系统凭据库操作失败：{error}")
}

fn stable_explanation_id(
    current_id: &str,
    status: &str,
    file_path: &str,
    target_type: &str,
    start_line: usize,
    end_line: usize,
    code_hash: &str,
) -> String {
    if status != "transient" && !current_id.starts_with("range:") {
        return current_id.to_string();
    }
    let seed = format!("{file_path}:{target_type}:{start_line}:{end_line}:{code_hash}");
    format!("exp:ai:{}", &sha256_hex(&seed)[..24])
}

fn selected_lines(code: &str, start_line: usize, end_line: usize) -> String {
    code.lines()
        .skip(start_line.saturating_sub(1))
        .take(end_line.saturating_sub(start_line) + 1)
        .collect::<Vec<_>>()
        .join("\n")
}

fn first_non_empty_line(code: &str) -> String {
    code.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("")
        .to_string()
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context_builder::ContextBudgetInput;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn accepts_plain_and_fenced_structured_json() {
        let json = valid_response_json();
        assert!(parse_structured_explanation(&json).is_ok());
        assert!(parse_structured_explanation(&format!("```json\n{json}\n```")).is_ok());
    }

    #[test]
    fn rejects_invalid_structured_values() {
        let mut parsed =
            parse_structured_explanation(&valid_response_json()).expect("fixture should parse");
        parsed.trust_label = "0.82".to_string();
        assert!(validate_structured_explanation(&parsed, 2, 2, 10, "plain").is_err());

        parsed.trust_label = "clear".to_string();
        parsed.depends_on_lines = vec![99];
        assert!(validate_structured_explanation(&parsed, 2, 2, 10, "plain").is_err());
    }

    #[test]
    fn prompt_contains_only_context_builder_output() {
        let code = (1..=30)
            .map(|line| {
                if line == 1 {
                    "const secretOutsideBudget = true;".to_string()
                } else if line == 20 {
                    "const selected = request.value;".to_string()
                } else {
                    format!("const line{line} = {line};")
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        let context = build_context_bundle(BuildContextRequest {
            file: ContextFileInput {
                path: "src/example.ts".to_string(),
                language: "typescript".to_string(),
                code,
                code_nodes: Vec::new(),
            },
            target: ContextTargetInput {
                target_type: "line".to_string(),
                target_name: None,
                start_line: Some(20),
                end_line: Some(20),
                symbol_id: None,
            },
            budget: Some(ContextBudgetInput {
                max_chars: Some(800),
                max_snippets: Some(4),
            }),
        })
        .expect("context should build");
        let prompt = build_user_prompt(&context, "plain").expect("prompt should build");

        assert!(prompt.contains("const selected = request.value;"));
        assert!(!prompt.contains("secretOutsideBudget"));
        assert!(!prompt.contains("\"code\":\"const line1"));
    }

    #[test]
    fn endpoint_requires_https_except_for_local_models() {
        assert!(normalize_endpoint("https://api.example.com/v1/chat/completions").is_ok());
        assert!(normalize_endpoint("http://127.0.0.1:11434/v1/chat/completions").is_ok());
        assert!(normalize_endpoint("http://api.example.com/v1/chat/completions").is_err());
    }

    #[test]
    fn retries_semantically_invalid_provider_output() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("test runtime builds");
        runtime.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").expect("mock provider binds");
            let address = listener.local_addr().expect("mock provider has address");
            let valid = valid_response_json();
            let server = thread::spawn(move || {
                for attempt in 0..2 {
                    let (mut stream, _) = listener.accept().expect("mock provider accepts");
                    read_http_request(&mut stream);
                    let content = if attempt == 0 {
                        valid.replace("\"context_needed\"", "\"0.82\"")
                    } else {
                        valid.clone()
                    };
                    let body = json!({
                        "choices": [{
                            "message": {
                                "content": content
                            }
                        }]
                    })
                    .to_string();
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    stream
                        .write_all(response.as_bytes())
                        .expect("mock provider responds");
                }
            });
            let config = StoredModelConfig {
                endpoint: format!("http://{address}/v1/chat/completions"),
                model: "fixture-model".to_string(),
                timeout_seconds: 10,
                updated_at: "test".to_string(),
            };

            let (explanation, attempts) = request_structured_explanation(
                &config,
                None,
                "fixture prompt".to_string(),
                2,
                2,
                10,
                "plain",
            )
            .await
            .expect("second provider output should pass");

            assert_eq!(attempts, 2);
            assert_eq!(explanation.trust_label, "context_needed");
            server.join().expect("mock provider thread joins");
        });
    }

    fn read_http_request(stream: &mut std::net::TcpStream) {
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
            let headers = String::from_utf8_lossy(&buffer[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|value| value.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            if buffer.len() >= header_end + content_length {
                break;
            }
        }
    }

    fn valid_response_json() -> String {
        json!({
            "codeLevelMeaning": "读取请求中的值。",
            "localCompositionMeaning": "为后续校验准备输入。",
            "projectRoleMeaning": "当前上下文不足，无法确认更高层业务角色。",
            "priorKnowledge": "变量赋值。",
            "risks": [{
                "riskType": "input_validation",
                "level": "medium",
                "description": "需要确认后续是否校验输入。"
            }],
            "reviewSuggestion": "检查后续校验。",
            "dependsOnLines": [2],
            "affectsLines": [3],
            "trustLabel": "context_needed",
            "trustReason": "只提供了局部上下文。",
            "displayMode": "plain"
        })
        .to_string()
    }
}
