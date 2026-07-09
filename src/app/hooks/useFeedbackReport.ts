import { useCallback, useState } from "react";
import { errorAction, errorMessage, type ErrorAction } from "../appError";
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
  return {
    generatedAt: new Date().toISOString(),
    appVersion: "0.11.0-beta.4",
    platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    desktopRuntime: isDesktopRuntime(),
    providerType: options.providerType,
    providerEndpoint: redactEndpoint(options.providerEndpoint),
    providerModel: options.providerModel,
    providerConfigured: options.providerConfigured,
    lastWorkspaceError: options.lastWorkspaceError,
    lastGenerationError: options.lastGenerationError,
    recentWorkspaceStatus: options.recentWorkspaceStatus.slice(-10),
    notes:
      "This report is redacted: no API key, no source code, no full prompt, no full model response. Only stable error codes and redacted endpoint host are included."
  };
}

export function useFeedbackReport(options: UseFeedbackReportOptions) {
  const [lastReport, setLastReport] = useState<FeedbackReport | null>(null);
  const [busy, setBusy] = useState(false);

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

  const copyReport = useCallback(async () => {
    const report = generate();
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, [generate]);

  return {
    busy,
    lastReport,
    copyReport,
    generate
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
  const message = redactPaths(errorMessage(error));
  const action = errorAction(error);
  // Extract a stable code if present, but never serialize the full object.
  let code = "";
  if (error && typeof error === "object" && "code" in error) {
    const raw = (error as { code?: unknown }).code;
    if (typeof raw === "string") {
      code = raw;
    }
  }
  const detail = code ? `code: ${code}` : "<no stable code>";
  return { message, action, detail };
}

/**
 * Redact absolute paths in a string to basename only. Matches common path
 * patterns: Unix (/home/..., /Users/..., /tmp/..., /var/..., /opt/...),
 * Windows (C:\...), and UNC (\\...\...). This prevents feedback reports from
 * leaking full filesystem paths.
 */
function redactPaths(text: string): string {
  return text.replace(
    /(?:[A-Za-z]:[\\/]|[\\/]{2}|~\/|\/(?:home|Users|tmp|var|opt|etc|root|mnt|srv|data)\/)[^\s"'<>]*/g,
    (match) => {
      const segments = match.split(/[\\/]/).filter(Boolean);
      const basename = segments[segments.length - 1] ?? match;
      return `<path:${basename}>`;
    }
  );
}
