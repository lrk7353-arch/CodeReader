import { describe, expect, it } from "vitest";
import {
  buildLinuxDevDoctorReport,
  DEBIAN_TAURI_PACKAGES,
  REQUIRED_COMMANDS,
  REQUIRED_PKG_CONFIG
} from "./linux-dev-doctor.mjs";

function executorWith({ missingCommands = [], missingPkgConfig = [] } = {}) {
  return (command, args) => {
    if (missingCommands.includes(command)) {
      return { status: 127, stdout: "", stderr: `${command}: not found` };
    }
    if (command === "pkg-config" && args[0] === "--exists") {
      const id = args[1];
      if (missingPkgConfig.includes(id)) {
        return { status: 1, stdout: "", stderr: `Package ${id} was not found` };
      }
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 0, stdout: `${command} 1.0.0\n`, stderr: "" };
  };
}

describe("linux-dev-doctor", () => {
  it("passes when all command and pkg-config checks are available", () => {
    const report = buildLinuxDevDoctorReport({
      platform: "linux",
      executor: executorWith()
    });

    expect(report.ok).toBe(true);
    expect(report.commandChecks).toHaveLength(REQUIRED_COMMANDS.length);
    expect(report.pkgConfigChecks).toHaveLength(REQUIRED_PKG_CONFIG.length);
    expect(report.missingAptPackages).toEqual([]);
  });

  it("reports missing Rust commands and Debian package hints for missing Tauri libs", () => {
    const report = buildLinuxDevDoctorReport({
      platform: "linux",
      executor: executorWith({
        missingCommands: ["rustc", "cargo", "pkg-config"],
        missingPkgConfig: ["webkit2gtk-4.1", "ayatana-appindicator3-0.1"]
      })
    });

    expect(report.ok).toBe(false);
    expect(report.missingCommands.map((check) => check.name)).toEqual([
      "rustc",
      "cargo",
      "pkg-config"
    ]);
    expect(report.missingAptPackages).toEqual([
      "pkg-config",
      "libwebkit2gtk-4.1-dev",
      "libxdo-dev",
      "libayatana-appindicator3-dev",
      "librsvg2-dev",
      "libssl-dev"
    ]);
  });

  it("keeps the documented Debian package baseline aligned with pkg-config checks", () => {
    const requiredAptPackages = REQUIRED_PKG_CONFIG.map((check) => check.apt);

    for (const aptPackage of requiredAptPackages) {
      expect(DEBIAN_TAURI_PACKAGES).toContain(aptPackage);
    }
  });
});
