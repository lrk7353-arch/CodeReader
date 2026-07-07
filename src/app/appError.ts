export interface AppErrorInfo {
  code?: string;
  message: string;
}

const FALLBACK_MESSAGE = "未知错误";
const MAX_DEPTH = 3;

export function parseAppError(error: unknown): AppErrorInfo {
  const extracted = extract(error, 0);
  return {
    code: extracted?.code,
    message: extracted?.message || FALLBACK_MESSAGE
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
