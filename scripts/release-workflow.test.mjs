import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quality = readFileSync(".github/workflows/quality.yml", "utf8");
const release = readFileSync(".github/workflows/release.yml", "utf8");
const security = readFileSync(".github/workflows/security.yml", "utf8");

describe("production workflows", () => {
  it("compiles the supported native platform matrix", () => {
    for (const runner of ["ubuntu-22.04", "ubuntu-22.04-arm", "windows-2022", "windows-11-arm"]) {
      expect(`${quality}\n${release}`).toContain(runner);
    }
    for (const target of [
      "x86_64-unknown-linux-gnu",
      "aarch64-unknown-linux-gnu",
      "x86_64-pc-windows-msvc",
      "aarch64-pc-windows-msvc"
    ]) {
      expect(release).toContain(target);
    }
  });

  it("builds ten package formats and pauses before a draft release", () => {
    expect(release).toContain("bundles: nsis,msi");
    expect(release).toContain("bundles: appimage,deb,rpm");
    expect(release).toContain("environment: production-release");
    expect(release).toContain("draft: true");
    expect(release).toContain("actions/attest@v4");
    expect(release).toContain("sbom-path: release-assets/CodeReader.spdx.json");
  });

  it("runs code, dependency, and secret security checks", () => {
    expect(security).toContain("github/codeql-action/init@v4");
    expect(security).toContain("npm audit --omit=dev");
    expect(security).toContain("rustsec/audit-check@v2.0.0");
    expect(security).toContain("gitleaks/gitleaks-action@v2");
    expect(security).toContain("actions/dependency-review-action@v4");
  });

  it("uses current Node 24-based core action majors", () => {
    expect(`${quality}\n${release}\n${security}`).not.toContain("actions/checkout@v4");
    expect(`${quality}\n${release}\n${security}`).not.toContain("actions/setup-node@v4");
    expect(`${quality}\n${release}\n${security}`).toContain("actions/checkout@v5");
    expect(`${quality}\n${release}\n${security}`).toContain("actions/setup-node@v5");
  });
});
