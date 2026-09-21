import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const tables = [
  "sources",
  "capture_events",
  "source_versions",
  "content_items",
  "content_revisions",
  "render_bundles",
  "approvals",
  "publication_intents",
  "publication_results",
  "outbox_jobs",
  "schema_migrations",
];

const [, , mode, sourceArg] = process.argv;
if (!["--plan", "--apply", "--verify"].includes(mode) || !sourceArg) {
  console.error("Usage: node scripts/editor-postgres-import.mjs --plan|--apply|--verify <sqlite-backup>");
  process.exit(2);
}

const connection = process.env.POSTGRES_URL ?? "";
if (!connection) throw new Error("POSTGRES_URL is required");
let target;
try {
  target = new URL(connection);
} catch {
  throw new Error("POSTGRES_URL is invalid");
}
const validTarget =
  (target.hostname === "db.eeddvwszyhcrjbvmcpow.supabase.co" && target.username === "website_editor") ||
  (target.hostname === "aws-0-us-east-1.pooler.supabase.com" && target.username === "website_editor.eeddvwszyhcrjbvmcpow");
if (!validTarget || !["postgres:", "postgresql:"].includes(target.protocol)) {
  throw new Error("POSTGRES_URL is not bound to the approved restricted database role");
}

const source = new DatabaseSync(resolve(sourceArg), { readOnly: true });
const sql = postgres(connection, { ssl: "require", max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });

function digest(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error("Unexpected SQLite schema identifier");
  return `"${value}"`;
}

function sortColumns(table, columns) {
  if (table === "content_revisions") return ["item_id", "revision_number"];
  const primary = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk);
  return primary.map((column) => column.name);
}

function sqliteRows(table) {
  const columns = source.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  const order = sortColumns(table, columns);
  const rows = source.prepare(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY ${order.map(quoteIdentifier).join(", ")}`).all();
  return { columns: columns.map((column) => column.name), rows };
}

async function postgresRows(table, columns, order) {
  const names = columns.map(quoteIdentifier).join(", ");
  return sql.unsafe(`SELECT ${names} FROM public.${quoteIdentifier(table)} ORDER BY ${order.map(quoteIdentifier).join(", ")}`, [], { prepare: false });
}

async function inspectTarget() {
  const result = new Map();
  for (const table of tables) {
    const { columns, rows: sourceRows } = sqliteRows(table);
    const keyColumns = sortColumns(table, source.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all());
    const targetRows = await postgresRows(table, columns, keyColumns);
    result.set(table, { columns, keyColumns, sourceRows, targetRows: Array.from(targetRows) });
  }
  return result;
}

async function main() {
  const check = source.prepare("PRAGMA integrity_check").get();
  if (check?.integrity_check !== "ok") throw new Error("Source SQLite backup failed integrity_check");
  const tablesPresent = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  if (tables.some((table) => !tablesPresent.has(table))) throw new Error("Source backup is missing a required table");

  const report = await inspectTarget();
  for (const data of report.values()) {
    const sourceDigest = digest(data.sourceRows);
    const targetDigest = digest(data.targetRows);
    if (mode === "--apply" && data.targetRows.length !== 0) {
      throw new Error("Import requires every target table to be empty; no rows were changed");
    }
    if (mode === "--verify" && (data.sourceRows.length !== data.targetRows.length || sourceDigest !== targetDigest)) {
      throw new Error("Source and hosted table digests differ");
    }
    if (mode === "--plan" && data.targetRows.length !== 0) {
      throw new Error("Plan requires every target table to be empty; inspect before importing");
    }
  }

  if (mode === "--apply") {
    await sql.begin(async (tx) => {
      await tx.unsafe(`LOCK TABLE ${tables.map((table) => `public.${quoteIdentifier(table)}`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`, [], { prepare: false });
      for (const table of tables) {
        const count = await tx.unsafe(`SELECT COUNT(*)::int AS n FROM public.${quoteIdentifier(table)}`, [], { prepare: false });
        if (Number(count[0]?.n) !== 0) throw new Error("Import target changed after preflight; transaction rolled back");
      }
      for (const [table, data] of report) {
        if (data.sourceRows.length === 0) continue;
        const columns = data.columns.map(quoteIdentifier).join(", ");
        const values = `(${data.columns.map((_, index) => `$${index + 1}`).join(", ")})`;
        const statement = `INSERT INTO public.${quoteIdentifier(table)} (${columns}) VALUES ${values}`;
        for (const row of data.sourceRows) {
          await tx.unsafe(statement, data.columns.map((column) => row[column]), { prepare: false });
        }
      }
    });
  }

  let after;
  if (mode !== "--plan") {
    after = await inspectTarget();
    for (const [table, data] of report) {
      const targetRows = after.get(table).targetRows;
      if (data.sourceRows.length !== targetRows.length || digest(data.sourceRows) !== digest(targetRows)) {
        throw new Error("Post-import verification failed; preserve the target for investigation");
      }
    }
  }

  for (const [table, data] of report) {
    const targetRows = mode === "--plan" ? data.targetRows : after.get(table).targetRows;
    const rows = mode === "--plan" ? data.sourceRows : targetRows;
    console.log(`${table}\trows=${rows.length}\tsha256=${digest(rows)}`);
  }
  console.log(`result=${mode === "--plan" ? "planned" : mode === "--apply" ? "imported-and-verified" : "verified"}`);
}

try {
  await main();
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "IMPORT_FAILED";
  console.error(`editor database operation stopped (${code}); no source content or connection details were printed`);
  process.exitCode = 1;
} finally {
  source.close();
  await sql.end({ timeout: 5 });
}
