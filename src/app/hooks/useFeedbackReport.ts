import { useCallback, useState } from "react";
import packageJson from "../../../package.json";
import { errorAction, parseAppError, sanitizeErrorText, type ErrorAction } from "../appError";
import { isDesktopRuntime } from "../../services/desktopWorkspace";

export interface FeedbackReport {
  generatedAt: string;
  appVersion: string;
  platform: string;
  userAgent: string;
  desktopRuntime: boolean;
  providerType: string;
  providerEndpoint: string | null;
  providerModel: string | null;
  providerConfigured: boolean;
  lastWorkspaceError: {
    message: string;
    action: ErrorAction;
    detail: string;
  } | null;
  lastGenerationError: {
    explanationId: string;
    status: string;
    error: string;
    timestamp: string;
  } | null;
  recentWorkspaceStatus: string[];
  notes: string;
}

export interface UseFeedbackReportOptions {
  providerType: string;
  providerEndpoint: string | null;
  providerModel: string | null;
  providerConfigured: boolean;
  lastWorkspaceError: { message: string; action: ErrorAction; detail: string } | null;
  lastGenerationError: {
    explanationId: string;
    status: string;
    error: string;
    timestamp: string;
  } | null;
  recentWorkspaceStatus: string[];
}

function redactEndpoint(endpoint: string | null): string | null {
  if (!endpoint) {
    return null;
  }
  // Keep scheme + host, drop path/query that might carry sensitive routing.
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "<unparseable>";
  }
}

export function buildFeedbackReport(options: UseFeedbackReportOptions): FeedbackReport {
  const workspaceError = options.lastWorkspaceError
    ? redactErrorForReport(options.lastWorkspaceError)
    : null;
  const generationError = options.lastGenerationError
    ? {
        explanationId: sanitizeIdentifier(options.lastGenerationError.explanationId),
        status: sanitizeIdentifier(options.lastGenerationError.status),
        error:
          options.lastGenerationError.status === "error"
            ? "generation failed (details redacted)"
            : "",
        timestamp: sanitizeTimestamp(options.lastGenerationError.timestamp)
      }
    : null;
  return {
    generatedAt: new Date().toISOString(),
    appVersion: packageJson.version,
    platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    desktopRuntime: isDesktopRuntime(),
    providerType: sanitizeIdentifier(options.providerType),
    providerEndpoint: redactEndpoint(options.providerEndpoint),
    providerModel: options.providerModel ? sanitizeErrorText(options.providerModel) : null,
    providerConfigured: options.providerConfigured,
    lastWorkspaceError: workspaceError,
    lastGenerationError: generationError,
    // Status text may contain a user path, source excerpt or provider response.
    // It is deliberately excluded until statuses are stable codes end-to-end.
    recentWorkspaceStatus: [],
    notes:
      "This report is redacted: no API key, no source code, no full prompt, no full model response. Only stable error codes and redacted endpoint host are included."
  };
}

export function useFeedbackReport(options: UseFeedbackReportOptions) {
  const [lastReport, setLastReport] = useState<FeedbackReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const generate = useCallback(() => {
    setBusy(true);
    try {
      const report = buildFeedbackReport(options);
      setLastReport(report);
      return report;
    } finally {
      setBusy(false);
    }
  }, [options]);

  const preparePreview = useCallback(() => {
    const report = generate();
    setPreviewOpen(true);
    return report;
  }, [generate]);

  const closePreview = useCallback(() => setPreviewOpen(false), []);

  const copyPreparedReport = useCallback(async () => {
    if (!lastReport || !previewOpen) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
      setPreviewOpen(false);
      return true;
    } catch {
      return false;
    }
  }, [lastReport, previewOpen]);

  return {
    busy,
    lastReport,
    previewOpen,
    closePreview,
    copyPreparedReport,
    generate,
    preparePreview
  };
}

/**
 * Convert an unknown error into a redacted {message, action, detail} triple
 * for inclusion in a feedback report. Strict field whitelist: only the stable
 * code and message are kept; paths in messages are reduced to basename; no
 * raw object JSON is serialized to avoid leaking provider bodies, internal
 * responses, or absolute paths.
 */
export function redactErrorForReport(
  error: unknown
): { message: string; action: ErrorAction; detail: string } | null {
  if (!error) {
    return null;
  }
  const parsed = parseAppError(error);
  const message = "Error details redacted";
  let action = errorAction(error);
  if (error && typeof error === "object" && "action" in error) {
    const suppliedAction = (error as { action?: unknown }).action;
    if (
      suppliedAction === "retry" ||
      suppliedAction === "openModelSettings" ||
      suppliedAction === "checkNetwork" ||
      suppliedAction === "checkEncoding" ||
      suppliedAction === "none"
    ) {
      action = suppliedAction;
    }
  }
  // Extract a stable code if present, but never serialize the full object.
  const code = parsed.code ?? "";
  const detail = code ? `code: ${code}` : "<no stable code>";
  return { message, action, detail };
}

/** Only allow protocol identifiers, stable IDs and model labels. */
function sanitizeIdentifier(value: string): string {
  return /^[A-Za-z0-9._:-]{1,120}$/.test(value) ? value : "<redacted>";
}

function sanitizeTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "<invalid>" : parsed.toISOString();
}
