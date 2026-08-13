import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function runSqlite(path, sql) {
  const result = spawnSync("sqlite3", [path], { input: sql, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(result.stderr || "sqlite3 fixture creation failed");
}

function schemaDefinesColumn(sql, table, column) {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const create = new RegExp(
    `CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+["\\[]?${escapedTable}["\\]]?\\s*\\(([\\s\\S]*?)\\);`,
    "i"
  ).exec(sql);
  if (!create) return false;
  const escapedColumn = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[,\\n])\\s*["\\[]?${escapedColumn}["\\]]?\\s+`, "i").test(create[1]);
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    current += character;
    if (quote) {
      if (character === quote && sql[index + 1] === quote) {
        current += sql[index + 1];
        index += 1;
      } else if (character === quote) quote = null;
    } else if (character === "'" || character === '"') quote = character;
    else if (character === ";") {
      statements.push(current.slice(0, -1).trim());
      current = "";
    }
  }
  if (current.trim()) throw new Error("Historical fixture contains an unterminated SQL statement.");
  return statements.filter(Boolean);
}

export function extractSeedData(sql) {
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) throw new Error("Historical fixture contains no seed data.");
  for (const statement of statements) {
    if (!/^(?:INSERT|UPDATE)\b/i.test(statement.trim())) {
      throw new Error(
        `Historical fixture contains unsupported non-data SQL: ${statement.slice(0, 80)}`
      );
    }
  }
  return `${statements.map((statement) => `${statement};`).join("\n")}\n`;
}

export function createLegacyFixture({ schema, data, output, version }) {
  const path = resolve(output);
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { force: true });
  runSqlite(
    path,
    `${readFileSync(resolve(schema), "utf8")}\n${extractSeedData(readFileSync(resolve(data), "utf8"))}\nPRAGMA user_version=${Number(version)};`
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
      .filter((column) => !schemaDefinesColumn(sql, column[1], column[2]))
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
