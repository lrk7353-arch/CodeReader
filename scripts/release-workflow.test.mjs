import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quality = readFileSync(".github/workflows/quality.yml", "utf8");
const release = readFileSync(".github/workflows/release.yml", "utf8");
const security = readFileSync(".github/workflows/security.yml", "utf8");
const tauri = readFileSync("src-tauri/tauri.conf.json", "utf8");

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
    expect(release).toContain("actions/attest@a1948c3f048ba23858d222213b7c278aabede763");
    expect(release).toContain("sbom-path: release-assets/CodeReader.spdx.json");
    expect(release).toContain("release-evidence.mjs verify-sbom");
  });

  it("requires target-bound package smoke evidence before release approval", () => {
    expect(release).toContain("windows-package-smoke.ps1");
    expect(release).toContain("linux-package-smoke.mjs");
    expect(release).toContain("verify-native-smoke:");
    expect(release).toContain("release-evidence.mjs verify");
    expect(release).toContain("subject-path: release-assets/native-smoke-*.json");
    expect(release.indexOf("verify-native-smoke:")).toBeLessThan(
      release.indexOf("environment: production-release")
    );
    expect(release).toContain("needs: verify-native-smoke");
    expect(release).toContain("windows-package-smoke.ps1 -SelfTest");
    expect(quality).toContain("Test Windows installer-path normalization");
    expect(tauri).toContain('"libwebkit2gtk-4.1-0"');
    expect(tauri).toContain('"webkit2gtk4.1"');
  });

  it("uses immutable tag checkouts, locked dependencies, and least privilege", () => {
    expect(release).toContain("ref: refs/tags/${{ env.RELEASE_TAG }}");
    expect(release).toContain("cargo metadata --locked");
    expect(release).toContain("-- --locked");
    expect(release).toContain("permissions:\n  contents: read");
    expect(release).toContain("assemble:\n    needs: verify-native-smoke");
    expect(release).toContain("contents: write");
    expect(release).toContain("id-token: write");
    expect(release).toContain("attestations: write");
  });

  it("runs code, dependency, and secret security checks", () => {
    expect(security).toContain(
      "github/codeql-action/init@99df26d4f13ea111d4ec1a7dddef6063f76b97e9"
    );
    expect(security).toContain("npm audit --omit=dev");
    expect(security).toContain("rustsec/audit-check@69366f33c96575abad1ee0dba8212993eecbe998");
    expect(security).toContain("gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c7");
    expect(security).toContain(
      "actions/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48"
    );
  });

  it("pins every action to an immutable full commit SHA", () => {
    const workflows = `${quality}\n${release}\n${security}`;
    const actionRefs = [...workflows.matchAll(/^\s*-?\s*uses:\s+[^@\s]+@([^\s#]+)/gm)].map(
      (match) => match[1]
    );
    expect(actionRefs.length).toBeGreaterThan(0);
    for (const ref of actionRefs) {
      expect(ref).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(workflows).toContain("# v5");
    expect(workflows).toContain("# stable");
  });
});
