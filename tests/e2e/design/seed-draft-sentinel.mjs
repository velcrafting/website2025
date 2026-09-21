// tests/e2e/design/seed-draft-sentinel.mjs
//
// Plants the draft sentinel that verify-design.mjs needs to make its exclusion
// check meaningful. Planting is a WRITE, so this script carries the same
// server-binding guard as the other mutating checks: it proves the target is the
// fixture database before it sends anything that could change state.
//
// Run this only against an owned loopback fixture server, never the review server.
//
// Usage:
//   node tests/e2e/design/seed-draft-sentinel.mjs \
//     --origin=http://127.0.0.1:3410 --admin-key=<key> --db=<fixture db>

import { BindingError, establishServerBinding } from "../first-issue/_server-binding.mjs";

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const ORIGIN = args.get("origin") ?? "http://127.0.0.1:3410";
const ADMIN_KEY = args.get("admin-key");
const DB_PATH = args.get("db");
const SLUG = args.get("slug") ?? "planted-draft-sentinel";
const MIGRATIONS_DIR = new URL("../../../db/migrations", import.meta.url).pathname;
const SENTINEL = "DRAFT_LEAK_SENTINEL_9f3a";

if (!ADMIN_KEY) {
  console.error("--admin-key=<test-only key> is required");
  process.exit(2);
}
if (!DB_PATH) {
  console.error("--db=<disposable fixture database> is required");
  process.exit(2);
}

console.log(`\nseeding the draft sentinel on ${ORIGIN} (fixture db)\n`);

let binding;
try {
  binding = await establishServerBinding({
    origin: ORIGIN,
    adminKey: ADMIN_KEY,
    dbPath: DB_PATH,
    migrationsDir: MIGRATIONS_DIR,
  });
} catch (error) {
  if (error instanceof BindingError) {
    console.error(
      `\nBinding proof FAILED. Nothing was planted.\n  ${error.message}`,
    );
    process.exit(3);
  }
  throw error;
}
console.log(`  binding established: ${binding.origin} is serving ${binding.dbPath}\n`);

const response = await fetch(`${binding.origin}/api/editor/items`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: `admin=${ADMIN_KEY}` },
  body: JSON.stringify({
    slug: SLUG,
    title: "Planted Draft (never public)",
    summary: "Synthetic draft used to prove the public exclusion.",
    blocks: [
      {
        heading: "Draft",
        markdown: `${SENTINEL} must never reach a public route.`,
      },
    ],
  }),
});

const body = await response.text();
if (response.status === 201) {
  console.log(`  planted: /issues/${SLUG} created in the fixture database`);
} else if (response.status === 409) {
  console.log(`  already planted: /issues/${SLUG} exists in the fixture database`);
} else {
  console.error(`  FAILED to plant: status ${response.status} ${body.slice(0, 200)}`);
  process.exit(1);
}

// Confirm it is not publicly reachable, which is the property under test.
const publicCheck = await fetch(`${binding.origin}/issues/${SLUG}`, { redirect: "manual" });
if (publicCheck.status === 404) {
  console.log("  confirmed: the planted draft is not publicly reachable (404)");
} else {
  console.error(`  UNEXPECTED: the planted draft returned ${publicCheck.status} publicly`);
  process.exit(1);
}

console.log(
  `\nNow run: node tests/e2e/design/verify-design.mjs --origin=${binding.origin} --db=${binding.dbPath}`,
);
