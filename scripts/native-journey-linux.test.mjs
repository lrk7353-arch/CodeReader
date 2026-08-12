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
    const workflow = readFileSync(".github/workflows/native-journey.yml", "utf8");
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
});
