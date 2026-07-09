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
 * for inclusion in a feedback report.
 */
export function redactErrorForReport(
  error: unknown
): { message: string; action: ErrorAction; detail: string } | null {
  if (!error) {
    return null;
  }
  const message = errorMessage(error);
  const action = errorAction(error);
  let detail: string;
  if (typeof error === "string") {
    detail = error;
  } else if (error instanceof Error) {
    detail = `${error.name}: ${error.message}`;
  } else if (error && typeof error === "object") {
    try {
      detail = JSON.stringify(error);
    } catch {
      detail = "<unserializable error>";
    }
  } else {
    detail = "<unknown error>";
  }
  return { message, action, detail };
}
