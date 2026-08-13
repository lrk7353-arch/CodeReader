import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function runSqlite(path, sql) {
  const result = spawnSync("sqlite3", [path], { input: sql, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(result.stderr || "sqlite3 fixture creation failed");
}

export function createLegacyFixture({ schema, data, output, version }) {
  const path = resolve(output);
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { force: true });
  runSqlite(
    path,
    `${readFileSync(resolve(schema), "utf8")}\n${readFileSync(resolve(data), "utf8")}\nPRAGMA user_version=${Number(version)};`
  );
  return path;
}

export function extractHistoricalSchema({ source, output, migrations, base }) {
  const rust = readFileSync(resolve(source), "utf8");
  let sql = base
    ? `${readFileSync(resolve(base), "utf8")}\n-- Incremental immutable historical migration.\n`
    : "-- Extracted from an immutable historical CodeReader schema source.\n";
  for (const name of String(migrations).split(",")) {
    const start = rust.indexOf(`fn ${name}(`);
    const end = rust.indexOf("\nfn ", start + 4);
    if (start < 0) throw new Error(`Historical migration missing: ${name}`);
    const body = rust.slice(start, end < 0 ? undefined : end);
    const batches = [...body.matchAll(/execute_batch\(\s*"([\s\S]*?)"\s*,?\s*\)/g)];
    const columns = [
      ...body.matchAll(/ensure_column\(\s*conn,\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\s*,?\s*\)\?/g)
    ];
    if (batches.length < 1 && columns.length < 1) {
      throw new Error(`Historical migration has no extractable schema operation: ${name}`);
    }
    sql += `${batches.map((batch) => batch[1]).join("\n")}\n`;
    sql += columns
      .map((column) => `ALTER TABLE "${column[1]}" ADD COLUMN "${column[2]}" ${column[3]};`)
      .join("\n");
    sql += "\n";
  }
  writeFileSync(resolve(output), sql);
}

const values = Object.fromEntries(
  process.argv.slice(2).reduce((all, value, index, argv) => {
    if (index % 2 === 0) all.push([value.replace(/^--/, ""), argv[index + 1]]);
    return all;
  }, [])
);
if (process.argv[1]?.endsWith("native-journey-fixture.mjs")) {
  if (values.source) extractHistoricalSchema(values);
  else createLegacyFixture(values);
}
