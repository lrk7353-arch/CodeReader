// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildFeedbackReport, redactErrorForReport } from "./useFeedbackReport";

describe("buildFeedbackReport", () => {
  it("redacts the provider endpoint to scheme + host", () => {
    const report = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: "https://api.example.com/v1/chat/completions?foo=bar",
      providerModel: "gpt-4o-mini",
      providerConfigured: true,
      lastWorkspaceError: null,
      lastGenerationError: null,
      recentWorkspaceStatus: ["ready"]
    });

    expect(report.providerEndpoint).toBe("https://api.example.com");
    expect(report.providerModel).toBe("gpt-4o-mini");
    expect(report.providerConfigured).toBe(true);
  });

  it("handles null endpoint and unparseable endpoint", () => {
    const nullReport = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: null,
      providerModel: null,
      providerConfigured: false,
      lastWorkspaceError: null,
      lastGenerationError: null,
      recentWorkspaceStatus: []
    });
    expect(nullReport.providerEndpoint).toBeNull();

    const badReport = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: "not a url",
      providerModel: null,
      providerConfigured: false,
      lastWorkspaceError: null,
      lastGenerationError: null,
      recentWorkspaceStatus: []
    });
    expect(badReport.providerEndpoint).toBe("<unparseable>");
  });

  it("caps recent workspace status to last 10", () => {
    const report = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: null,
      providerModel: null,
      providerConfigured: false,
      lastWorkspaceError: null,
      lastGenerationError: null,
      recentWorkspaceStatus: Array.from({ length: 25 }, (_, i) => `status-${i}`)
    });
    expect(report.recentWorkspaceStatus).toHaveLength(10);
    expect(report.recentWorkspaceStatus[0]).toBe("status-15");
    expect(report.recentWorkspaceStatus[9]).toBe("status-24");
  });

  it("includes last workspace and generation errors", () => {
    const report = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: null,
      providerModel: null,
      providerConfigured: false,
      lastWorkspaceError: { message: "failed", action: "retry", detail: "detail" },
      lastGenerationError: {
        explanationId: "exp:1",
        status: "error",
        error: "timeout",
        timestamp: "2026-07-07T00:00:00.000Z"
      },
      recentWorkspaceStatus: []
    });
    expect(report.lastWorkspaceError?.action).toBe("retry");
    expect(report.lastGenerationError?.error).toBe("timeout");
  });

  it("never includes API key or full source", () => {
    const report = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: "https://api.example.com/v1/chat/completions",
      providerModel: "gpt-4o-mini",
      providerConfigured: true,
      lastWorkspaceError: null,
      lastGenerationError: null,
      recentWorkspaceStatus: []
    });
    const json = JSON.stringify(report);
    expect(json).not.toContain("sk-");
    expect(json).not.toContain("apiKey");
    expect(json).not.toContain("API_KEY");
    expect(report.notes).toContain("redacted");
  });
});

describe("redactErrorForReport", () => {
  it("returns null for falsy input", () => {
    expect(redactErrorForReport(null)).toBeNull();
    expect(redactErrorForReport(undefined)).toBeNull();
    expect(redactErrorForReport("")).toBeNull();
  });

  it("extracts message, action, and detail from a structured error", () => {
    const result = redactErrorForReport({ code: "llm.timeout", message: "timed out" });
    expect(result).not.toBeNull();
    expect(result?.action).toBe("retry");
    expect(result?.message).toBe("timed out");
  });

  it("handles bare string errors", () => {
    const result = redactErrorForReport("something failed");
    expect(result?.message).toBe("something failed");
    expect(result?.detail).toBe("something failed");
  });
});
