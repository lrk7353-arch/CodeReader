import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createLegacyFixture, extractHistoricalSchema } from "./native-journey-fixture.mjs";
import { createHash } from "node:crypto";

describe("native journey legacy fixture", () => {
  it("builds a deterministic versioned database", () => {
    if (spawnSync("sqlite3", ["--version"]).status !== 0) return;
    const root = mkdtempSync(join(tmpdir(), "journey-fixture-"));
    const schema = join(root, "schema.sql");
    const data = join(root, "data.sql");
    const output = join(root, "legacy.sqlite");
    writeFileSync(schema, "CREATE TABLE projects(id TEXT PRIMARY KEY);");
    writeFileSync(data, "INSERT INTO projects VALUES ('fixture');");
    createLegacyFixture({ schema, data, output, version: 1 });
    const result = spawnSync("sqlite3", [output, "PRAGMA user_version; SELECT id FROM projects;"], {
      encoding: "utf8"
    });
    expect(result.stdout.trim().split("\n")).toEqual(["1", "fixture"]);
    expect(readFileSync(output).length).toBeGreaterThan(0);
  });

  it("extracts only named immutable historical SQL batches", () => {
    const root = mkdtempSync(join(tmpdir(), "journey-schema-"));
    const source = join(root, "schema.rs");
    const output = join(root, "schema.sql");
    writeFileSync(
      source,
      'fn migrate_to_v1(conn: &Connection) { conn.execute_batch("CREATE TABLE projects(id TEXT);"); }\n'
    );
    extractHistoricalSchema({ source, output, migrations: "migrate_to_v1" });
    expect(readFileSync(output, "utf8")).toContain("CREATE TABLE projects");
    expect(() => extractHistoricalSchema({ source, output, migrations: "missing" })).toThrow(
      /missing/
    );
  });

  it("extracts literal ensure_column schema operations without executing source code", () => {
    const root = mkdtempSync(join(tmpdir(), "journey-column-"));
    const source = join(root, "schema.rs");
    const output = join(root, "schema.sql");
    writeFileSync(
      source,
      'fn migrate_to_v3(conn: &Connection) { ensure_column(conn, "prompts", "body", "TEXT")?; }\n'
    );
    extractHistoricalSchema({ source, output, migrations: "migrate_to_v3" });
    expect(readFileSync(output, "utf8")).toContain('ALTER TABLE "prompts" ADD COLUMN "body" TEXT;');
  });

  it("reproduces the repository-pinned hashes from the real historical sources", () => {
    const manifest = JSON.parse(
      readFileSync("src-tauri/tests/fixtures/persistence/historical-schema-manifest.json", "utf8")
    );
    for (const [version, contract] of Object.entries(manifest)) {
      const source = spawnSync(
        "git",
        ["show", `${contract.sourceCommit}:src-tauri/src/persistence/schema.rs`],
        { encoding: "utf8" }
      );
      expect(source.status).toBe(0);
      const root = mkdtempSync(join(tmpdir(), `journey-real-${version}-`));
      const rust = resolve(root, "schema.rs");
      const sql = resolve(root, "schema.sql");
      writeFileSync(rust, source.stdout);
      extractHistoricalSchema({ source: rust, output: sql, migrations: contract.migrations });
      const contents = readFileSync(sql);
      expect(createHash("sha256").update(contents).digest("hex")).toBe(contract.extractedSha256);
      for (const table of contract.requiredTables) expect(contents.toString()).toContain(table);
    }
  });
});
