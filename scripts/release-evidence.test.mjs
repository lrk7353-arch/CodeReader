import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expectedReleaseAssetNames } from "./release-assets.mjs";
import { verifyNativeSmokeEvidence, verifySpdxSbom } from "./release-evidence.mjs";

const VERSION = "1.0.0-rc.1";
const TAG = `v${VERSION}`;
const SHA = "a".repeat(40);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "codereader-native-smoke-"));
  const payloads = new Map();
  for (const name of expectedReleaseAssetNames(VERSION)) {
    const payload = `package:${name}`;
    payloads.set(name, payload);
    writeFileSync(join(root, name), payload);
  }
  for (const platform of ["windows", "linux"]) {
    for (const arch of ["x64", "arm64"]) {
      const packages = [...payloads]
        .filter(([name]) => name.includes(`_${platform}_${arch}`))
        .map(([name, payload]) => ({ name, sha256: hash(payload) }));
      const checks =
        platform === "windows"
          ? ["nsis-install-window-uninstall", "msi-install-window-uninstall"]
          : [
              "deb-metadata",
              "rpm-metadata",
              "deb-install-window-uninstall",
              "appimage-window",
              "rpm-install-window-uninstall"
            ];
      writeFileSync(
        join(root, `native-smoke-${platform}-${arch}.json`),
        JSON.stringify({
          schemaVersion: 1,
          releaseTag: TAG,
          commitSha: SHA,
          platform,
          arch,
          status: "pass",
          packages,
          checks: checks.map((name) => ({ name, status: "pass" }))
        })
      );
    }
  }
  return root;
}

describe("native release smoke evidence", () => {
  it("binds all four records to the tag, commit, architecture, and package hashes", () => {
    const input = fixture();
    const output = join(input, "verified");
    expect(
      verifyNativeSmokeEvidence({
        input,
        output,
        version: VERSION,
        tag: TAG,
        commitSha: SHA
      })
    ).toHaveLength(4);
    expect(
      JSON.parse(readFileSync(join(output, "native-smoke-linux-arm64.json"), "utf8"))
    ).toMatchObject({
      status: "pass",
      arch: "arm64"
    });
  });

  it("rejects evidence containing an absolute path", () => {
    const input = fixture();
    const path = join(input, "native-smoke-linux-x64.json");
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    evidence.notes = "/home/runner/work/CodeReader";
    writeFileSync(path, JSON.stringify(evidence));
    expect(() =>
      verifyNativeSmokeEvidence({ input, version: VERSION, tag: TAG, commitSha: SHA })
    ).toThrow(/forbidden field/);
  });

  it("rejects an evidence field that could export source or response content", () => {
    const input = fixture();
    const path = join(input, "native-smoke-windows-x64.json");
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    evidence.response = "MODEL_RESPONSE_CANARY";
    writeFileSync(path, JSON.stringify(evidence));
    expect(() =>
      verifyNativeSmokeEvidence({ input, version: VERSION, tag: TAG, commitSha: SHA })
    ).toThrow(/forbidden field/);
  });

  it("rejects a package changed after smoke", () => {
    const input = fixture();
    writeFileSync(join(input, "CodeReader_1.0.0-rc.1_linux_arm64.rpm"), "changed");
    expect(() =>
      verifyNativeSmokeEvidence({ input, version: VERSION, tag: TAG, commitSha: SHA })
    ).toThrow(/hash mismatch/);
  });
});

describe("final release SBOM", () => {
  it("accepts an SPDX 2.3 document with a package inventory", () => {
    const root = mkdtempSync(join(tmpdir(), "codereader-spdx-"));
    const path = join(root, "CodeReader.spdx.json");
    writeFileSync(
      path,
      JSON.stringify({
        spdxVersion: "SPDX-2.3",
        creationInfo: { creators: ["Tool: test"] },
        packages: [{ SPDXID: "SPDXRef-Package", name: "codereader" }]
      })
    );
    expect(verifySpdxSbom(path).packages).toHaveLength(1);
  });

  it("rejects an incomplete or non-SPDX final SBOM", () => {
    const root = mkdtempSync(join(tmpdir(), "codereader-spdx-invalid-"));
    const path = join(root, "CodeReader.spdx.json");
    writeFileSync(path, JSON.stringify({ spdxVersion: "CycloneDX" }));
    expect(() => verifySpdxSbom(path)).toThrow(/SPDX 2.3/);
  });
});
