import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quality = readFileSync(".github/workflows/quality.yml", "utf8");
const release = readFileSync(".github/workflows/release.yml", "utf8");
const publish = readFileSync(".github/workflows/publish.yml", "utf8");
const security = readFileSync(".github/workflows/security.yml", "utf8");
const tauri = readFileSync("src-tauri/tauri.conf.json", "utf8");

const releaseJobCommands = {
  validate: "run: npm run verify:linux",
  build: "node scripts/tauri.mjs build",
  "verify-native-smoke": "node scripts/release-evidence.mjs verify",
  assemble: "node scripts/release-assets.mjs assemble"
};

function extractWorkflowJob(workflow, jobName) {
  const marker = `\n  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  if (start < 0) return "";
  const bodyStart = start + marker.length;
  const remainder = workflow.slice(bodyStart);
  const nextJob = remainder.search(/\n {2}[a-zA-Z0-9_-]+:\n/);
  return remainder.slice(0, nextJob < 0 ? undefined : nextJob);
}

function extractCheckoutBlocks(job) {
  const lines = job.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^ {6}- uses: actions\/checkout@/.test(lines[index])) continue;
    let end = index + 1;
    while (end < lines.length && !/^ {6}- (?:uses:|name:|run:)/.test(lines[end])) end += 1;
    blocks.push(lines.slice(index, end).join("\n"));
  }
  return blocks;
}

function releaseWorkflowHasCompleteHistory(workflow) {
  const checkoutBlocks = [];
  for (const [jobName, command] of Object.entries(releaseJobCommands)) {
    const job = extractWorkflowJob(workflow, jobName);
    if (!job.includes(command)) return false;
    const jobCheckouts = extractCheckoutBlocks(job);
    if (jobCheckouts.length === 0) return false;
    checkoutBlocks.push(...jobCheckouts);
  }
  const checkoutCount = [...workflow.matchAll(/uses: actions\/checkout@/g)].length;
  return (
    checkoutBlocks.length === checkoutCount &&
    checkoutBlocks.every((block) => /\n\s+fetch-depth: 0(?:\n|$)/.test(block))
  );
}

function removeNthFullHistoryCheckout(workflow, targetIndex) {
  let index = 0;
  return workflow.replace(/^\s+fetch-depth: 0\r?\n/gm, (line) => {
    const shouldRemove = index === targetIndex;
    index += 1;
    return shouldRemove ? "" : line;
  });
}

function publishUsesCurrentMainVerifier(workflow) {
  return (
    !workflow.includes("ref: ${{ env.HARNESS_SHA }}") &&
    workflow.includes("ref: ${{ github.sha }}") &&
    workflow.includes("fetch-depth: 0") &&
    workflow.includes('test "$(git rev-parse HEAD)" = "${{ github.sha }}"') &&
    workflow.includes('git merge-base --is-ancestor "$HARNESS_SHA" HEAD') &&
    workflow.includes("node scripts/release-evidence.mjs verify-journeys") &&
    workflow.includes('--harness-sha "$HARNESS_SHA"')
  );
}

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

  it("checks out complete history wherever quality tests read pinned historical fixtures", () => {
    const checkoutCount = [...quality.matchAll(/uses: actions\/checkout@/g)].length;
    const fullHistoryCount = [...quality.matchAll(/fetch-depth: 0/g)].length;
    expect(checkoutCount).toBeGreaterThan(0);
    expect(fullHistoryCount).toBe(checkoutCount);
    expect(quality).toContain("run: npm test");
    expect(quality).toContain("run: npm run verify:linux");
  });

  it("checks out complete history for every release validation and packaging job", () => {
    expect(releaseWorkflowHasCompleteHistory(release)).toBe(true);
    const checkoutCount = [...release.matchAll(/uses: actions\/checkout@/g)].length;
    expect(checkoutCount).toBe(Object.keys(releaseJobCommands).length);
    for (let index = 0; index < checkoutCount; index += 1) {
      expect(releaseWorkflowHasCompleteHistory(removeNthFullHistoryCheckout(release, index))).toBe(
        false
      );
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

  it("cannot publish without target-bound native journeys and maintainer approval", () => {
    const runBlocks = [
      ...publish.matchAll(
        /\n\s+run:\s*(?:\||>)?\s*\n?([\s\S]*?)(?=\n\s+- (?:name:|uses:)|\n\s{0,6}[a-zA-Z-]+:|$)/g
      )
    ]
      .map((match) => match[0])
      .join("\n");
    expect(runBlocks).not.toContain("${{ inputs.tag }}");
    expect(publish).toContain("RELEASE_TAG: ${{ inputs.tag }}");
    expect(publish).toContain("HARNESS_SHA: ${{ inputs.harness_sha }}");
    expect(publish).toContain('[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(publish).toContain('[[ ! "$RELEASE_TAG" =~ ^v1\\.[0-9]+\\.[0-9]+(-rc\\.[0-9]+)?$ ]]');
    expect(publish).toContain("gh release download");
    expect(publish).toContain("git -C candidate-source describe --tags --exact-match HEAD");
    expect(publish).toContain("gh release view");
    expect(publish).toContain("--json isDraft");
    expect(publish).toContain("--pattern 'native-journey-*.json'");
    expect(publish).toContain("release-evidence.mjs verify-journeys");
    expect(publish).toContain('sha "${{ steps.target.outputs.sha }}"');
    expect(publish).toContain('--harness-sha "$HARNESS_SHA"');
    expect(publish).not.toContain("ref: ${{ env.HARNESS_SHA }}");
    expect(publish).toContain("ref: ${{ github.sha }}");
    expect(publish).toContain("fetch-depth: 0");
    expect(publish).toContain("ref: refs/tags/${{ env.RELEASE_TAG }}");
    expect(publish).toContain("path: candidate-source");
    expect(publish).toContain('test "$(git rev-parse HEAD)" = "${{ github.sha }}"');
    expect(publish).toContain('git merge-base --is-ancestor "$HARNESS_SHA" HEAD');
    expect(publish).toContain("git -C candidate-source describe --tags --exact-match HEAD");
    expect(publish).toContain("name: verified-native-journeys\n");
    expect(publish).not.toContain("name: verified-native-journeys-${{ inputs.tag }}");
    expect(publish).toContain("publish:\n    runs-on:");
    expect(publish).toContain("environment: production-release-publish");
    expect(publish).toContain('gh release edit "$RELEASE_TAG" --draft=false');
    expect(publish.indexOf("environment: production-release-publish")).toBeLessThan(
      publish.indexOf("gh release download")
    );
    expect(publish.indexOf("gh release download")).toBeLessThan(
      publish.indexOf("release-evidence.mjs verify-journeys")
    );
    expect(publish.indexOf("release-evidence.mjs verify-journeys")).toBeLessThan(
      publish.indexOf('gh release edit "$RELEASE_TAG" --draft=false')
    );
    expect(release).toContain("draft: true");
    expect(release).not.toContain("--draft=false");
    expect(publishUsesCurrentMainVerifier(publish)).toBe(true);
    for (const required of [
      "ref: ${{ github.sha }}",
      "fetch-depth: 0",
      'test "$(git rev-parse HEAD)" = "${{ github.sha }}"',
      'git merge-base --is-ancestor "$HARNESS_SHA" HEAD',
      "node scripts/release-evidence.mjs verify-journeys",
      '--harness-sha "$HARNESS_SHA"'
    ]) {
      expect(publishUsesCurrentMainVerifier(publish.replace(required, "removed"))).toBe(false);
    }
    expect(
      publishUsesCurrentMainVerifier(
        publish.replace("ref: ${{ github.sha }}", "ref: ${{ env.HARNESS_SHA }}")
      )
    ).toBe(false);
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
    const workflows = `${quality}\n${release}\n${publish}\n${security}`;
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
