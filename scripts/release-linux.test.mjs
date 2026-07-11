import { describe, expect, it } from "vitest";
import { parseLinuxReleaseArgs } from "./release-linux.mjs";

describe("parseLinuxReleaseArgs", () => {
  it("accepts each supported native architecture", () => {
    expect(parseLinuxReleaseArgs(["--arch", "x64", "--skip-checks"])).toEqual({
      arch: "x64",
      skipChecks: true
    });
    expect(parseLinuxReleaseArgs(["--arch", "arm64"])).toEqual({
      arch: "arm64",
      skipChecks: false
    });
  });

  it("rejects unsupported architectures", () => {
    expect(() => parseLinuxReleaseArgs(["--arch", "riscv64"])).toThrow(/x64 or arm64/);
  });
});
