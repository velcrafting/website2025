import assert from "node:assert/strict";

import { createModuleLoader } from "./_module-loader.mjs";

const env = {
  EDITOR_STORAGE_MODE: " POSTGRES ",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_SITE_URL: "https://preview.example/",
};
const loader = createModuleLoader({ env });
const { editorStorageMode } = loader.load("src/editor/storage-mode.ts");
const { currentEditorEnvironment, assertApprovalTarget } = loader.load(
  "src/editor/validation/target.ts",
);
const { postgresPlaceholders, postgresTarget } = loader.load(
  "src/editor/repository/postgres.ts",
);

assert.equal(editorStorageMode(env), "postgres");
assert.equal(currentEditorEnvironment(), "hosted_preview");
assert.equal(
  assertApprovalTarget("https://preview.example/", "hosted_preview"),
  "https://preview.example",
);
assert.throws(() => assertApprovalTarget("https://other.example/", "hosted_preview"));
env.NEXT_PUBLIC_SITE_URL = "https://user:pass@preview.example/";
assert.throws(() => assertApprovalTarget("https://preview.example/", "hosted_preview"));

env.EDITOR_STORAGE_MODE = "sqlite";
env.VERCEL = "0";
assert.equal(
  assertApprovalTarget("http://127.0.0.1:3410", "local_test"),
  "http://127.0.0.1:3410/",
);
assert.throws(() => assertApprovalTarget("https://preview.example/", "local_test"));

assert.equal(
  postgresPlaceholders(`SELECT ?, '?' AS literal, "?" AS identifier, ?`),
  `SELECT $1, '?' AS literal, "?" AS identifier, $2`,
);
assert.equal(
  postgresPlaceholders(`SELECT 'it''s ?' AS literal, ?`),
  `SELECT 'it''s ?' AS literal, $1`,
);
assert.doesNotThrow(() =>
  postgresTarget("postgresql://website_editor:test-only@db.eeddvwszyhcrjbvmcpow.supabase.co/postgres"),
);
assert.doesNotThrow(() =>
  postgresTarget("postgres://website_editor.eeddvwszyhcrjbvmcpow:test-only@aws-0-us-east-1.pooler.supabase.com/postgres"),
);
assert.throws(() =>
  postgresTarget("postgres://postgres:test-only@db.other-project.supabase.co/postgres"),
);
assert.throws(
  () => postgresTarget("malformed-url-with-credentials"),
  { message: "POSTGRES_URL is invalid" },
);

console.log("postgres adapter boundaries: passed");
