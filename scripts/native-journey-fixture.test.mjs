import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  createLegacyFixture,
  extractHistoricalSchema,
  extractSeedData
} from "./native-journey-fixture.mjs";
import { createHash } from "node:crypto";

const sqliteAvailable = spawnSync("sqlite3", ["--version"]).status === 0;
const sqliteIt = sqliteAvailable ? it : it.skip;

describe("native journey legacy fixture", () => {
  it("accepts only audited seed statements and rejects DDL instead of ignoring it", () => {
    const seed = extractSeedData(
      "INSERT INTO projects(id) VALUES ('fixture'); UPDATE projects SET id='current';"
    );
    expect(seed).toContain("INSERT INTO projects");
    expect(seed).toContain("UPDATE projects");
    expect(() => extractSeedData("CREATE TABLE hidden(id TEXT);")).toThrow(/non-data SQL/);
    expect(() => extractSeedData('ALTER TABLE "projects" ADD COLUMN "hidden" TEXT;')).toThrow(
      /non-data SQL/
    );
  });
  sqliteIt("builds a deterministic versioned database [requires sqlite3]", () => {
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

  it("does not duplicate ensure_column operations already present in a CREATE TABLE", () => {
    const root = mkdtempSync(join(tmpdir(), "journey-existing-column-"));
    const source = join(root, "schema.rs");
    const output = join(root, "schema.sql");
    writeFileSync(
      source,
      'fn migrate_to_v1(conn: &Connection) { conn.execute_batch("CREATE TABLE prompts(id TEXT, body TEXT);"); ensure_column(conn, "prompts", "body", "TEXT")?; ensure_column(conn, "prompts", "extra", "TEXT")?; }\n'
    );
    extractHistoricalSchema({ source, output, migrations: "migrate_to_v1" });
    const schema = readFileSync(output, "utf8");
    expect(schema).not.toContain('ADD COLUMN "body"');
    expect(schema).toContain('ADD COLUMN "extra"');
  });

  it("reproduces the repository-pinned hashes from the real historical sources", () => {
    const manifest = JSON.parse(
      readFileSync("src-tauri/tests/fixtures/persistence/historical-schema-manifest.json", "utf8")
    );
    const extracted = new Map();
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
      extractHistoricalSchema({
        source: rust,
        output: sql,
        migrations: contract.migrations,
        base: contract.baseVersion ? extracted.get(contract.baseVersion) : undefined
      });
      const contents = readFileSync(sql);
      expect(createHash("sha256").update(contents).digest("hex")).toBe(contract.extractedSha256);
      for (const table of contract.requiredTables) expect(contents.toString()).toContain(table);
      extracted.set(version, sql);
    }
  });

  sqliteIt(
    "constructs all real legacy generations while preserving duplicate-column errors [requires sqlite3]",
    () => {
      const manifest = JSON.parse(
        readFileSync("src-tauri/tests/fixtures/persistence/historical-schema-manifest.json", "utf8")
      );
      const root = mkdtempSync(join(tmpdir(), "journey-generations-"));
      const schemas = new Map();
      for (const [version, contract] of Object.entries(manifest)) {
        const source = spawnSync(
          "git",
          ["show", `${contract.sourceCommit}:src-tauri/src/persistence/schema.rs`],
          { encoding: "utf8" }
        );
        expect(source.status).toBe(0);
        const rust = join(root, `${version}.rs`);
        const schema = join(root, `${version}.sql`);
        writeFileSync(rust, source.stdout);
        extractHistoricalSchema({
          source: rust,
          output: schema,
          migrations: contract.migrations,
          base: contract.baseVersion ? schemas.get(contract.baseVersion) : undefined
        });
        schemas.set(version, schema);
      }
      const fixtures = [
        ["v1", "v0_10.sql", 1, "fixture-model-v010"],
        ["v2", "v0_11_early.sql", 2, "fixture-model-v011-early"],
        ["v3", "v0_11_current.sql", 3, "fixture-model-v011-current"]
      ];
      for (const [version, dataName, userVersion, expectedModel] of fixtures) {
        const database = join(root, `${version}.sqlite`);
        createLegacyFixture({
          schema: schemas.get(version),
          data: `src-tauri/tests/fixtures/persistence/${dataName}`,
          output: database,
          version: userVersion
        });
        const result = spawnSync(
          "sqlite3",
          [
            database,
            "PRAGMA user_version; SELECT model FROM model_provider_settings WHERE id='default';"
          ],
          { encoding: "utf8" }
        );
        expect(result.status).toBe(0);
        expect(result.stdout.trim().split("\n")).toEqual([String(userVersion), expectedModel]);
      }
      const duplicate = spawnSync("sqlite3", [join(root, "v3.sqlite")], {
        input: 'ALTER TABLE "prompt_versions" ADD COLUMN "system_prompt_template" TEXT;',
        encoding: "utf8"
      });
      expect(duplicate.status).not.toBe(0);
      expect(duplicate.stderr).toMatch(/duplicate column/i);
    }
  );

  sqliteIt(
    "matches the workflow boundary: main tooling with immutable candidate data [requires sqlite3]",
    () => {
      const candidateFixtureCommit = "7a4a37a6cb0b960c825b37addca104139bca1628";
      const manifest = JSON.parse(
        readFileSync("src-tauri/tests/fixtures/persistence/historical-schema-manifest.json", "utf8")
      );
      const root = mkdtempSync(join(tmpdir(), "journey-workflow-boundary-"));
      const schemas = new Map();
      for (const [version, contract] of Object.entries(manifest)) {
        const historicalSource = spawnSync(
          "git",
          ["show", `${contract.sourceCommit}:src-tauri/src/persistence/schema.rs`],
          { encoding: "utf8" }
        );
        expect(historicalSource.status).toBe(0);
        const source = join(root, `${version}.rs`);
        const schema = join(root, `${version}.sql`);
        writeFileSync(source, historicalSource.stdout);
        extractHistoricalSchema({
          source,
          output: schema,
          migrations: contract.migrations,
          base: contract.baseVersion ? schemas.get(contract.baseVersion) : undefined
        });
        expect(createHash("sha256").update(readFileSync(schema)).digest("hex")).toBe(
          contract.extractedSha256
        );
        schemas.set(version, schema);
      }
      const fixtures = [
        ["v1", "v0_10.sql", 1, "fixture-model-v010", "projects", "id"],
        ["v2", "v0_11_early.sql", 2, "fixture-model-v011-early", "prompt_versions", "version"],
        [
          "v3",
          "v0_11_current.sql",
          3,
          "fixture-model-v011-current",
          "prompt_versions",
          "system_prompt_template"
        ]
      ];
      for (const [
        version,
        dataName,
        expectedVersion,
        expectedModel,
        expectedTable,
        expectedField
      ] of fixtures) {
        const candidateData = spawnSync(
          "git",
          ["show", `${candidateFixtureCommit}:src-tauri/tests/fixtures/persistence/${dataName}`],
          { encoding: "utf8" }
        );
        expect(candidateData.status).toBe(0);
        const data = join(root, dataName);
        const database = join(root, `${version}-candidate.sqlite`);
        writeFileSync(data, candidateData.stdout);
        createLegacyFixture({
          schema: schemas.get(version),
          data,
          output: database,
          version: expectedVersion
        });
        const probe = spawnSync(
          "sqlite3",
          [
            database,
            `PRAGMA user_version; SELECT model FROM model_provider_settings WHERE id='default'; SELECT COUNT(*) FROM pragma_table_info('${expectedTable}') WHERE name='${expectedField}';`
          ],
          { encoding: "utf8" }
        );
        expect(probe.status).toBe(0);
        expect(probe.stdout.trim().split("\n")).toEqual([
          String(expectedVersion),
          expectedModel,
          "1"
        ]);
      }
    }
  );
});
