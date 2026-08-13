import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildJourneyFromPhases } from "./native-journey-linux.mjs";

const NAMES = [
  "native-picker-open-project",
  "explanation-generation",
  "restart-reauthorize-restore",
  "legacy-0.10-upgrade",
  "legacy-0.11-upgrade",
  "uninstall-data-policy",
  "keyboard-focus-roundtrip",
  "reduced-motion",
  "long-content",
  "zoom-200-contrast"
];
const phases = Object.fromEntries(NAMES.map((name) => [name, { status: "pass", probe: name }]));
const nativeArch = process.arch === "arm64" ? "arm64" : "x64";
const nonNativeArch = nativeArch === "arm64" ? "x64" : "arm64";
const nativeWorkflow = readFileSync(".github/workflows/native-journey.yml", "utf8");

function workflowJob(workflow, name) {
  const marker = `\n  ${name}:\n`;
  const start = workflow.indexOf(marker);
  if (start < 0) return "";
  const remainder = workflow.slice(start + marker.length);
  const end = remainder.search(/\n {2}[a-zA-Z0-9_-]+:\n/);
  return remainder.slice(0, end < 0 ? undefined : end);
}

function hasProtectedCandidateHandoff(workflow) {
  const prepare = workflowJob(workflow, "prepare-candidate");
  const journey = workflowJob(workflow, "journey");
  const attach = workflowJob(workflow, "attest-and-attach");
  const finalAttach = attach.slice(attach.indexOf("- name: Attach evidence to the matching draft"));
  const jobNames = [...workflow.matchAll(/^ {2}([a-zA-Z0-9_-]+):$/gm)].map((match) => match[1]);
  const writeJobs = jobNames.filter((name) =>
    workflowJob(workflow, name).includes("contents: write")
  );
  const dualCheckout = (job) =>
    job.includes("ref: ${{ github.sha }}") &&
    job.includes("ref: refs/tags/${{ env.RELEASE_TAG }}") &&
    job.includes("path: candidate-source");
  return (
    dualCheckout(prepare) &&
    dualCheckout(journey) &&
    dualCheckout(attach) &&
    !workflow.includes("git tag") &&
    !workflow.includes("git push --force") &&
    prepare.includes("environment: production-release") &&
    prepare.includes("contents: write") &&
    prepare.includes("git -C candidate-source describe --tags --exact-match HEAD") &&
    prepare.includes('gh release view "$RELEASE_TAG"') &&
    prepare.includes("--json tagName") &&
    prepare.includes("--json isDraft") &&
    prepare.includes("-name 'CodeReader_*' | wc -l)\" = 10") &&
    prepare.includes("-name 'native-smoke-*.json' | wc -l)\" = 4") &&
    prepare.includes('-name SHA256SUMS | wc -l)" = 1') &&
    prepare.includes("sha256sum -c SHA256SUMS") &&
    prepare.includes("release-evidence.mjs verify") &&
    prepare.includes("native-candidate-snapshot.mjs create") &&
    prepare.includes("name: verified-candidate-release-assets") &&
    journey.includes("needs: prepare-candidate") &&
    journey.includes("name: verified-candidate-release-assets") &&
    journey.includes("release-evidence.mjs verify") &&
    journey.includes("git -C candidate-source rev-parse HEAD") &&
    journey.includes('$ErrorActionPreference = "Stop"') &&
    journey.includes('if ($LASTEXITCODE -ne 0) { throw "Chocolatey failed') &&
    journey.includes("Get-Command sqlite3 -ErrorAction Stop") &&
    journey.includes("& $sqlite.Source --version") &&
    journey.includes("cd candidate-source") &&
    journey.includes("node scripts/native-journey-linux.mjs") &&
    journey.includes('Push-Location "$workspace/candidate-source"') &&
    journey.includes("./scripts/native-journey-windows.ps1") &&
    journey.includes('$output = "$workspace/native-journey-') &&
    journey.includes("node scripts/native-journey-fixture.mjs") &&
    !journey.includes("candidate-source/scripts/native-journey-fixture.mjs") &&
    journey.includes("src-tauri/tests/fixtures/persistence/historical-schema-manifest.json") &&
    !journey.includes(
      "candidate-source/src-tauri/tests/fixtures/persistence/historical-schema-manifest.json"
    ) &&
    journey.includes("--data candidate-source/src-tauri/tests/fixtures/persistence/v0_10.sql") &&
    journey.includes(
      "--data candidate-source/src-tauri/tests/fixtures/persistence/v0_11_early.sql"
    ) &&
    journey.includes(
      "--data candidate-source/src-tauri/tests/fixtures/persistence/v0_11_current.sql"
    ) &&
    journey.includes("--base journey-fixtures/v2-schema.sql") &&
    journey.includes("--migrations migrate_to_v3") &&
    journey.includes("native-smoke-${{ matrix.platform }}-${{ matrix.arch }}.json") &&
    journey.includes('SHA256SUMS)" = "$package_hash"') &&
    journey.includes('test -n "$package"') &&
    journey.includes('cp "$package" journey-package/') &&
    journey.includes("./journey-package/*.deb") &&
    journey.includes("journey-package/*.msi") &&
    !journey.includes("gh release download") &&
    !journey.includes("gh release view") &&
    !journey.includes("contents: write") &&
    JSON.stringify(writeJobs) === JSON.stringify(["prepare-candidate", "attest-and-attach"]) &&
    attach.includes("needs: journey") &&
    attach.includes("environment: production-release") &&
    attach.includes("contents: write") &&
    attach.includes("name: verified-candidate-release-assets") &&
    attach.includes("release-evidence.mjs verify --input release-binding") &&
    attach.includes("native-candidate-snapshot.mjs verify") &&
    attach.includes("git -C candidate-source rev-parse HEAD") &&
    attach.includes("prepared-candidate/candidate-manifest.json") &&
    attach.includes(
      'test "$(gh release view "$RELEASE_TAG" --json isDraft --jq .isDraft)" = true'
    ) &&
    finalAttach.includes("final-release-binding") &&
    finalAttach.includes("release-evidence.mjs verify") &&
    finalAttach.includes("native-candidate-snapshot.mjs verify") &&
    finalAttach.includes(
      "--input final-release-binding --manifest prepared-candidate/candidate-manifest.json \\"
    ) &&
    finalAttach.includes("release-evidence.mjs verify-journeys") &&
    finalAttach.indexOf("gh release download") <
      finalAttach.indexOf("release-evidence.mjs verify") &&
    finalAttach.indexOf("release-evidence.mjs verify") <
      finalAttach.indexOf("native-candidate-snapshot.mjs verify") &&
    finalAttach.indexOf("native-candidate-snapshot.mjs verify") <
      finalAttach.indexOf("release-evidence.mjs verify-journeys") &&
    finalAttach.indexOf("release-evidence.mjs verify-journeys") <
      finalAttach.indexOf("gh release upload")
  );
}

