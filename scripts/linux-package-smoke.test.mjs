import { describe, expect, it } from "vitest";
import { validateLinuxPackageMetadata } from "./linux-package-smoke.mjs";

function metadataCapture({ debArch = "amd64", debDepends, rpmArch = "x86_64", rpmRequires } = {}) {
  return (command, args) => {
    if (command === "dpkg-deb" && args.at(-1) === "Architecture") return debArch;
    if (command === "dpkg-deb" && args.at(-1) === "Depends") {
      return debDepends ?? "libwebkit2gtk-4.1-0 (>= 2.40), libgtk-3-0";
    }
    if (command === "rpm" && args.includes("--qf")) return rpmArch;
    if (command === "rpm" && args[0] === "-qpR") {
      return rpmRequires ?? "libwebkit2gtk-4.1.so.0()(64bit)\ngtk3";
    }
    throw new Error(`Unexpected metadata command: ${command} ${args.join(" ")}`);
  };
}

describe("Linux release package metadata", () => {
  it("accepts x64 WebKitGTK package metadata", () => {
    expect(() =>
      validateLinuxPackageMetadata({
        deb: "CodeReader.deb",
        rpm: "CodeReader.rpm",
        arch: "x64",
        captureOutput: metadataCapture()
      })
    ).not.toThrow();
  });

  it("accepts ARM64 WebKitGTK package metadata", () => {
    expect(() =>
      validateLinuxPackageMetadata({
        deb: "CodeReader.deb",
        rpm: "CodeReader.rpm",
        arch: "arm64",
        captureOutput: metadataCapture({ debArch: "arm64", rpmArch: "aarch64" })
      })
    ).not.toThrow();
  });

  it("rejects an incorrect architecture or missing WebKitGTK dependency", () => {
    expect(() =>
      validateLinuxPackageMetadata({
        deb: "CodeReader.deb",
        rpm: "CodeReader.rpm",
        arch: "x64",
        captureOutput: metadataCapture({ debArch: "arm64" })
      })
    ).toThrow(/Deb architecture/);
    expect(() =>
      validateLinuxPackageMetadata({
        deb: "CodeReader.deb",
        rpm: "CodeReader.rpm",
        arch: "x64",
        captureOutput: metadataCapture({ debDepends: "libgtk-3-0" })
      })
    ).toThrow(/WebKitGTK/);
  });
});
