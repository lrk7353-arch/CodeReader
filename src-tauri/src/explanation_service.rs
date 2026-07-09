#![cfg_attr(test, allow(dead_code))]

use keyring::{Entry, Error as KeyringError};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::json;
#[cfg(not(test))]
use tauri::AppHandle;

use crate::app_error::AppError;
#[cfg(not(test))]
use crate::context_builder::ContextNodeInput;
use crate::context_builder::{
    build_context_bundle, BuildContextRequest, ContextFileInput, ContextTargetInput,
};
use crate::llm_provider::{
    CompletionRequest, LlmProvider, OpenAiCompatibleProvider, ProviderMessage,
};
#[allow(unused_imports)]
use crate::persistence_service::{self, GeneratedExplanationInput};
use crate::persistence_service::{ExplanationPayload, StoredModelConfig};
use crate::utils::sha256_hex;

const DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_SECONDS: u64 = 60;
const KEYRING_SERVICE: &str = "com.codereader.app";
const KEYRING_USER: &str = "default-llm-api-key";

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

struct ExplanationValidationContext<'a> {
    target_start: usize,
    target_end: usize,
    file_line_count: usize,
    expected_display_mode: &'a str,
}

#[cfg(not(test))]
#[tauri::command]
pub fn get_model_config(app: AppHandle) -> Result<ModelConfigPayload, AppError> {
    let database_path = persistence_service::database_path(&app).map_err(AppError::database)?;
    let stored =
        persistence_service::load_model_config(&database_path).map_err(AppError::database)?;
    model_config_payload(stored)
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_model_config(
    app: AppHandle,
    request: SaveModelConfigRequest,
) -> Result<ModelConfigPayload, AppError> {
    let endpoint = normalize_endpoint(&request.endpoint)?;
    let model = request.model.trim();
    if model.is_empty() {
        return Err(AppError::configuration("模型名称不能为空。"));
    }
    if model.chars().count() > 160 {
        return Err(AppError::configuration("模型名称过长。"));
    }
    let timeout_seconds = request
        .timeout_seconds
        .unwrap_or(DEFAULT_TIMEOUT_SECONDS)
        .clamp(10, 300);

    if let Some(api_key) = request.api_key.as_deref() {
        let api_key = api_key.trim();
        if !api_key.is_empty() {
            SystemCredentialStore
                .set_password(api_key)
                .map_err(keyring_error)?;
        }
    }

    let database_path = persistence_service::database_path(&app).map_err(AppError::database)?;
    let stored =
        persistence_service::save_model_config(&database_path, &endpoint, model, timeout_seconds)
            .map_err(AppError::database)?;
    model_config_payload(Some(stored))
}

#[cfg(not(test))]
#[tauri::command]
pub fn reset_model_config(app: AppHandle) -> Result<ModelConfigPayload, AppError> {
    match SystemCredentialStore.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => {}
        Err(error) => return Err(keyring_error(error)),
    }
    let database_path = persistence_service::database_path(&app).map_err(AppError::database)?;
    persistence_service::delete_model_config(&database_path).map_err(AppError::database)?;
    model_config_payload(None)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionRequest {
    endpoint: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
}

/// Tests the configured model connection by sending a minimal chat completion
/// request. When `request` is provided, uses the form values (endpoint/model/
/// apiKey) so the user can test before saving; otherwise falls back to the
/// persisted config. Returns ok=true with the model echo on success.
#[cfg(not(test))]
#[tauri::command]
pub async fn test_model_connection(
    app: AppHandle,
    request: Option<TestConnectionRequest>,
) -> Result<ModelConnectionResult, AppError> {
    let (endpoint, model, api_key, timeout_seconds) = match request {
        Some(form) => {
            let endpoint = normalize_endpoint(&form.endpoint.unwrap_or_default())?;
            let model = form.model.unwrap_or_default();
            if model.trim().is_empty() {
                return Err(AppError::configuration("模型名称不能为空。"));
            }
            let api_key = form
                .api_key
                .map(|k| k.trim().to_string())
                .filter(|k| !k.is_empty())
                .unwrap_or_default();
            // Use the saved timeout if available, otherwise default.
            let timeout_seconds = persistence_service::load_model_config(
                &persistence_service::database_path(&app).map_err(AppError::database)?,
            )
            .ok()
            .flatten()
            .map(|s| s.timeout_seconds)
            .unwrap_or(DEFAULT_TIMEOUT_SECONDS);
            (endpoint, model, api_key, timeout_seconds)
        }
        None => {
            let database_path =
                persistence_service::database_path(&app).map_err(AppError::database)?;
            let stored = persistence_service::load_model_config(&database_path)
                .map_err(AppError::database)?
                .ok_or_else(|| {
                    AppError::configuration("尚未配置 LLM。请先在模型设置中填写端点和模型名称。")
                })?;
            let endpoint = normalize_endpoint(&stored.endpoint)?;
            let api_key = read_api_key()?;
            (endpoint, stored.model, api_key.unwrap_or_default(), stored.timeout_seconds)
        }
    };

    if api_key.is_empty() && !endpoint_allows_keyless(&endpoint)? {
        return Err(AppError::credential_not_set(
            "当前远程模型端点没有可用的 API Key。",
        ));
    }
    let provider = OpenAiCompatibleProvider::new(timeout_seconds).map_err(AppError::from)?;
    let result = provider
        .complete(CompletionRequest {
            endpoint: &endpoint,
            model: &model,
            api_key: if api_key.is_empty() { None } else { Some(&api_key) },
            messages: vec![
                ProviderMessage::system("Reply with the single word: ok"),
                ProviderMessage::user("ping"),
            ],
        })
        .await
        .map_err(AppError::from)?;
    let echoed = result.trim();
    if echoed.is_empty() {
        return Err(AppError::llm_invalid_response("模型返回空响应。"));
    }
    Ok(ModelConnectionResult {
        ok: true,
        model,
        endpoint,
        echo: echoed.to_string(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConnectionResult {
    ok: bool,
    model: String,
    endpoint: String,
    echo: String,
}

#[cfg(not(test))]
#[tauri::command]
pub async fn generate_explanation(
    app: AppHandle,
    request: GenerateExplanationRequest,
) -> Result<GenerateExplanationPayload, AppError> {
    if !request.code_transmission_approved {
        return Err(AppError::configuration(
            "发送已取消：必须由用户明确确认后才能把上下文片段发送给模型。",
        ));
    }

    let database_path = persistence_service::database_path(&app).map_err(AppError::database)?;
    let stored = persistence_service::load_model_config(&database_path)
        .map_err(AppError::database)?
        .ok_or_else(|| {
            AppError::configuration("尚未配置 LLM。请先在模型设置中填写端点和模型名称。")
        })?;
    let endpoint = normalize_endpoint(&stored.endpoint)?;
    let api_key = read_api_key()?;
    if api_key.is_none() && !endpoint_allows_keyless(&endpoint)? {
        return Err(AppError::credential_not_set(
            "当前远程模型端点没有可用的 API Key。请先打开模型设置保存密钥。",
        ));
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
    let context = build_context_bundle(context_request).map_err(AppError::configuration)?;
    let display_mode = normalize_display_mode(request.display_mode.as_deref())?;
    let project_id = request
        .file
        .project_id
        .clone()
        .unwrap_or_else(|| format!("project:{}", &sha256_hex(&request.file.path)[..20]));
    let prompt_version = persistence_service::pick_prompt_version_for_target(
        &database_path,
        persistence_service::DEFAULT_GENERATION_PROMPT_VERSION,
        &project_id,
        &request.file.path,
        &request.target.id,
    )
    .map_err(AppError::database)?;
    let templates = persistence_service::load_prompt_templates(&database_path, &prompt_version)
        .map_err(AppError::database)?
        .unwrap_or_else(|| persistence_service::PromptTemplates {
            system: persistence_service::DEFAULT_SYSTEM_PROMPT_TEMPLATE.to_string(),
            user: persistence_service::DEFAULT_USER_PROMPT_TEMPLATE.to_string(),
        });
    let prompt = build_user_prompt(&context, &display_mode, &prompt_version, &templates.user)
        .map_err(AppError::configuration)?;
    let (structured, attempts) = request_structured_explanation(
        &stored,
        api_key.as_deref(),
        prompt,
        context.target.start_line,
        context.target.end_line,
        request.file.code.lines().count().max(1),
        &display_mode,
        &templates.system,
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
    let context_sources = serde_json::to_string(&context.sources).map_err(|error| {
        AppError::configuration(format!("Failed to serialize context provenance: {error}"))
    })?;
    // prompt_version was resolved before build_user_prompt so it could be
    // injected into the prompt text; the same value flows into the persistence
    // record below instead of re-rolling the canary sample.

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
            prompt_version,
            model_info,
            context_id: context.context_id.clone(),
            context_sources,
        },
    )
    .map_err(AppError::database)?;

    Ok(GenerateExplanationPayload {
        explanation,
        context_id: context.context_id,
        provider: "openai-compatible".to_string(),
        model: stored.model,
        attempts,
    })
}

fn model_config_payload(stored: Option<StoredModelConfig>) -> Result<ModelConfigPayload, AppError> {
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

#[allow(clippy::too_many_arguments)]
async fn request_structured_explanation(
    config: &StoredModelConfig,
    api_key: Option<&str>,
    prompt: String,
    target_start: usize,
    target_end: usize,
    file_line_count: usize,
    expected_display_mode: &str,
    system_prompt: &str,
) -> Result<(StructuredExplanation, usize), AppError> {
    let provider = OpenAiCompatibleProvider::new(config.timeout_seconds).map_err(AppError::from)?;
    let validation = ExplanationValidationContext {
        target_start,
        target_end,
        file_line_count,
        expected_display_mode,
    };
    request_structured_explanation_with_provider(
        &provider,
        config,
        api_key,
        prompt,
        &validation,
        system_prompt,
    )
    .await
}

async fn request_structured_explanation_with_provider<P: LlmProvider>(
    provider: &P,
    config: &StoredModelConfig,
    api_key: Option<&str>,
    prompt: String,
    validation: &ExplanationValidationContext<'_>,
    system_prompt: &str,
) -> Result<(StructuredExplanation, usize), AppError> {
    let mut messages = vec![
        ProviderMessage::system(system_prompt),
        ProviderMessage::user(prompt),
    ];

    let first = provider
        .complete(CompletionRequest {
            endpoint: &config.endpoint,
            model: &config.model,
            api_key,
            messages: messages.clone(),
        })
        .await
        .map_err(AppError::from)?;
    match parse_and_validate_structured_explanation(
        &first,
        validation.target_start,
        validation.target_end,
        validation.file_line_count,
        validation.expected_display_mode,
    ) {
        Ok(structured) => Ok((structured, 1)),
        Err(first_error) => {
            messages.push(ProviderMessage::assistant(first));
            messages.push(ProviderMessage::user(format!(
                "上一次输出无法通过结构校验：{first_error}。只修复 JSON 格式和字段，不要添加代码围栏或额外说明。"
            )));
            let repaired = provider
                .complete(CompletionRequest {
                    endpoint: &config.endpoint,
                    model: &config.model,
                    api_key,
                    messages,
                })
                .await
                .map_err(AppError::from)?;
            parse_and_validate_structured_explanation(
                &repaired,
                validation.target_start,
                validation.target_end,
                validation.file_line_count,
                validation.expected_display_mode,
            )
            .map(|structured| (structured, 2))
            .map_err(|error| {
                AppError::llm_invalid_response(format!(
                    "模型连续两次返回了无效结构，现有解释未被覆盖。最后一次错误：{error}"
                ))
            })
        }
    }
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
    prompt_version: &str,
    user_template: &str,
) -> Result<String, String> {
    let payload = serde_json::to_string_pretty(context)
        .map_err(|error| format!("Failed to serialize Context Bundle: {error}"))?;
    Ok(user_template
        .replace("{display_mode}", display_mode)
        .replace("{prompt_version}", prompt_version)
        .replace("{payload}", &payload))
}

#[cfg(test)]
fn default_system_prompt() -> &'static str {
    persistence_service::DEFAULT_SYSTEM_PROMPT_TEMPLATE
}

fn normalize_endpoint(value: &str) -> Result<String, AppError> {
    let value = value.trim();
    let url = Url::parse(value).map_err(|_| AppError::configuration("模型端点不是有效 URL。"))?;
    let host = url
        .host_str()
        .ok_or_else(|| AppError::configuration("模型端点缺少主机名。"))?;
    let local = is_local_host(host);
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err(AppError::configuration(
            "远程模型端点必须使用 HTTPS；HTTP 仅允许 localhost。",
        ));
    }
    if url.cannot_be_a_base() {
        return Err(AppError::configuration("模型端点格式无效。"));
    }
    Ok(url.to_string())
}

fn endpoint_allows_keyless(endpoint: &str) -> Result<bool, AppError> {
    let url =
        Url::parse(endpoint).map_err(|_| AppError::configuration("模型端点不是有效 URL。"))?;
    Ok(url.host_str().map(is_local_host).unwrap_or(false))
}

fn is_local_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

fn normalize_display_mode(value: Option<&str>) -> Result<String, AppError> {
    match value.unwrap_or("plain") {
        "plain" => Ok("plain".to_string()),
        "detailed" => Ok("detailed".to_string()),
        _ => Err(AppError::configuration(
            "展示模式必须是 plain 或 detailed。",
        )),
    }
}

trait CredentialStore {
    fn set_password(&self, value: &str) -> Result<(), KeyringError>;
    fn get_password(&self) -> Result<String, KeyringError>;
    fn delete_credential(&self) -> Result<(), KeyringError>;
}

struct SystemCredentialStore;

impl CredentialStore for SystemCredentialStore {
    fn set_password(&self, value: &str) -> Result<(), KeyringError> {
        credential_entry()?.set_password(value)
    }

    fn get_password(&self) -> Result<String, KeyringError> {
        credential_entry()?.get_password()
    }

    fn delete_credential(&self) -> Result<(), KeyringError> {
        credential_entry()?.delete_credential()
    }
}

fn credential_entry() -> Result<Entry, KeyringError> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
}

fn read_api_key() -> Result<Option<String>, AppError> {
    read_api_key_from_store(&SystemCredentialStore)
}

fn read_api_key_from_store(store: &impl CredentialStore) -> Result<Option<String>, AppError> {
    match store.get_password() {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(keyring_error(error)),
    }
}

fn keyring_error(error: KeyringError) -> AppError {
    AppError::credential_unavailable(format!("系统凭据库操作失败：{error}"))
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
    fn prompt_embeds_exact_context_bundle_and_excludes_omitted_source() {
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
        let prompt = build_user_prompt(
            &context,
            "plain",
            "test-prompt-v1",
            persistence_service::DEFAULT_USER_PROMPT_TEMPLATE
        )
        .expect("prompt should build");
        let embedded_bundle = prompt
            .split_once("Context Bundle:\n")
            .map(|(_, payload)| payload)
            .expect("prompt should contain the Context Bundle marker");
        let embedded_value: serde_json::Value =
            serde_json::from_str(embedded_bundle).expect("embedded bundle should be valid JSON");
        let expected_value =
            serde_json::to_value(&context).expect("context should serialize to JSON");

        assert_eq!(embedded_value, expected_value);
        assert!(prompt.contains("const selected = request.value;"));
        assert!(!prompt.contains("secretOutsideBudget"));
        assert!(!embedded_bundle.contains("const line1 = 1;"));
    }

    #[test]
    fn build_user_prompt_uses_custom_template_and_substitutes_placeholders() {
        let context = build_context_bundle(BuildContextRequest {
            file: ContextFileInput {
                path: "src/example.ts".to_string(),
                language: "typescript".to_string(),
                code: "const value = 1;".to_string(),
                code_nodes: Vec::new(),
            },
            target: ContextTargetInput {
                target_type: "line".to_string(),
                target_name: None,
                start_line: Some(1),
                end_line: Some(1),
                symbol_id: None,
            },
            budget: Some(ContextBudgetInput {
                max_chars: Some(800),
                max_snippets: Some(4),
            }),
        })
        .expect("context should build");
        let custom_template =
            "CUSTOM MARKER display={display_mode} ver={prompt_version} bundle={payload}";
        let prompt = build_user_prompt(&context, "detailed", "v9-custom", custom_template)
            .expect("prompt should build");
        assert!(prompt.contains("CUSTOM MARKER"));
        assert!(prompt.contains("display=detailed"));
        assert!(prompt.contains("ver=v9-custom"));
        assert!(prompt.starts_with("CUSTOM MARKER"));
        // The default template text must NOT appear when a custom template is used.
        assert!(!prompt.contains("请根据下列经过授权的"));
    }

    #[test]
    fn endpoint_requires_https_except_for_local_models() {
        assert!(normalize_endpoint("https://api.example.com/v1/chat/completions").is_ok());
        assert!(normalize_endpoint("http://127.0.0.1:11434/v1/chat/completions").is_ok());
        assert!(normalize_endpoint("http://api.example.com/v1/chat/completions").is_err());
    }

    #[test]
    fn credential_store_no_entry_is_treated_as_missing_key() {
        let store = FakeCredentialStore {
            get_result: Err(KeyringError::NoEntry),
        };

        let key = read_api_key_from_store(&store).expect("no entry should not fail");

        assert!(key.is_none());
    }

    #[test]
    fn credential_store_access_failure_has_stable_error_code() {
        let store = FakeCredentialStore {
            get_result: Err(KeyringError::NoStorageAccess(Box::new(FakeCredentialError))),
        };

        let error = read_api_key_from_store(&store).expect_err("credential store should fail");

        assert!(error.to_string().contains("credential.unavailable"));
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
                default_system_prompt(),
            )
            .await
            .expect("second provider output should pass");

            assert_eq!(attempts, 2);
            assert_eq!(explanation.trust_label, "context_needed");
            server.join().expect("mock provider thread joins");
        });
    }

    struct FakeCredentialStore {
        get_result: Result<String, KeyringError>,
    }

    impl CredentialStore for FakeCredentialStore {
        fn set_password(&self, _value: &str) -> Result<(), KeyringError> {
            Ok(())
        }

        fn get_password(&self) -> Result<String, KeyringError> {
            match &self.get_result {
                Ok(value) => Ok(value.clone()),
                Err(KeyringError::NoEntry) => Err(KeyringError::NoEntry),
                Err(KeyringError::NoStorageAccess(_)) => {
                    Err(KeyringError::NoStorageAccess(Box::new(FakeCredentialError)))
                }
                Err(other) => panic!("unexpected fake credential error: {other}"),
            }
        }

        fn delete_credential(&self) -> Result<(), KeyringError> {
            Ok(())
        }
    }

    #[derive(Debug)]
    struct FakeCredentialError;

    impl std::fmt::Display for FakeCredentialError {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("credential store locked")
        }
    }

    impl std::error::Error for FakeCredentialError {}

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

    /// A mock LLM provider that records the messages it receives and returns a
    /// fixed valid structured response. Used to assert that custom prompt
    /// templates actually reach the provider's request messages.
    struct RecordingProvider {
        captured: std::sync::Mutex<Vec<ProviderMessage>>,
    }

    impl RecordingProvider {
        fn new() -> Self {
            Self {
                captured: std::sync::Mutex::new(Vec::new()),
            }
        }

        fn messages(&self) -> Vec<ProviderMessage> {
            // ProviderMessage is Clone, so we can return owned copies.
            self.captured
                .lock()
                .expect("capture lock")
                .clone()
        }
    }

    impl LlmProvider for RecordingProvider {
        fn complete<'a>(
            &'a self,
            request: CompletionRequest<'a>,
        ) -> crate::llm_provider::ProviderFuture<'a> {
            let mut captured = self.captured.lock().expect("capture lock");
            captured.extend(request.messages.iter().cloned());
            drop(captured);
            let body = valid_response_json();
            Box::pin(async move { Ok(body) })
        }
    }

    #[test]
    fn custom_prompt_templates_reach_provider_messages() {
        use crate::context_builder::{BuildContextRequest, ContextFileInput, ContextTargetInput};
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("test runtime builds");
        runtime.block_on(async {
            let context = build_context_bundle(BuildContextRequest {
                file: ContextFileInput {
                    path: "src/example.ts".to_string(),
                    language: "typescript".to_string(),
                    code: "const value = 1;".to_string(),
                    code_nodes: Vec::new(),
                },
                target: ContextTargetInput {
                    target_type: "line".to_string(),
                    target_name: None,
                    start_line: Some(1),
                    end_line: Some(1),
                    symbol_id: None,
                },
                budget: Some(ContextBudgetInput {
                    max_chars: Some(800),
                    max_snippets: Some(4),
                }),
            })
            .expect("context should build");
            let system_template = "CUSTOM SYSTEM MARKER for canary";
            let user_template =
                "CUSTOM USER MARKER ver={prompt_version} mode={display_mode} bundle={payload}";
            let prompt = build_user_prompt(&context, "plain", "v9-canary", user_template)
                .expect("prompt should build");
            let provider = RecordingProvider::new();
            let validation = ExplanationValidationContext {
                target_start: 1,
                target_end: 1,
                file_line_count: 10,
                expected_display_mode: "plain",
            };
            let config = StoredModelConfig {
                endpoint: "http://unused/v1/chat/completions".to_string(),
                model: "fixture-model".to_string(),
                timeout_seconds: 10,
                updated_at: "test".to_string(),
            };
            request_structured_explanation_with_provider(
                &provider,
                &config,
                None,
                prompt,
                &validation,
                system_template,
            )
            .await
            .expect("provider call should succeed");

            let messages = provider.messages();
            assert_eq!(messages.len(), 2, "should send system + user messages");
            assert_eq!(messages[0].role(), "system");
            assert!(
                messages[0].content().contains("CUSTOM SYSTEM MARKER"),
                "system message should use the custom template: {}",
                messages[0].content()
            );
            assert_eq!(messages[1].role(), "user");
            let user_content = messages[1].content();
            assert!(
                user_content.contains("CUSTOM USER MARKER"),
                "user message should use the custom template"
            );
            assert!(
                user_content.contains("ver=v9-canary"),
                "user message should substitute {{prompt_version}}"
            );
            assert!(
                user_content.contains("mode=plain"),
                "user message should substitute {{display_mode}}"
            );
            assert!(
                user_content.contains("bundle="),
                "user message should substitute {{payload}}"
            );
            // The default prompt text must NOT appear when custom templates are used.
            assert!(!user_content.contains("请根据下列经过授权的"));
        });
    }
}