describe("Linux native journey evidence", () => {
  it("binds an all-pass record to the native target without portable-path leaks", () => {
    const evidence = buildJourneyFromPhases({
      tag: "v1.0.0-rc.3",
      sha: "a".repeat(40),
      arch: nativeArch,
      phases,
      observedAt: "2026-08-12T00:00:00.000Z"
    });
    expect(evidence.status).toBe("pass");
    expect(evidence.arch).toBe(nativeArch);
    expect(evidence.windowsAuthenticodeSigned).toBeNull();
    expect(evidence.checks).toHaveLength(10);
    expect(JSON.stringify(evidence)).not.toContain("/home/");
  });

  it("refuses evidence for a non-native architecture", () => {
    expect(() =>
      buildJourneyFromPhases({
        tag: "v1.0.0-rc.3",
        sha: "b".repeat(40),
        arch: nonNativeArch,
        phases
      })
    ).toThrow(/native runner/);
  });

  it("refuses a globally fabricated pass when one independent probe is absent", () => {
    const incomplete = structuredClone(phases);
    delete incomplete["zoom-200-contrast"];
    expect(() =>
      buildJourneyFromPhases({
        tag: "v1.0.0-rc.3",
        sha: "a".repeat(40),
        arch: nativeArch,
        phases: incomplete
      })
    ).toThrow(/independent passing probe/);
  });

  it("keeps native probes, migration recovery, reinstall restore and asset binding mandatory", () => {
    const runner = readFileSync("scripts/native-journey-linux.mjs", "utf8");
    const session = readFileSync("scripts/native-journey-linux-session.sh", "utf8");
    const ui = readFileSync("scripts/native-journey-ui-linux.py", "utf8");
    const workflow = nativeWorkflow;
    expect(session).not.toContain("passed = {name:");
    expect(session).toContain("PRAGMA integrity_check");
    expect(session).toContain("failure_hash");
    expect(session).toContain("recovery_backup");
    expect(session).toContain('python3 "$driver" --verify-restore "$wrong_project" "$project"');
    expect(session).toContain("SELECT root_path FROM projects");
    expect(ui).toContain('require_all_states(code_tab, "focused", "selected")');
    expect(ui).toContain('require_all_states(why_tab, "focused", "selected")');
    expect(ui).toContain("frames = [grab_target(target).tobytes()]");
    expect(ui.indexOf('key("Right")')).toBeLessThan(
      ui.indexOf("frames = [grab_target(target).tobytes()]")
    );
    expect(ui).toContain("require_visible_inside");
    expect(ui).toContain("audit_contrast");
    expect(ui).toContain("require_triggered_pixel_stability(code_tab, why_tab)");
    expect(ui).toContain("require_focus_ring");
    expect(ui).toContain('key("<Control>End")');
    expect(workflow).toContain('test "$(find journey-assets');
    expect(workflow).toContain("sha256sum -c SHA256SUMS");
    expect(workflow).toContain("native-smoke-*.json");
    expect(workflow).toContain("f7e7b454e4b17c0380d2efec962ef103863e9c83");
    expect(workflow).toContain("v0_11_current.sql");
    expect(workflow).toContain("Fixture011Current");
    expect(workflow).toContain("choco install sqlite");
    expect(workflow).toContain("git hash-object journey-fixtures/schema-v1.rs");
    expect(workflow).toContain("extracted-schema-SHA256SUMS");
    expect(workflow).toContain("historical-schema-manifest.json");
    expect(workflow.indexOf("release-evidence.mjs verify --input release-binding")).toBeLessThan(
      workflow.indexOf("gh release upload")
    );
    expect(workflow).not.toContain("sed -n '/fn migrate_to_v1");
    expect(runner).not.toContain("function run(command");
    expect(runner).not.toMatch(/spawnSync\(\s*(?!["'])[A-Za-z_$]/);
    const spawnCommands = [...runner.matchAll(/spawnSync\(\s*(["'][^"']+["'])/g)].map(
      (match) => match[1]
    );
    expect(spawnCommands).toEqual(['"sqlite3"', '"dbus-run-session"', '"gsettings"', '"bash"']);
    expect(runner).not.toContain("shell: true");
    expect(runner).toContain('"dbus-run-session"');
    expect(runner).toContain("subprocess.run(");
    expect(runner).toContain('["python3", driver, "--verify-restore", wrong_project, project]');
  });

  it("hands a verified draft to read-only journey jobs through an immutable artifact", () => {
    expect(hasProtectedCandidateHandoff(nativeWorkflow)).toBe(true);
    for (const required of [
      "environment: production-release",
      "contents: write",
      "ref: ${{ github.sha }}",
      "ref: refs/tags/${{ env.RELEASE_TAG }}",
      "path: candidate-source",
      "git -C candidate-source describe --tags --exact-match HEAD",
      "--json tagName",
      "--json isDraft",
      "-name 'CodeReader_*' | wc -l)\" = 10",
      "-name 'native-smoke-*.json' | wc -l)\" = 4",
      '-name SHA256SUMS | wc -l)" = 1',
      "sha256sum -c SHA256SUMS",
      "needs: prepare-candidate",
      "name: verified-candidate-release-assets",
      "native-candidate-snapshot.mjs create",
      'if ($LASTEXITCODE -ne 0) { throw "Chocolatey failed',
      "Get-Command sqlite3 -ErrorAction Stop",
      "& $sqlite.Source --version",
      "cd candidate-source",
      "node scripts/native-journey-linux.mjs",
      'Push-Location "$workspace/candidate-source"',
      "./scripts/native-journey-windows.ps1",
      '$output = "$workspace/native-journey-',
      "node scripts/native-journey-fixture.mjs",
      "src-tauri/tests/fixtures/persistence/historical-schema-manifest.json",
      "--data candidate-source/src-tauri/tests/fixtures/persistence/v0_10.sql",
      "--data candidate-source/src-tauri/tests/fixtures/persistence/v0_11_early.sql",
      "--data candidate-source/src-tauri/tests/fixtures/persistence/v0_11_current.sql",
      "--base journey-fixtures/v2-schema.sql",
      "--migrations migrate_to_v3",
      "native-smoke-${{ matrix.platform }}-${{ matrix.arch }}.json",
      'SHA256SUMS)" = "$package_hash"',
      'test -n "$package"',
      "release-evidence.mjs verify --input release-binding",
      "--input final-release-binding --manifest prepared-candidate/candidate-manifest.json \\"
    ]) {
      expect(
        hasProtectedCandidateHandoff(nativeWorkflow.replaceAll(required, "removed")),
        `removing ${required} must break the protected handoff`
      ).toBe(false);
    }
  });
});
