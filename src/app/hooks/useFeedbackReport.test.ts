// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildFeedbackReport, redactErrorForReport, useFeedbackReport } from "./useFeedbackReport";

describe("buildFeedbackReport", () => {
  it("reduces the provider endpoint to a coarse destination class", () => {
    const report = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: "https://api.example.com/v1/chat/completions?foo=bar",
      providerModel: "gpt-4o-mini",
      providerConfigured: true,
      lastWorkspaceError: null,
      lastGenerationError: null,
      recentWorkspaceStatus: ["ready"]
    });

    expect(report.providerEndpoint).toBe("remote-https");
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

    const localReport = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: "http://127.0.0.1:11434/v1",
      providerModel: null,
      providerConfigured: true,
      lastWorkspaceError: null,
      lastGenerationError: null,
      recentWorkspaceStatus: []
    });
    expect(localReport.providerEndpoint).toBe("local-loopback");
  });

  it("excludes free-form workspace status text", () => {
    const report = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: null,
      providerModel: null,
      providerConfigured: false,
      lastWorkspaceError: null,
      lastGenerationError: null,
      recentWorkspaceStatus: Array.from({ length: 25 }, (_, i) => `status-${i}`)
    });
    expect(report.recentWorkspaceStatus).toEqual([]);
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
    expect(report.lastGenerationError?.error).toBe("generation failed (details redacted)");
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

  it("removes privacy canaries from every free-form input", () => {
    const report = buildFeedbackReport({
      providerType: "openai-compatible",
      providerEndpoint: "https://api.example.com/v1?token=sk-endpoint-secret",
      providerModel: "/workspace/alice/private-model sk-model-field-secret",
      providerConfigured: true,
      lastWorkspaceError: {
        message: "C:\\Users\\alice\\private\\main.ts sk-workspace-secret",
        action: "retry",
        detail: "SOURCE_CANARY=proprietary source"
      },
      lastGenerationError: {
        explanationId: "exp-1",
        status: "error",
        error: "MODEL_RESPONSE_CANARY proprietary answer sk-model-secret",
        timestamp: "2026-07-07T00:00:00.000Z"
      },
      recentWorkspaceStatus: [
        "/home/alice/secret/project.ts",
        "SOURCE_CANARY=proprietary source",
        "MODEL_RESPONSE_CANARY proprietary answer"
      ]
    });
    const json = JSON.stringify(report);
    for (const canary of [
      "alice",
      "SOURCE_CANARY",
      "MODEL_RESPONSE_CANARY",
      "sk-workspace-secret",
      "sk-model-secret",
      "sk-model-field-secret",
      "proprietary"
    ]) {
      expect(json).not.toContain(canary);
    }
  });
});

describe("redactErrorForReport", () => {
  it("returns null for falsy input", () => {
    expect(redactErrorForReport(null)).toBeNull();
    expect(redactErrorForReport(undefined)).toBeNull();
    expect(redactErrorForReport("")).toBeNull();
  });

  it("extracts message, action, and stable code from a structured error", () => {
    const result = redactErrorForReport({ code: "llm.timeout", message: "timed out" });
    expect(result).not.toBeNull();
    expect(result?.action).toBe("retry");
    expect(result?.message).toBe("Error details redacted");
    expect(result?.detail).toBe("code: llm.timeout");
  });

  it("does not serialize the full error object into detail", () => {
    const result = redactErrorForReport({
      code: "llm.http",
      message: "failed",
      body: { secret: "sk-leaked", internal: "response" }
    });
    expect(result?.detail).not.toContain("secret");
    expect(result?.detail).not.toContain("sk-leaked");
    expect(result?.detail).not.toContain("internal");
    expect(result?.detail).toBe("code: llm.http");
  });

  it("redacts absolute paths in the message to basename only", () => {
    const result = redactErrorForReport({
      code: "fs.read_failed",
      message: "Failed to read file /home/user/secret-project/src/main.ts"
    });
    expect(result?.message).toBe("Error details redacted");
  });

  it("handles bare string errors with path redaction", () => {
    const result = redactErrorForReport("failed at C:\\Users\\admin\\project\\file.ts");
    expect(result?.message).toBe("Error details redacted");
    expect(result?.detail).toBe("<no stable code>");
  });
});

describe("useFeedbackReport preview approval", () => {
  it("does not write to the clipboard until a prepared preview is approved", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { result } = renderHook(() => useFeedbackReport(feedbackOptions()));

    await act(async () => {
      expect(await result.current.copyPreparedReport()).toBe(false);
    });
    expect(writeText).not.toHaveBeenCalled();

    act(() => {
      result.current.preparePreview();
    });
    expect(result.current.previewOpen).toBe(true);
    await act(async () => {
      expect(await result.current.copyPreparedReport()).toBe(true);
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(result.current.previewOpen).toBe(false);
  });
});

function feedbackOptions() {
  return {
    providerType: "openai-compatible",
    providerEndpoint: null,
    providerModel: null,
    providerConfigured: false,
    lastWorkspaceError: null,
    lastGenerationError: null,
    recentWorkspaceStatus: []
  };
}
