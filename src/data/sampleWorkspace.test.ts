import { describe, expect, it } from "vitest";
import { sampleFiles } from "./sampleWorkspace";

describe("sample workspace", () => {
  it("describes the login file as the bridge between entry and data files", () => {
    const loginFile = sampleFiles.find((file) => file.name === "login-controller.ts");
    const fileExplanation = loginFile?.explanations.find((item) => item.targetType === "file");
    const functionExplanation = loginFile?.explanations.find(
      (item) => item.targetType === "function"
    );

    expect(fileExplanation?.globalMeaning).toContain("app.ts");
    expect(fileExplanation?.globalMeaning).toContain("user-store.ts");
    expect(functionExplanation?.readerNotes?.[0]).toContain("loginUser");
  });
});
