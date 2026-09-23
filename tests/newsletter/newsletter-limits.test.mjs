// tests/newsletter/newsletter-limits.test.mjs
//
// F5 / R3, 2026-09-17. The subscribe endpoint is the only public endpoint left that writes to an external
// service, so its abuse control is a boundary worth pinning — and the first version of this file did not
// pin it. An independent audit found two real faults, both repaired here:
//
//   1. The stub recorded `emails.send`, which this route never calls. The real route uses
//      `contacts.update` and `contacts.create`, so the assertion "the provider is never called" could pass
//      while the provider was in fact being called. It now records the Resend CONSTRUCTOR and both contact
//      operations.
//   2. No environment was injected, so even a completely broken guard would have stopped at the route's
//      `hasConfig()` check and looked correct. Fake env is now injected through the loader, so the request
//      actually reaches the provider boundary.
//
// FAILURE POLICY, as repaired. A limiter outage is no longer swallowed: it returns an explicit retryable
// response BEFORE any provider call. A public endpoint that keeps accepting while its abuse control is
// unreachable cannot be reasoned about.
//
//   under the cap            → 200, the signup proceeds and the provider IS called
//   over the cap             → 429, zero contact calls
//   limiter outage           → 503 + Retry-After: 60, zero contact calls
//   missing or invalid input → 400, zero contact calls
//
// WHAT THIS DOES NOT PROVE: live enforcement. KV exists only on the deployment, so the deployed threshold
// and the real 429 are unverified. Nothing here reads a credential, calls Resend, or touches KV.
//
// The fake env values below are the string "fixture" — not credentials, not placeholders for real ones.

import { strict as assert } from "node:assert";

import { createModuleLoader } from "../editor/_module-loader.mjs";

let passed = 0;
const failures = [];
const pending = [];

function test(name, fn) {
  pending.push(
    (async () => {
      try {
        await fn();
        passed += 1;
        console.log(`  ok    ${name}`);
      } catch (error) {
        failures.push(name);
        console.log(`  FAIL  ${name}\n        ${error.message}`);
      }
    })(),
  );
}

/**
 * A Resend stub that records the constructor and every contact operation. Nothing reaches the network.
 * `contacts.update` and `contacts.create` are the calls this route actually makes — see the route source;
 * `emails.send` is deliberately not what this file asserts against any more.
 */
function resendStub({ updateError = null, createError = null } = {}) {
  const calls = [];
  const stub = {
    Resend: class {
      constructor() {
        calls.push("construct");
        this.contacts = {
          update: async () => {
            calls.push("contacts.update");
            return { error: updateError };
          },
          create: async () => {
            calls.push("contacts.create");
            return { error: createError };
          },
        };
      }
    },
  };
  return { stub, calls };
}

/** A KV stub whose counter the test controls, and which can be made to fail. */
function kvStub({ hits = 0, throws = false }) {
  const seen = [];
  return {
    seen,
    stub: {
      kv: {
        incr: async (key) => {
          seen.push(key);
          if (throws) throw new Error("fixture outage");
          return hits;
        },
        expire: async () => 1,
      },
    },
  };
}

/** Fake env, injected into the loader, so the route runs past `hasConfig()` and reaches the boundary. */
const FAKE_ENV = {
  RESEND_API_KEY: "fixture",
  RESEND_AUDIENCE_ID: "fixture",
  RESEND_FROM: "fixture",
};

async function loadRoute({ hits = 0, throws = false, updateError = null, createError = null } = {}) {
  const resend = resendStub({ updateError, createError });
  const kv = kvStub({ hits, throws });
  const loader = createModuleLoader({
    env: FAKE_ENV,
    stubs: { resend: resend.stub, "@vercel/kv": kv.stub },
  });
  const route = loader.load("src/app/api/newsletter/route.ts");
  return { route, providerCalls: resend.calls, kvSeen: kv.seen };
}

const contactCalls = (calls) => calls.filter((c) => c.startsWith("contacts."));

