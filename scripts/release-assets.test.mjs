import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleReleaseAssets,
  collectReleaseAssets,
  expectedReleaseAssetNames,
  verifyVersionCoherence
} from "./release-assets.mjs";

function tempRoot(name) {
  return mkdtempSync(join(tmpdir(), `codereader-${name}-`));
}

describe("release asset collection", () => {
  it("normalizes the two Windows package names", () => {
    const root = tempRoot("collect-windows");
    const source = join(root, "bundle");
    const output = join(root, "out");
    mkdirSync(join(source, "nsis"), { recursive: true });
    mkdirSync(join(source, "msi"), { recursive: true });
    writeFileSync(join(source, "nsis", "upstream.exe"), "exe");
    writeFileSync(join(source, "msi", "upstream.msi"), "msi");

    const copied = collectReleaseAssets({
      source,
      output,
      platform: "windows",
      arch: "arm64",
      version: "1.0.0-rc.2"
    });

    expect(copied.map((path) => path.split(/[\\/]/).at(-1)).sort()).toEqual([
      "CodeReader_1.0.0-rc.2_windows_arm64.msi",
      "CodeReader_1.0.0-rc.2_windows_arm64_setup.exe"
    ]);
  });

  it("rejects a missing Linux package", () => {
    const root = tempRoot("collect-linux-missing");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "app.AppImage"), "appimage");
    writeFileSync(join(root, "app.deb"), "deb");

    expect(() =>
      collectReleaseAssets({
        source: root,
        output: join(root, "out"),
        platform: "linux",
        arch: "x64",
        version: "1.0.0-rc.2"
      })
    ).toThrow(/exactly one.*rpm/);
  });
});

describe("release assembly", () => {
  it("requires ten assets and emits checksums, SPDX and release metadata", () => {
    const root = tempRoot("assemble");
    const input = join(root, "input");
    const output = join(root, "output");
    mkdirSync(input, { recursive: true });
    for (const name of expectedReleaseAssetNames("1.0.0-rc.2")) {
      writeFileSync(join(input, name), `payload:${name}`);
    }

    const assets = assembleReleaseAssets({ input, output, version: "1.0.0-rc.2" });

    expect(assets).toHaveLength(10);
    expect(readFileSync(join(output, "SHA256SUMS"), "utf8").trim().split("\n")).toHaveLength(10);
    expect(JSON.parse(readFileSync(join(output, "CodeReader.spdx.json"), "utf8"))).toMatchObject({
      spdxVersion: "SPDX-2.3",
      files: expect.arrayContaining([expect.objectContaining({ fileName: assets[0].name })])
    });
    expect(JSON.parse(readFileSync(join(output, "release-metadata.json"), "utf8"))).toMatchObject({
      version: "1.0.0-rc.2",
      windowsAuthenticodeSigned: false,
      assets: expect.any(Array)
    });
    expect(readFileSync(join(output, "RELEASE-NOTES.md"), "utf8")).toContain("Windows 10 22H2");
    expect(readFileSync(join(output, "RELEASE-NOTES.md"), "utf8")).toContain("简体中文");
    expect(readFileSync(join(output, "RELEASE-NOTES.md"), "utf8")).toContain(
      "CodeReader_1.0.0-rc.2_windows_x64_setup.exe"
    );
    expect(readFileSync(join(output, "RELEASE-NOTES.md"), "utf8")).toContain(
      "https://github.com/lrk7353-arch/CodeReader/blob/v1.0.0-rc.2/README.zh-CN.md"
    );
    expect(readFileSync(join(output, "RELEASE-NOTES.md"), "utf8")).not.toMatch(
      /(?:\/home\/|[A-Z]:[\\/]|\\\\Users\\\\)/
    );
    expect(readFileSync(join(output, "RELEASE-NOTES.md"), "utf8")).toContain("Windows 未签名提示");
    expect(readFileSync(join(output, "RELEASE-NOTES.md"), "utf8")).toContain(
      "do not replace the maintainer's native-hardware checks"
    );
  });

  it("rejects incomplete release input", () => {
    const root = tempRoot("assemble-incomplete");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "CodeReader_1.0.0-rc.2_windows_x64_setup.exe"), "exe");
    expect(() =>
      assembleReleaseAssets({ input: root, output: join(root, "out"), version: "1.0.0-rc.2" })
    ).toThrow(/asset set mismatch/);
  });
});

describe("release version coherence", () => {
  it("checks package, lockfiles, Tauri, Cargo and MSI versions together", () => {
    const version = JSON.parse(readFileSync("package.json", "utf8")).version;
    expect(verifyVersionCoherence({ root: process.cwd(), tag: `v${version}` })).toBe(version);
  });
});
