import { describe, expect, it } from "vitest";
import {
  evaluateSigningManifest,
  parseSigningManifest,
  SIGNING_POLICY,
  SIGNING_VERDICT,
  summarizeSigningEntries
} from "./verify-authenticode.mjs";

function unsignedManifest(entries = defaultUnsignedEntries()) {
  return {
    product: "CodeReader",
    generatedAt: "2026-07-04T18:00:00.000+00:00",
    configuration: {
      enabled: false,
      required: false,
      digestAlgorithm: "sha256",
      timestampConfigured: false,
      timestampAlgorithm: "sha256"
    },
    artifacts: entries
  };
}

function defaultUnsignedEntries() {
  return [
    {
      name: "CodeReader_0.11.0-beta.2_x64-setup.exe",
      path: "artifacts/windows-x64/CodeReader_0.11.0-beta.2_x64-setup.exe",
      signed: false,
      signer: null,
      thumbprint: null,
      timestampSigner: null,
      signatureStatus: "NotSigned",
      verified: false,
      verificationNote: "signtool.exe unavailable; verified via Get-AuthenticodeSignature only."
    },
    {
      name: "CodeReader_0.11.0-beta.2_x64_zh-CN.msi",
      path: "artifacts/windows-x64/CodeReader_0.11.0-beta.2_x64_zh-CN.msi",
      signed: false,
      signer: null,
      thumbprint: null,
      timestampSigner: null,
      signatureStatus: "NotSigned",
      verified: false,
      verificationNote: "signtool.exe unavailable; verified via Get-AuthenticodeSignature only."
    }
  ];
}

function signedEntries(thumbprint = "ABC123", signer = "CN=CodeReader Project") {
  return [
    {
      name: "CodeReader_0.11.0-beta.2_x64-setup.exe",
      path: "artifacts/windows-x64/CodeReader_0.11.0-beta.2_x64-setup.exe",
      signed: true,
      signer,
      thumbprint,
      timestampSigner: "CN=DigiCert Timestamp 2023",
      signatureStatus: "Valid",
      verified: true,
      verificationNote: "Successfully verified"
    }
  ];
}

describe("parseSigningManifest", () => {
  it("accepts a well-formed manifest", () => {
    const parsed = parseSigningManifest(JSON.stringify(unsignedManifest()));
    expect(parsed.product).toBe("CodeReader");
    expect(parsed.artifacts).toHaveLength(2);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseSigningManifest("not json")).toThrow(/not valid JSON/);
  });

  it("rejects manifests missing configuration", () => {
    const bad = JSON.stringify({ product: "CodeReader", artifacts: [] });
    expect(() => parseSigningManifest(bad)).toThrow(/configuration/);
  });

  it("rejects manifests missing artifacts", () => {
    const bad = JSON.stringify({
      product: "CodeReader",
      configuration: { enabled: false }
    });
    expect(() => parseSigningManifest(bad)).toThrow(/artifacts/);
  });
});

describe("summarizeSigningEntries", () => {
  it("counts signed, unsigned, and missing entries", () => {
    const summary = summarizeSigningEntries([
      ...defaultUnsignedEntries(),
      ...signedEntries(),
      null
    ]);
    expect(summary.total).toBe(4);
    expect(summary.signed).toBe(1);
    expect(summary.unsigned).toBe(2);
    expect(summary.missing).toBe(1);
    expect(summary.invalid).toBe(0);
  });

  it("flags hash-mismatch entries as invalid", () => {
    const summary = summarizeSigningEntries([
      {
        name: "broken.exe",
        path: "x",
        signed: true,
        signer: "CN=CodeReader",
        thumbprint: "abc",
        signatureStatus: "HashMismatch",
        verified: false
      }
    ]);
    expect(summary.signed).toBe(0);
    expect(summary.invalid).toBe(1);
  });
});

