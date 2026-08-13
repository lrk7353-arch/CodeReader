import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCandidateManifest, verifyCandidateManifest } from "./native-candidate-snapshot.mjs";
import { expectedReleaseAssetNames } from "./release-assets.mjs";
import { verifyNativeSmokeEvidence } from "./release-evidence.mjs";

const tempDirectories = [];
const tag = "v1.0.0-rc.6";
const sha = "a".repeat(40);

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "candidate-snapshot-"));
  tempDirectories.push(directory);
  for (let index = 0; index < 10; index += 1) {
    writeFileSync(join(directory, `CodeReader_${index}.pkg`), `package-${index}`);
  }
  for (const platform of ["linux", "windows"]) {
    for (const arch of ["arm64", "x64"]) {
      writeFileSync(
        join(directory, `native-smoke-${platform}-${arch}.json`),
        `${platform}-${arch}`
      );
    }
  }
  writeFileSync(join(directory, "SHA256SUMS"), "controlled sums");
  return directory;
}

function validReleaseFixture(seed) {
  const directory = mkdtempSync(join(tmpdir(), "candidate-release-"));
  tempDirectories.push(directory);
  const packages = expectedReleaseAssetNames("1.0.0-rc.6");
  const hashes = new Map();
  for (const name of packages) {
    const content = `${seed}-${name}`;
    writeFileSync(join(directory, name), content);
    hashes.set(name, createHash("sha256").update(content).digest("hex"));
  }
  for (const platform of ["linux", "windows"]) {
    for (const arch of ["arm64", "x64"]) {
      const targetPackages = packages
        .filter((name) => name.includes(`_${platform}_${arch}`))
        .map((name) => ({ name, sha256: hashes.get(name) }));
      const requiredChecks =
        platform === "linux"
          ? [
              "deb-metadata",
              "rpm-metadata",
              "deb-install-window-uninstall",
              "appimage-window",
              "rpm-install-window-uninstall"
            ]
          : ["nsis-install-window-uninstall", "msi-install-window-uninstall"];
      writeFileSync(
        join(directory, `native-smoke-${platform}-${arch}.json`),
        JSON.stringify({
          schemaVersion: 1,
          releaseTag: tag,
          commitSha: sha,
          platform,
          arch,
          status: "pass",
          packages: targetPackages,
          checks: requiredChecks.map((name) => ({ name, status: "pass" }))
        })
      );
    }
  }
  writeFileSync(
    join(directory, "SHA256SUMS"),
    `${packages.map((name) => `${hashes.get(name)}  ${name}`).join("\n")}\n`
  );
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("native candidate snapshot", () => {
  it("binds an exact sanitized file and hash set to tag and SHA", () => {
    const directory = fixture();
    const manifest = createCandidateManifest({ directory, releaseTag: tag, commitSha: sha });
    expect(manifest.files).toHaveLength(15);
    expect(JSON.stringify(manifest)).not.toContain(directory);
    verifyCandidateManifest({ directory, manifest, releaseTag: tag, commitSha: sha });
  });

  it("rejects a replacement set even when it remains internally hashable", () => {
    const prepared = validReleaseFixture("prepared-A");
    const replacement = validReleaseFixture("replacement-B");
    const manifest = createCandidateManifest({
      directory: prepared,
      releaseTag: tag,
      commitSha: sha
    });
    expect(
      verifyNativeSmokeEvidence({
        input: replacement,
        version: "1.0.0-rc.6",
        tag,
        commitSha: sha
      })
    ).toHaveLength(4);
    expect(() =>
      verifyCandidateManifest({ directory: replacement, manifest, releaseTag: tag, commitSha: sha })
    ).toThrow(/differs from the prepared snapshot/);
  });
});
