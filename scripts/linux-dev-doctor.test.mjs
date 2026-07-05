import { describe, expect, it } from "vitest";
import {
  buildLinuxDevDoctorReport,
  DEBIAN_TAURI_PACKAGES,
  REQUIRED_COMMANDS,
  REQUIRED_PKG_CONFIG
} from "./linux-dev-doctor.mjs";

function executorWith({
  missingCommands = [],
  missingPkgConfig = [],
  nodeVersion = "v22.0.0"
} = {}) {
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
    if (command === "node") {
      return { status: 0, stdout: `${nodeVersion}\n`, stderr: "" };
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
    expect(report.recommendedAptInstallCommand).toBeNull();
    expect(report.baselineAptInstallCommand).toBe(
      `sudo apt-get install -y ${DEBIAN_TAURI_PACKAGES.join(" ")}`
    );
    const nodeCheck = report.commandChecks.find((check) => check.name === "node");
    expect(nodeCheck.ok).toBe(true);
    expect(nodeCheck.value).toBe("v22.0.0");
  });

  it("rejects Node.js 20.x and points the hint at Node.js 22.x", () => {
    const report = buildLinuxDevDoctorReport({
      platform: "linux",
      executor: executorWith({ nodeVersion: "v20.11.0" })
    });

    expect(report.ok).toBe(false);
    const nodeCheck = report.commandChecks.find((check) => check.name === "node");
    expect(nodeCheck.ok).toBe(false);
    expect(nodeCheck.value).toBe("v20.11.0");
    expect(nodeCheck.hint).toContain("Node.js 22.x");
    expect(nodeCheck.hint).toContain("20.x");
    expect(report.missingCommands.map((check) => check.name)).toContain("node");
  });

  it("rejects the 'node 20.11.0' stdout shape when major is not 22", () => {
    const report = buildLinuxDevDoctorReport({
      platform: "linux",
      executor: executorWith({ nodeVersion: "node 20.11.0" })
    });

    const nodeCheck = report.commandChecks.find((check) => check.name === "node");
    expect(nodeCheck.ok).toBe(false);
    expect(nodeCheck.hint).toContain("Node.js 22.x");
  });

  it("keeps node ok:true when the version cannot be parsed but the command exits 0", () => {
    const executor = (command) => {
      if (command === "node") {
        return { status: 0, stdout: "unexpected\n", stderr: "" };
      }
      if (command === "pkg-config") {
        return { status: 0, stdout: "", stderr: "" };
      }
      return { status: 0, stdout: `${command} 1.0.0\n`, stderr: "" };
    };

    const report = buildLinuxDevDoctorReport({ platform: "linux", executor });

    const nodeCheck = report.commandChecks.find((check) => check.name === "node");
    expect(nodeCheck.ok).toBe(true);
    expect(nodeCheck.hint).toBe("Install Node.js 22.x.");
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
    expect(report.recommendedAptInstallCommand).toBe(
      `sudo apt-get install -y ${report.missingAptPackages.join(" ")}`
    );
    expect(report.baselineAptInstallCommand).toBe(
      `sudo apt-get install -y ${DEBIAN_TAURI_PACKAGES.join(" ")}`
    );
  });

  it("keeps the documented Debian package baseline aligned with pkg-config checks", () => {
    const requiredAptPackages = REQUIRED_PKG_CONFIG.map((check) => check.apt);

    for (const aptPackage of requiredAptPackages) {
      expect(DEBIAN_TAURI_PACKAGES).toContain(aptPackage);
    }
  });
});