describe("evaluateSigningManifest", () => {
  it("passes unsigned internal-beta manifests under warn-unsigned", () => {
    const result = evaluateSigningManifest(unsignedManifest());
    expect(result.verdict).toBe(SIGNING_VERDICT.WARN);
    expect(result.summary.unsigned).toBe(2);
    expect(result.reasons).toHaveLength(2);
  });

  it("passes unsigned internal-beta manifests under allow-unsigned", () => {
    const result = evaluateSigningManifest(unsignedManifest(), {
      mode: SIGNING_POLICY.ALLOW_UNSIGNED
    });
    expect(result.verdict).toBe(SIGNING_VERDICT.PASS);
    expect(result.reasons).toEqual([]);
  });

  it("fails unsigned internal-beta manifests when signing is required", () => {
    const result = evaluateSigningManifest(unsignedManifest(), {
      mode: SIGNING_POLICY.REQUIRE_SIGNED
    });
    expect(result.verdict).toBe(SIGNING_VERDICT.FAIL);
    expect(result.reasons[0]).toMatch(/not signed/);
  });

  it("passes a fully signed manifest", () => {
    const manifest = unsignedManifest(signedEntries());
    const result = evaluateSigningManifest(manifest);
    expect(result.verdict).toBe(SIGNING_VERDICT.PASS);
    expect(result.summary.signed).toBe(1);
    expect(result.reasons).toEqual([]);
  });

  it("fails when a signed entry is not in the allowed thumbprint list", () => {
    const manifest = unsignedManifest(signedEntries("unknown-thumbprint"));
    const result = evaluateSigningManifest(manifest, {
      allowedThumbprints: ["expected-thumbprint"]
    });
    expect(result.verdict).toBe(SIGNING_VERDICT.FAIL);
    expect(result.reasons.join(" ")).toMatch(/untrusted certificate/);
  });

  it("passes when the signed entry matches an allowed thumbprint", () => {
    const manifest = unsignedManifest(signedEntries("EXPECTED"));
    const result = evaluateSigningManifest(manifest, {
      allowedThumbprints: ["expected"]
    });
    expect(result.verdict).toBe(SIGNING_VERDICT.PASS);
  });

  it("fails when an entry reports signed but verification did not confirm it", () => {
    const entries = [
      {
        name: "broken.exe",
        path: "x",
        signed: true,
        signer: "CN=CodeReader",
        thumbprint: "abc",
        signatureStatus: "Valid",
        verified: false,
        verificationNote: "signtool exit code 1"
      }
    ];
    const result = evaluateSigningManifest(unsignedManifest(entries));
    expect(result.verdict).toBe(SIGNING_VERDICT.FAIL);
    expect(result.reasons.join(" ")).toMatch(/verification did not confirm/);
  });

  it("fails when the release script marked signing as required and any artifact is unsigned", () => {
    const manifest = unsignedManifest();
    manifest.configuration.required = true;
    const result = evaluateSigningManifest(manifest, {
      mode: SIGNING_POLICY.REQUIRE_SIGNED
    });
    expect(result.verdict).toBe(SIGNING_VERDICT.FAIL);
  });

  it("fails when the manifest has no artifacts at all", () => {
    const manifest = unsignedManifest([]);
    const result = evaluateSigningManifest(manifest);
    expect(result.verdict).toBe(SIGNING_VERDICT.FAIL);
    expect(result.reasons[0]).toMatch(/any artifacts/);
  });

  it("fails on malformed entries", () => {
    const result = evaluateSigningManifest(unsignedManifest([null, "garbage"]));
    expect(result.verdict).toBe(SIGNING_VERDICT.FAIL);
    expect(result.reasons[0]).toMatch(/malformed/);
  });

  it("honors a combined allow-unsigned + required-allowed-thumbprint policy", () => {
    const result = evaluateSigningManifest(unsignedManifest(), {
      mode: SIGNING_POLICY.ALLOW_UNSIGNED,
      allowedThumbprints: ["abc"]
    });
    expect(result.verdict).toBe(SIGNING_VERDICT.PASS);
  });
});
