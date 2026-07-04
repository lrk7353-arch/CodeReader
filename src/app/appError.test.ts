import { describe, expect, it } from "vitest";
import { errorMessage, parseAppError } from "./appError";

describe("errorMessage", () => {
  it("reads native and serialized application errors", () => {
    expect(errorMessage(new Error("native failure"))).toBe("native failure");
    expect(errorMessage({ code: "llm.timeout", message: "模型请求超时" })).toBe("模型请求超时");
  });

  it("falls back to a string representation", () => {
    expect(errorMessage("plain failure")).toBe("plain failure");
  });

  it("returns a Chinese fallback for unknown values", () => {
    expect(errorMessage(42)).toBe("未知错误");
    expect(errorMessage(null)).toBe("未知错误");
    expect(errorMessage(undefined)).toBe("未知错误");
    expect(errorMessage({ status: 500 })).toBe("未知错误");
  });

  it("descends into nested error payloads", () => {
    expect(errorMessage({ error: { code: "fs.not_found", message: "文件不存在" } })).toBe(
      "文件不存在"
    );
  });
});

describe("parseAppError", () => {
  it("reads a native Error message", () => {
    expect(parseAppError(new Error("native failure"))).toEqual({ message: "native failure" });
  });

  it("reads a plain string", () => {
    expect(parseAppError("plain failure")).toEqual({ message: "plain failure" });
  });

  it("reads an object with only a message", () => {
    expect(parseAppError({ message: "模型请求超时" })).toEqual({ message: "模型请求超时" });
  });

  it("reads an object with code and message", () => {
    expect(parseAppError({ code: "llm.timeout", message: "模型请求超时" })).toEqual({
      code: "llm.timeout",
      message: "模型请求超时"
    });
  });

  it("keeps the top-level message over a nested error", () => {
    expect(parseAppError({ message: "top", error: { code: "x", message: "nested" } })).toEqual({
      message: "top"
    });
  });

  it("descends into a nested error object", () => {
    expect(parseAppError({ error: { code: "fs.not_found", message: "文件不存在" } })).toEqual({
      code: "fs.not_found",
      message: "文件不存在"
    });
  });

  it("descends into a nested error string", () => {
    expect(parseAppError({ error: "boom" })).toEqual({ message: "boom" });
  });

  it("descends through multiple nested errors", () => {
    expect(parseAppError({ error: { error: { message: "deep" } } })).toEqual({ message: "deep" });
  });

  it("preserves a code when the message is empty", () => {
    expect(parseAppError({ code: "E_EMPTY", message: "" })).toEqual({
      code: "E_EMPTY",
      message: "未知错误"
    });
  });

  it("returns only a code when no message is available", () => {
    expect(parseAppError({ code: "E_UNKNOWN" })).toEqual({
      code: "E_UNKNOWN",
      message: "未知错误"
    });
  });

  it("ignores non-string code and message fields", () => {
    expect(parseAppError({ code: 123, message: 456 })).toEqual({ message: "未知错误" });
    expect(parseAppError({ code: 123, message: "hi" })).toEqual({ message: "hi" });
  });

  it("falls back for a native Error with an empty message", () => {
    expect(parseAppError(new Error(""))).toEqual({ message: "未知错误" });
  });

  it("returns a Chinese fallback for unknown values", () => {
    expect(parseAppError(42)).toEqual({ message: "未知错误" });
    expect(parseAppError(null)).toEqual({ message: "未知错误" });
    expect(parseAppError(undefined)).toEqual({ message: "未知错误" });
    expect(parseAppError({ status: 500 })).toEqual({ message: "未知错误" });
    expect(parseAppError([1, 2, 3])).toEqual({ message: "未知错误" });
  });

  it("stops descending after the configured depth", () => {
    const tooDeep = {
      error: {
        error: {
          error: {
            error: { message: "never" }
          }
        }
      }
    };
    expect(parseAppError(tooDeep)).toEqual({ message: "未知错误" });
  });
});
