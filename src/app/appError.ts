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
