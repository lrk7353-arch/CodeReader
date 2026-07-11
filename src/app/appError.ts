export interface AppErrorInfo {
  code?: string;
  message: string;
}

const FALLBACK_MESSAGE = "未知错误";
const MAX_DEPTH = 3;
const MAX_SAFE_MESSAGE_LENGTH = 320;

export function parseAppError(error: unknown): AppErrorInfo {
  const extracted = extract(error, 0);
  return {
    code: extracted?.code,
    message:
      publicMessageForCode(extracted?.code) ??
      (extracted?.message ? sanitizeErrorText(extracted.message) : FALLBACK_MESSAGE)
  };
}

export function errorMessage(error: unknown): string {
  return parseAppError(error).message;
}

export type ErrorAction = "retry" | "openModelSettings" | "checkNetwork" | "checkEncoding" | "none";

/**
 * Maps a stable error code to a user-facing actionable suggestion so the UI
 * can offer the right next step instead of a generic "failed" message.
 */
export function errorAction(error: unknown): ErrorAction {
  const { code } = parseAppError(error);
  switch (code) {
    case "llm.timeout":
    case "llm.connection":
    case "llm.http":
    case "llm.empty_response":
      return "retry";
    case "llm.invalid_response":
      return "retry";
    case "credential.not_set":
    case "credential.unavailable":
    case "config.invalid":
      return "openModelSettings";
    case "fs.invalid_utf8":
      return "checkEncoding";
    case "fs.too_large":
    case "fs.unsupported":
    case "fs.not_a_file":
    case "fs.not_a_dir":
    case "fs.path_resolve_failed":
    case "fs.read_failed":
      return "none";
    case "db.error":
      return "retry";
    default:
      return "none";
  }
}

interface Extracted {
  code?: string;
  message?: string;
}

function extract(error: unknown, depth: number): Extracted | undefined {
  if (depth > MAX_DEPTH) {
    return undefined;
  }
  if (typeof error === "string") {
    return { message: error };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  if (!isRecord(error)) {
    return undefined;
  }

  const code = readOptionalString(error, "code");
  const message = readOptionalString(error, "message");
  if (message) {
    return { code, message };
  }
  if ("error" in error) {
    const nested = extract(error.error, depth + 1);
    if (nested) {
      return { code: code ?? nested.code, message: nested.message };
    }
  }
  if (code) {
    return { code };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const raw = record[key];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Error messages cross a trust boundary before reaching the UI or clipboard.
 * Keep the useful human-readable summary while removing common credentials,
 * absolute paths and provider payloads, and cap its size.
 */
export function sanitizeErrorText(value: string): string {
  const sanitized = redactAbsolutePaths(
    value
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/gi, "<secret>")
      .replace(
        /\b(?:api[_-]?key|authorization|bearer|token|secret|password)\b\s*[:=]\s*[^\s,;]+/gi,
        (match) => `${match.split(/[:=]/, 1)[0]}: <secret>`
      )
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) {
    return FALLBACK_MESSAGE;
  }
  return sanitized.length > MAX_SAFE_MESSAGE_LENGTH
    ? `${sanitized.slice(0, MAX_SAFE_MESSAGE_LENGTH)}…`
    : sanitized;
}

export function safeErrorDetail(error: unknown): string {
  const parsed = parseAppError(error);
  return parsed.code && /^[A-Za-z0-9._:-]{1,120}$/.test(parsed.code)
    ? `code: ${parsed.code}`
    : "code: unknown";
}

/**
 * Remove absolute paths without relying on a list of common home-directory
 * prefixes. Diagnostics may originate from arbitrary user-selected folders,
 * so `/workspace/alice`, Windows drive paths, UNC paths and device paths all
 * cross the same privacy boundary. URL paths are left for the endpoint
 * classifier and are not mistaken for local POSIX paths.
 */
function redactAbsolutePaths(value: string): string {
  const windowsRedacted = value
    .replace(/(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\(?:\?\\|\.\\)?)[^\s"'<>]*/g, "<path:redacted>")
    .replace(/~\/[^\s"'<>]*/g, "<path:redacted>");

  return windowsRedacted.replace(
    /\/[^\s"'<>/]+(?:\/[^\s"'<>/]*)*/g,
    (match: string, offset: number, input: string): string => {
      const tokenStart = Math.max(
        input.lastIndexOf(" ", offset - 1),
        input.lastIndexOf("\n", offset - 1),
        input.lastIndexOf("\t", offset - 1)
      );
      const tokenPrefix = input.slice(tokenStart + 1, offset);
      if (tokenPrefix.includes("://") || input[offset - 1] === "/") {
        return match;
      }
      return "<path:redacted>";
    }
  );
}

function publicMessageForCode(code?: string): string | undefined {
  switch (code) {
    case "llm.timeout":
      return "模型请求超时";
    case "llm.connection":
      return "无法连接模型服务";
    case "llm.http":
      return "模型服务返回错误";
    case "llm.invalid_response":
      return "模型响应格式无效";
    case "llm.empty_response":
      return "模型服务返回了空响应";
    default:
      return undefined;
  }
}
