import { describe, expect, it } from "vitest";
import { errorMessage } from "./appError";

describe("errorMessage", () => {
  it("reads native and serialized application errors", () => {
    expect(errorMessage(new Error("native failure"))).toBe("native failure");
    expect(errorMessage({ code: "llm.timeout", message: "模型请求超时" })).toBe(
      "模型请求超时"
    );
  });

  it("falls back to a string representation", () => {
    expect(errorMessage("plain failure")).toBe("plain failure");
  });
});
