import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/native-journey-windows.ps1", "utf8");
const windowsIt = process.platform === "win32" ? it : it.skip;

describe("Windows native product journey driver", () => {
  it("requires independent successful probes before strict evidence is emitted", () => {
    expect(script).toContain("function Complete-Check");
    expect(script).toContain("Assert-True $ProbeResult");
    expect(script).toContain("$Observed[$Name] = $true");
    expect(script).not.toMatch(/\$Observed\[['"][^'"]+['"]\]\s*=\s*\$true/);
    expect(script.indexOf("$missing =")).toBeLessThan(script.indexOf("status = 'pass'"));
    const evidenceWrite = script.slice(
      script.indexOf("$evidence = [ordered]@{"),
      script.indexOf("} catch {", script.indexOf("$evidence = [ordered]@{"))
    );
    expect(evidenceWrite).not.toContain("throw ");
  });

  it("consumes immutable SQLite fixtures and verifies preserved migration content", () => {
    expect(script).toContain("$Fixture010");
    expect(script).toContain("$Fixture011");
    expect(script).toContain("$Fixture011Current");
    expect(script).toContain("Copy-HistoricalDatabase");
    expect(script).not.toContain("src-tauri/src/persistence/schema.rs");
    expect(script).toContain("explanation_nodes WHERE id='exp:fixture'");
    expect(script).toContain("user_reading_states WHERE id='reading:fixture'");
    expect(script).toContain("model_provider_settings WHERE id='default'");
    expect(script).toContain("prompt_versions WHERE version='legacy-canary'");
    expect(script).toContain("$backup.FullName 'PRAGMA integrity_check;'");
    expect(script).toContain("Test-MigrationFailureRecovery");
    expect(script).toContain(
      "$missingRequiredPaths = @($requiredPaths | Where-Object { -not (Test-Path -LiteralPath $_) })"
    );
    expect(script).toContain("$missingRequiredPaths.Count -eq 0");
    expect(script).not.toContain(
      "Assert-True (($requiredPaths | Where-Object { -not (Test-Path -LiteralPath $_) }).Count"
    );
  });

  windowsIt(
    "counts zero, one and many missing required paths under strict PowerShell mode",
    () => {
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "scripts/native-journey-windows.ps1",
          "-RequiredPathSelfTest"
        ],
        { encoding: "utf8", timeout: 15000 }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const observations = result.stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
      expect(observations).toEqual([
        { expected: 0, actual: 0 },
        { expected: 1, actual: 1 },
        { expected: 2, actual: 2 }
      ]);
    },
    20000
  );

  windowsIt(
    "discovers exactly one CodeReader registry entry without assuming every object has DisplayName",
    () => {
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "scripts/native-journey-windows.ps1",
          "-RegistryDiscoverySelfTest"
        ],
        { encoding: "utf8", timeout: 15000 }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(
        result.stdout
          .trim()
          .split(/\r?\n/)
          .map((line) => JSON.parse(line))
      ).toEqual([
        { expected: "unique", actual: "unique" },
        { expected: "not-found", actual: "not-found" },
        { expected: "ambiguous", actual: "ambiguous" },
        { expected: "installed-cleaned", actual: "installed-cleaned" },
        { expected: "already-clean", actual: "already-clean" },
        { expected: "ambiguous-failed", actual: "ambiguous-failed" },
        { expected: "primary-preserved", actual: "primary-preserved" }
      ]);
    },
    20000
  );

  it("drives real OS UI, picker, model, restart and installer probes", () => {
    expect(script).toContain("UIAutomationClient");
    expect(script).toContain("Authorize-NativePicker");
    expect(script).toContain("Resume-WithNativePicker");
    expect(script).toContain("Reject-WrongResumeAuthorization");
    expect(script).toContain("所选项目与最近记录不匹配");
    expect(script).toContain("native-journey-model-stub.mjs");
    expect(script).toContain("CloseMainWindow");
    expect(script).toContain("msiexec.exe");
    expect(script).toContain("$_.PSObject.Properties['DisplayName']");
    expect(script).toContain("phase=installer-discovery category=not-found exit=1");
    expect(script).toContain("phase=installer-discovery category=ambiguous exit=1");
    expect(script).toContain("phase=installer-discovery category=invalid-entry exit=1");
    expect(script).toContain("phase=installer-discovery category=registry-error exit=1");
    expect(script).toContain("function Get-UninstallEntryForCleanup");
    expect(script).toContain("function Invoke-InstallerCleanup");
    expect(script).toContain("preserving primary phase failure");
    expect(script).not.toContain("Get-ItemProperty 'HKCU:");
    expect(script).not.toContain("Where-Object DisplayName");
    expect(script).toContain("SystemParametersInfo");
    expect(script).toContain("controlled-project");
    expect(script).not.toContain("GetFullPath($Project)");
  });

  it("observes long content, focus, five-step 200% zoom and rendered contrast", () => {
    expect(script).toContain("NATIVE_JOURNEY_LONG_CONTENT_START");
    expect(script).toContain("NATIVE_JOURNEY_LONG_CONTENT_END");
    expect(script).toContain("HasKeyboardFocus");
    expect(script).toContain("function Assert-FocusedAndSelected");
    expect(script).toContain("HasKeyboardFocus -and $selection.Current.IsSelected");
    expect(script).not.toContain("IsSelected -or");
    expect(script).toContain("$i -lt 5");
    expect(script).toContain("Measure-ComputedContrast");
    expect(script).toContain("getComputedStyle");
    expect(script).toContain("$contrast.ratio -ge 4.5");
    expect(script).toContain("Test-ReducedMotionApplication");
    expect(script).toContain("prefers-reduced-motion: reduce");
    expect(script).toContain("window.devicePixelRatio");
    expect(script).toContain("IsOffscreen");
  });

  it("proves reinstall recovery and exports strict unsigned evidence", () => {
    expect(script).toContain("reader_resume_state WHERE slot=''current''");
    expect(script).toContain("explanation_nodes WHERE status=''valid''");
    expect(script).toContain("recovered-from-backup.sqlite");
    expect(script).toContain("Recovered backup did not migrate after restart");
    expect(script).toContain("Recovered database failed integrity check after restart");
    expect(script).toContain("Recovered backup lost its reading state after restart");
    expect(script).toContain("Recovered backup lost its model settings after restart");
    expect(script).toContain("Recovered backup lost its prompt version after restart");
    expect(script).toContain("Recovery backup no longer preserves its original schema version");
    expect(script).toContain("Assert-PersistedProjectIdentity");
    expect(script).toContain("root_path='$escaped'");
    expect(script).toContain("Reinstall changed the canonical project identity");
    expect(script).toContain("windowsAuthenticodeSigned = $false");
    expect(script).toContain("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
    expect(script).not.toContain("artifactPath");
    expect(script).not.toContain("details =");
    expect(script).not.toContain("notes =");
  });
});
