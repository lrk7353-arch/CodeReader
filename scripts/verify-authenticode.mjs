import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SIGNING_POLICY = Object.freeze({
  WARN_UNSIGNED: "warn-unsigned",
  ALLOW_UNSIGNED: "allow-unsigned",
  REQUIRE_SIGNED: "require-signed"
});

export const SIGNING_VERDICT = Object.freeze({
  PASS: "pass",
  WARN: "warn",
  FAIL: "fail"
});

const DEFAULT_POLICY = {
  mode: SIGNING_POLICY.WARN_UNSIGNED,
  allowedThumbprints: [],
  allowedPublishers: []
};

const STATUS_VALUES = new Set([
  "Valid",
  "UnknownError",
  "NotSigned",
  "HashMismatch",
  "NotTrusted",
  "InvalidDigitalSignature"
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseSigningManifest(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Signing manifest is not valid JSON: ${reason}`, { cause: error });
  }
  if (!isObject(parsed)) {
    throw new Error("Signing manifest root must be an object.");
  }
  if (!isObject(parsed.configuration)) {
    throw new Error("Signing manifest is missing the `configuration` object.");
  }
  if (!Array.isArray(parsed.artifacts)) {
    throw new Error("Signing manifest is missing the `artifacts` array.");
  }
  return parsed;
}

export function summarizeSigningEntries(entries) {
  const summary = {
    total: entries.length,
    signed: 0,
    unsigned: 0,
    invalid: 0,
    missing: 0
  };
  for (const entry of entries) {
    if (!isObject(entry)) {
      summary.missing += 1;
      continue;
    }
    const status = typeof entry.signatureStatus === "string" ? entry.signatureStatus : null;
    if (entry.signed === true && status === "Valid") {
      summary.signed += 1;
      continue;
    }
    if (status && status !== "Valid" && status !== "NotSigned" && STATUS_VALUES.has(status)) {
      summary.invalid += 1;
      continue;
    }
    if (entry.signed === false || status === "NotSigned" || status === null) {
      summary.unsigned += 1;
      continue;
    }
    summary.unsigned += 1;
  }
  return summary;
}

function entryHasTrustedSigner(entry, policy) {
  if (entry.signed !== true) {
    return false;
  }
  if (policy.allowedThumbprints.length > 0) {
    const thumbprint = typeof entry.thumbprint === "string" ? entry.thumbprint.toLowerCase() : "";
    if (!policy.allowedThumbprints.some((allowed) => allowed.toLowerCase() === thumbprint)) {
      return false;
    }
  }
  if (policy.allowedPublishers.length > 0) {
    const signer = typeof entry.signer === "string" ? entry.signer : "";
    if (!policy.allowedPublishers.includes(signer)) {
      return false;
    }
  }
  return true;
}

export function evaluateSigningManifest(manifest, options = {}) {
  if (!isObject(manifest)) {
    throw new Error("evaluateSigningManifest requires a parsed manifest object.");
  }
  const policy = { ...DEFAULT_POLICY, ...options };
  const configuration = manifest.configuration ?? {};
  const entries = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const summary = summarizeSigningEntries(entries);

  const reasons = [];
  let verdict = SIGNING_VERDICT.PASS;

  if (summary.total === 0) {
    return {
      verdict: SIGNING_VERDICT.FAIL,
      summary,
      reasons: ["Signing manifest does not contain any artifacts."]
    };
  }

  if (summary.missing > 0) {
    verdict = SIGNING_VERDICT.FAIL;
    reasons.push(`${summary.missing} manifest entries are malformed.`);
  }

  for (const entry of entries) {
    if (!isObject(entry)) {
      continue;
    }
    if (entry.signed !== true) {
      const status =
        typeof entry.signatureStatus === "string" ? entry.signatureStatus : "NotSigned";
      const note = typeof entry.verificationNote === "string" ? entry.verificationNote : null;
      const detail = note ? ` (${note.replace(/\s+/g, " ").trim()})` : "";
      if (policy.mode === SIGNING_POLICY.REQUIRE_SIGNED) {
        verdict = SIGNING_VERDICT.FAIL;
        reasons.push(
          `${entry.name ?? "unknown artifact"} is not signed: status=${status}${detail}`
        );
      } else if (policy.mode === SIGNING_POLICY.WARN_UNSIGNED) {
        if (verdict === SIGNING_VERDICT.PASS) {
          verdict = SIGNING_VERDICT.WARN;
        }
        reasons.push(
          `${entry.name ?? "unknown artifact"} is not signed: status=${status}${detail}`
        );
      }
      continue;
    }
    if (entry.verified !== true) {
      verdict = SIGNING_VERDICT.FAIL;
      reasons.push(
        `${entry.name ?? "unknown artifact"} reported as signed but verification did not confirm it.`
      );
      continue;
    }
    if (!entryHasTrustedSigner(entry, policy)) {
      verdict = SIGNING_VERDICT.FAIL;
      reasons.push(
        `${entry.name ?? "unknown artifact"} signed by an untrusted certificate (${entry.signer ?? "unknown"}).`
      );
    }
  }

  if (configuration.required === true && summary.signed < summary.total) {
    verdict = SIGNING_VERDICT.FAIL;
    reasons.push(
      "Release script flagged signing as required but at least one artifact is unsigned."
    );
  }

  if (configuration.enabled === false && policy.mode === SIGNING_POLICY.REQUIRE_SIGNED) {
    verdict = SIGNING_VERDICT.FAIL;
    reasons.push("Signing was required but no certificate was configured for this release.");
  }

  return { verdict, summary, reasons };
}

function formatPolicySummary(policy) {
  const parts = [`mode=${policy.mode}`];
  if (policy.allowedThumbprints.length > 0) {
    parts.push(`thumbprints=${policy.allowedThumbprints.length}`);
  }
  if (policy.allowedPublishers.length > 0) {
    parts.push(`publishers=${policy.allowedPublishers.length}`);
  }
  return parts.join(" ");
}

function parseArgs(argv) {
  const options = { ...DEFAULT_POLICY };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--policy") {
      const value = argv[++i];
      if (!Object.values(SIGNING_POLICY).includes(value)) {
        throw new Error(
          `Unknown --policy value '${value}'. Expected one of ${Object.values(SIGNING_POLICY).join(", ")}.`
        );
      }
      options.mode = value;
    } else if (arg === "--require-signed") {
      options.mode = SIGNING_POLICY.REQUIRE_SIGNED;
    } else if (arg === "--allow-unsigned") {
      options.mode = SIGNING_POLICY.ALLOW_UNSIGNED;
    } else if (arg.startsWith("--thumbprint=")) {
      options.allowedThumbprints.push(arg.slice("--thumbprint=".length));
    } else if (arg === "--thumbprint") {
      options.allowedThumbprints.push(argv[++i]);
    } else if (arg.startsWith("--publisher=")) {
      options.allowedPublishers.push(arg.slice("--publisher=".length));
    } else if (arg === "--publisher") {
      options.allowedPublishers.push(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function printHelp() {
  console.log(`Usage: node scripts/verify-authenticode.mjs <signing-manifest.json> [options]

Options:
  --policy <mode>           warn-unsigned (default) | allow-unsigned | require-signed
  --require-signed          shortcut for --policy require-signed
  --allow-unsigned          shortcut for --policy allow-unsigned
  --thumbprint <sha1>       add an allowed signer thumbprint (repeatable)
  --publisher <name>        add an allowed signer subject (repeatable)
  -h, --help                show this help

Exit codes:
  0  pass or warn
  1  fail (verdict=FAIL)
  2  usage error`);
}

async function runCli() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const [manifestArg] = positional;
  if (!manifestArg) {
    printHelp();
    process.exit(2);
  }
  const manifestPath = resolve(manifestArg);
  const text = await readFile(manifestPath, "utf8");
  const manifest = parseSigningManifest(text);
  const result = evaluateSigningManifest(manifest, options);
  console.log(`Policy: ${formatPolicySummary(options)}`);
  console.log(
    `Verdict: ${result.verdict} (signed=${result.summary.signed}, unsigned=${result.summary.unsigned}, invalid=${result.summary.invalid})`
  );
  for (const reason of result.reasons) {
    console.log(`- ${reason}`);
  }
  if (result.verdict === SIGNING_VERDICT.FAIL) {
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`verify-authenticode failed: ${message}`);
    process.exit(2);
  });
}

export const _internals = { root };