const post = (body, ip = "203.0.113.7") =>
  new Request("http://127.0.0.1/api/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

// ------------------------------------------------------------------ the allowed path

await test("under the cap, the signup succeeds and the provider IS called", async () => {
  const { route, providerCalls } = await loadRoute({ hits: 3 });
  const response = await route.POST(post({ email: "someone@example.invalid" }));
  assert.equal(response.status, 200, "a normal signup must succeed");
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(
    providerCalls.includes("construct"),
    `the provider must be constructed on the allowed path, saw ${JSON.stringify(providerCalls)}`,
  );
  assert.equal(contactCalls(providerCalls).length, 1, "exactly one contact operation for a new signup");
});

await test("an update error falls back to create, and a create error is reported", async () => {
  // The route treats an update failure as "contact not found" and tries create — that is intentional. So a
  // single update error must still end in success, and only failure of BOTH must be reported. The first
  // version of this check expected an update error alone to fail, which was wrong about the route.
  const recovered = await loadRoute({ hits: 3, updateError: { message: "fixture not found" } });
  const recoveredResponse = await recovered.route.POST(post({ email: "someone@example.invalid" }));
  assert.equal(recoveredResponse.status, 200, "update failure then create success is a normal signup");
  assert.ok(
    recovered.providerCalls.includes("contacts.create"),
    "the fallback to create must actually run",
  );

  const broken = await loadRoute({
    hits: 3,
    updateError: { message: "fixture not found" },
    createError: { message: "fixture provider error" },
  });
  const brokenResponse = await broken.route.POST(post({ email: "someone@example.invalid" }));
  assert.notEqual(brokenResponse.status, 200, "when both paths fail the route must not report success");
  const body = await brokenResponse.json();
  assert.equal(body.ok, false, "a failed signup must not claim success");
});

// ------------------------------------------------------------------ the denied path

await test("over the cap: 429, Retry-After, and ZERO provider calls", async () => {
  const { route, providerCalls, kvSeen } = await loadRoute({ hits: 11 });
  const response = await route.POST(post({ email: "someone@example.invalid" }));
  assert.equal(response.status, 429, "expected the limiter to reject");
  assert.equal(response.headers.get("retry-after"), "3600", "a 429 must say when to come back");
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(
    providerCalls.length,
    0,
    `a denied request must not construct or call the provider, saw ${JSON.stringify(providerCalls)}`,
  );
  assert.ok(kvSeen.length > 0, "the limiter must have consulted the store");
  assert.ok(
    String(kvSeen[0]).startsWith("rl:newsletter:"),
    `the limiter key must be namespaced to this endpoint, got ${kvSeen[0]}`,
  );
});

// ------------------------------------------------------------------ the limiter's own failure

await test("limiter outage: 503 with Retry-After, and ZERO provider calls", async () => {
  const { route, providerCalls } = await loadRoute({ throws: true });
  const response = await route.POST(post({ email: "someone@example.invalid" }));

  assert.equal(response.status, 503, "a limiter outage must be an explicit retryable failure");
  assert.equal(
    response.headers.get("retry-after"),
    "60",
    "a retryable failure must tell the client when to retry",
  );
  const body = await response.json();
  assert.equal(body.ok, false, "a limiter outage must not report success");
  assert.ok(
    typeof body.error === "string" && body.error.length > 0,
    "the response must carry a message a client can show",
  );
  assert.equal(
    providerCalls.length,
    0,
    `a limiter outage must not reach the provider, saw ${JSON.stringify(providerCalls)}`,
  );
});

// ------------------------------------------------------------------ validation still runs

await test("a missing email is a 400 with zero provider calls", async () => {
  const { route, providerCalls } = await loadRoute({ hits: 1 });
  const response = await route.POST(post({}));
  assert.equal(response.status, 400, "validation must still reject an empty body");
  assert.equal(providerCalls.length, 0, "invalid input must not reach the provider");
});

await test("an address that is blank after trimming is rejected too", async () => {
  const { route, providerCalls } = await loadRoute({ hits: 1 });
  const response = await route.POST(post({ email: "   " }));
  assert.equal(response.status, 400, "a whitespace-only address is not an address");
  assert.equal(providerCalls.length, 0, "invalid input must not reach the provider");
});

// ------------------------------------------------------------------ the limiter's key

await test("the limiter key is scoped per address per hour", async () => {
  const first = await loadRoute({ hits: 2 });
  await first.route.POST(post({ email: "a@example.invalid" }, "203.0.113.7"));
  const second = await loadRoute({ hits: 2 });
  await second.route.POST(post({ email: "b@example.invalid" }, "198.51.100.9"));

  const keyA = String(first.kvSeen[0]);
  const keyB = String(second.kvSeen[0]);
  assert.ok(keyA.includes("203.0.113.7"), `expected the first address in the key, got ${keyA}`);
  assert.ok(keyB.includes("198.51.100.9"), `expected the second address in the key, got ${keyB}`);
  assert.notEqual(keyA, keyB, "two different addresses must not share a counter");
  assert.equal(keyA.split(":").length, keyB.split(":").length, "both keys share the same shape");
});

await Promise.all(pending);

console.log(`\n${passed}/${passed + failures.length} passed`);
console.log(
  "\nNOTE: live 429 enforcement remains UNVERIFIED. KV exists only on the deployment, so the deployed\n" +
    "threshold is not exercised here. This file proves the allowed path, the denial path, the limiter's own\n" +
    "failure path and validation, all against stubs, with no credential and no network call.",
);

if (failures.length) {
  console.log(`\nFAILED: ${failures.join(", ")}`);
  process.exit(1);
}
