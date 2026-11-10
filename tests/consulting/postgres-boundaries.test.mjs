import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import postgres from "postgres";
import { createModuleLoader } from "../editor/_module-loader.mjs";

const { runRecordedAttempt } = createModuleLoader().load("src/consulting/server/recorded-attempt.ts");
const sql = (filename) => readFile(new URL("../../db/postgres/" + filename, import.meta.url), "utf8");

async function setup(db) {
  // These are stand-ins for Supabase-managed roles and the verified JWT subject.
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create role editorial;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(await sql("004-client-workspace-boundary.sql"));
  await db.exec(await sql("005-ai-attempt-ledger.sql"));
}

test("two tenants, phase grants, commercial projection and revocation at the SQL boundary", async () => {
  const db = await PGlite.create();
  const [staff, first, second, prospect, a, b, projectA, projectB, phaseA, phaseLater, phaseB, item] = Array.from({ length: 12 }, randomUUID);
  const query = (statement, ...args) => db.query(statement.replaceAll("@", "velcrafting_private."), args);
  try {
    await setup(db);
    for (const id of [staff, first, second, prospect]) {
      await query("insert into auth.users values ($1)", id);
      await query("insert into @profile values ($1)", id);
    }
    await query("insert into @client values ($1, 'Fiction A'), ($2, 'Fiction B')", a, b);
    await query("insert into @project values ($1,$2,'A project'), ($3,$4,'B project')", projectA, a, projectB, b);
    await query("insert into @engagement values ($1,$2,$3,'A first'), ($4,$2,$3,'A later'), ($5,$6,$7,'B first')", phaseA, a, projectA, phaseLater, phaseB, b, projectB);
    await assert.rejects(query("insert into @engagement values (gen_random_uuid(),$1,$2,'wrong parent')", b, projectA), { code: "23503" });
    await query("insert into @client_membership (client_id,user_id,granted_by) values ($1,$2,$5), ($3,$4,$5)", a, first, b, second, staff);
    await query("insert into @engagement_grant (client_id,engagement_id,user_id,commercial,granted_by) values ($1,$2,$3,false,$7), ($4,$5,$6,true,$7)", a, phaseA, first, b, phaseB, second, staff);
    await assert.rejects(query("insert into @engagement_grant (client_id,engagement_id,user_id,granted_by) values ($1,$2,$3,$4)", b, phaseB, first, staff), { code: "23503" });
    await query("insert into @published_revision (engagement_id,item_id,version,title,body,published_by) values ($1,$4,1,'A update','{}',$5), ($2,$4,1,'A later update','{}',$5), ($3,$4,1,'B update','{}',$5)", phaseA, phaseLater, phaseB, item, staff);
    await query(`insert into @issued_terms values ($1,$3,1,'{"basis":"A private basis"}'), ($2,$3,1,'{"basis":"B private basis"}')`, phaseA, phaseB, item);
    await assert.rejects(query("update @issued_terms set terms='{}' where engagement_id=$1", phaseB), { code: "55000" });
    await assert.rejects(query("delete from @published_revision where engagement_id=$1", phaseLater), { code: "55000" });

    async function as(user, action) {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      try { await action(); } finally { await db.exec("reset role"); }
    }
    await as(first, async () => {
      assert.deepEqual((await query("select title from @published_revision")).rows, [{ title: "A update" }]);
      assert.deepEqual((await query("select title from @published_revision where engagement_id=$1", phaseB)).rows, []);
      assert.deepEqual((await query("select terms from @issued_terms where engagement_id=$1", phaseA)).rows, []);
      await assert.rejects(query("select body from @ai_content"), { code: "42501" });
    });
    await as(second, async () => {
      assert.deepEqual((await query("select terms from @issued_terms")).rows, [{ terms: { basis: "B private basis" } }]);
      assert.deepEqual((await query("select title from @engagement")).rows, [{ title: "B first" }]);
    });
    await as(prospect, async () => assert.deepEqual((await query("select title from @engagement")).rows, []));
    await query("update @client_membership set revoked_at=now() where user_id=$1", first);
    await as(first, async () => assert.deepEqual((await query("select title from @published_revision")).rows, []));
    await query("update @client_membership set revoked_at=null where user_id=$1", first);
    await as(first, async () => assert.deepEqual((await query("select title from @published_revision")).rows, []));
    for (const role of ["anon", "editorial", "service_role"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(query("select body from @ai_content"), { code: "42501" });
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});

const responseEvidence = {
  source: "provider_response",
  cost_state: "unavailable",
  provider_request_id: "fixture-provider-id",
  actual_model: "deepseek/deepseek-v4.1-flash",
  input_tokens: 19,
  output_tokens: 7,
  cached_input_tokens: 3,
};

function attemptHarness(database) {
  const query = (s, ...args) => database().query(s.replaceAll("@", "velcrafting_private."), args).then(result => result.rows);
  const first = async (s, ...args) => (await query(s, ...args))[0];
  const sessionId = randomUUID();
  const submit = (overrides = {}) => ({
    sessionId, idempotencyKey: randomUUID(), input: "Fictional early question", instructionVersion: "fixture-v1", allowanceUnits: 1, ...overrides,
  });
  const store = {
    async prepare(s) {
      const row = await first("select * from @prepare_ai_attempt($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        s.sessionId, s.idempotencyKey, s.input, s.instructionVersion, s.allowanceUnits,
        s.context ?? null, s.retry?.kind ?? null, s.retry?.previousAttemptId ?? null, s.payloadExpiresAt ?? null);
      return { operationId: row.operation_id, attemptId: row.attempt_id, disposition: row.disposition };
    },
    async claim(attempt, session) {
      return (await first("select @claim_ai_dispatch($1,$2) as ok", attempt, session)).ok;
    },
    async receive(attempt, session, evidence) {
      return (await first("select @record_ai_response($1,$2,$3) as ok", attempt, session, evidence)).ok;
    },
    async markUnknown(attempt, session, failure) {
      return (await first("select @mark_ai_attempt_unknown($1,$2,$3) as ok", attempt, session, failure)).ok;
    },
    async finish(attempt, session, output) {
      return (await first("select @finish_ai_attempt($1,$2,$3) as ok", attempt, session, output)).ok;
    },
  };
  return {
    first, query, sessionId, submit, store,
    async seed(limit = 10) {
      await query("insert into @explorer_session (id, notice_version, expires_at) values ($1, 'fixture-notice', now() + interval '1 hour')", sessionId);
      await query("insert into @ai_allowance (day,unit_limit) values ((now() at time zone 'UTC')::date,$1)", limit);
    },
  };
}

test("a committed attempt survives reopen before transport, and storage faults never dispatch", async () => {
  const data = await mkdtemp(join(tmpdir(), "velcrafting-pg-"));
  let db = await PGlite.create(data);
  const h = attemptHarness(() => db);
  const submission = h.submit({ context: JSON.stringify([{ role: "user", content: "Fictional early question" }]) });
  let dispatched = 0;
  try {
    await setup(db);
    await h.seed(1);
    const actual = await runRecordedAttempt(h.store, async (request) => {
      dispatched++;
      await db.close();
      db = await PGlite.create(data);
      const proof = await h.first(`select a.provider, a.model, a.dispatch_claimed_at is not null as claimed,
        c.body, o.notice_version, o.instruction_version from @ai_call_attempt a
        join @ai_content c on c.id=a.input_context_id join @ai_operation o on o.id=a.operation_id where a.id=$1`, request.attemptId);
      assert.deepEqual(proof, {
        provider: "command-code", model: "deepseek/deepseek-v4.1-flash", claimed: true, body: request.context,
        notice_version: "fixture-notice", instruction_version: "fixture-v1",
      });
      assert.equal(request.baseURL, "https://api.commandcode.ai/provider/v1");
      return { output: "Fictional reply", evidence: responseEvidence };
    }, submission);
    assert.equal(actual.disposition, "completed");
    assert.equal((await runRecordedAttempt(h.store, () => assert.fail("duplicate dispatched"), submission)).disposition, "duplicate");
    await assert.rejects(runRecordedAttempt(h.store, () => assert.fail("conflicting operation dispatched"), { ...submission, input: "different" }), /conflicts/);
    const refused = await runRecordedAttempt(h.store, () => assert.fail("exhausted allowance dispatched"), h.submit());
    assert.equal(refused.disposition, "allowance_unavailable");
    await assert.rejects(runRecordedAttempt({ ...h.store, prepare: async () => { throw new Error("storage offline"); } },
      () => assert.fail("missing preparation dispatched"), h.submit()), /storage offline/);
    assert.equal(dispatched, 1);
    assert.deepEqual(await h.first("select count(*)::integer as n from @ai_call_attempt"), { n: 1 });
    assert.equal((await h.first("select cost_state from @ai_usage_evidence")).cost_state, "unavailable");
  } finally {
    await db.close();
    await rm(data, { recursive: true, force: true });
  }
});

test("prepared attempts recover after expiry, invalidation or UTC rollover without recording a send", async () => {
  const db = await PGlite.create();
  const h = attemptHarness(() => db);
  try {
    await setup(db);
    await h.seed(1);
    const initial = h.submit();
    const expired = await h.store.prepare(initial);
    await h.query("update @ai_call_attempt set lease_expires_at=now()-interval '1 second' where id=$1", expired.attemptId);
    assert.equal(await h.store.claim(expired.attemptId, h.sessionId), false);
    assert.deepEqual(await h.first("select local_outcome, failure_category, dispatch_claimed_at, reservation_state from @ai_call_attempt where id=$1", expired.attemptId), {
      local_outcome: "preparation_invalidated", failure_category: "preparation_expired", dispatch_claimed_at: null, reservation_state: "released",
    });
    assert.equal((await h.store.prepare(initial)).disposition, "duplicate");
    const retry = await h.store.prepare({ ...initial, retry: { kind: "retry", previousAttemptId: expired.attemptId } });
    assert.equal(retry.disposition, "prepared");
    assert.equal(retry.operationId, expired.operationId);
    assert.notEqual(retry.attemptId, expired.attemptId);
    await h.query("insert into @ai_allowance (day,unit_limit,units_reserved) values ((now() at time zone 'UTC')::date-1,1,1)");
    await h.query("update @ai_allowance set units_reserved=0 where day=(now() at time zone 'UTC')::date");
    await h.query("update @ai_call_attempt set reserved_day=reserved_day-1 where id=$1", retry.attemptId);
    const afterMidnight = await h.store.prepare(h.submit());
    assert.equal(afterMidnight.disposition, "prepared");
    assert.deepEqual(await h.first("select failure_category, dispatch_claimed_at, reservation_state from @ai_call_attempt where id=$1", retry.attemptId), {
      failure_category: "reservation_day_rolled", dispatch_claimed_at: null, reservation_state: "released",
    });
    await h.query("update @explorer_session set invalidated_at=now() where id=$1", h.sessionId);
    assert.equal((await h.store.prepare(h.submit())).disposition, "session_unavailable");
    assert.equal(await h.store.claim(afterMidnight.attemptId, h.sessionId), false);
    assert.deepEqual(await h.first("select failure_category, dispatch_claimed_at, reservation_state from @ai_call_attempt where id=$1", afterMidnight.attemptId), {
      failure_category: "session_invalidated", dispatch_claimed_at: null, reservation_state: "released",
    });
    assert.ok((await h.query("select units_reserved from @ai_allowance")).every(row => row.units_reserved === 0));
  } finally { await db.close(); }
});

test("lost claim acknowledgment and unknown execution never replay or prematurely release a reservation", async () => {
  const db = await PGlite.create();
  const h = attemptHarness(() => db);
  try {
    await setup(db);
    await h.seed(2);
    const initial = h.submit();
    let attemptId;
    const noDispatch = () => assert.fail("ambiguous attempt replayed");
    await assert.rejects(runRecordedAttempt({
      ...h.store,
      claim: async (id, session) => {
        attemptId = id;
        assert.equal(await h.store.claim(id, session), true);
        throw new Error("claim commit acknowledgment lost");
      },
    }, noDispatch, initial), /acknowledgment lost/);
    assert.equal((await runRecordedAttempt(h.store, noDispatch, initial)).disposition, "duplicate");
    assert.equal((await runRecordedAttempt(h.store, noDispatch, h.submit())).disposition, "session_busy");
    await h.query("update @ai_call_attempt set lease_expires_at=now()-interval '1 second' where id=$1", attemptId);
    assert.equal((await h.first("select @recover_ai_attempts($1) as changed", h.sessionId)).changed, true);
    assert.deepEqual(await h.first("select local_outcome, provider_execution, reservation_state from @ai_call_attempt where id=$1", attemptId), {
      local_outcome: "indeterminate", provider_execution: "unknown", reservation_state: "held",
    });
    assert.equal((await h.first("select units_reserved from @ai_allowance")).units_reserved, 1);
    const fresh = await h.store.prepare(h.submit());
    assert.equal(fresh.disposition, "prepared");
    assert.equal((await h.first("select units_reserved from @ai_allowance")).units_reserved, 2);
    await h.query("update @ai_call_attempt set lease_expires_at=now()-interval '1 second' where id=$1", fresh.attemptId);
    assert.equal((await h.store.prepare({ ...initial, retry: { kind: "retry", previousAttemptId: attemptId } })).disposition, "retry_refused");
    assert.equal((await h.first("select units_reserved from @ai_allowance")).units_reserved, 1);
    assert.equal((await h.first("select @reconcile_ai_attempt($1,$2,'not_executed',$3) as ok", attemptId, h.sessionId, {
      source: "provider_reconciliation", cost_state: "unavailable", provider_request_id: "fixture-reconciliation",
    })).ok, true);
    assert.equal((await h.first("select units_reserved from @ai_allowance")).units_reserved, 0);
    const retry = await h.store.prepare({ ...initial, retry: { kind: "retry", previousAttemptId: attemptId } });
    assert.equal(retry.disposition, "prepared");
    assert.equal(await h.store.claim(retry.attemptId, h.sessionId), true);
    assert.equal(await h.store.markUnknown(retry.attemptId, h.sessionId, "provider_unconfirmed"), true);
    assert.equal((await h.store.prepare(h.submit())).disposition, "session_busy");
  } finally { await db.close(); }
});

test("output loss keeps usage evidence, and a lost output commit acknowledgment retries persistence only", async () => {
  const db = await PGlite.create();
  const h = attemptHarness(() => db);
  try {
    await setup(db);
    await h.seed();
    const lost = await h.store.prepare(h.submit());
    assert.equal(await h.store.claim(lost.attemptId, h.sessionId), true);
    assert.equal(await h.store.receive(lost.attemptId, h.sessionId, responseEvidence), true);
    await h.query("update @ai_call_attempt set lease_expires_at=now()-interval '1 second' where id=$1", lost.attemptId);
    assert.equal((await h.first("select @recover_ai_attempts($1) as changed", h.sessionId)).changed, true);
    assert.deepEqual(await h.first("select local_outcome, provider_execution, reservation_state, output_id from @ai_call_attempt where id=$1", lost.attemptId), {
      local_outcome: "output_unavailable", provider_execution: "returned", reservation_state: "consumed", output_id: null,
    });
    assert.equal((await h.first("select input_tokens from @ai_usage_evidence where attempt_id=$1", lost.attemptId)).input_tokens, 19);

    let sends = 0;
    let writes = 0;
    const submission = h.submit();
    const actual = await runRecordedAttempt({
      ...h.store,
      async finish(...args) {
        writes++;
        const saved = await h.store.finish(...args);
        if (writes === 1) throw new Error("output committed but acknowledgment lost");
        return saved;
      },
    }, async () => {
      sends++;
      return { output: "Fixture answer", evidence: responseEvidence };
    }, submission);
    assert.equal(actual.disposition, "completed");
    assert.equal(sends, 1);
    assert.equal(writes, 2);
    assert.equal((await h.first("select count(*)::integer as n from @ai_content where kind='output'")).n, 1);
    const completed = await h.first("select id from @ai_call_attempt where operation_id=$1", actual.operationId);
    const repair = await h.store.prepare({ ...submission, instructionVersion: "fixture-repair-v1", retry: { kind: "repair", previousAttemptId: completed.id } });
    assert.equal(repair.operationId, actual.operationId);
    assert.notEqual(repair.attemptId, completed.id);
    assert.deepEqual(await h.first("select retry_kind, sequence, instruction_version from @ai_call_attempt where id=$1", repair.attemptId), {
      retry_kind: "repair", sequence: 2, instruction_version: "fixture-repair-v1",
    });
  } finally { await db.close(); }
});

test("expiry tombstones bodies and digest while retaining estimates, verified usage and reminder suppression", async () => {
  const db = await PGlite.create();
  const h = attemptHarness(() => db);
  try {
    await setup(db);
    await h.seed();
    const initial = h.submit({ context: "Exact fictional provider context" });
    const response = await runRecordedAttempt(h.store, async () => ({
      output: "Fictional result",
      evidence: {
        ...responseEvidence, source: "documented_estimate", cost_state: "estimated",
        amount: 0.05, currency: "USD", rate_basis: "fictional-rate-v1",
      },
    }), initial);
    const attempt = await h.first("select id from @ai_call_attempt where operation_id=$1", response.operationId);
    assert.equal((await h.first("select @reconcile_ai_attempt($1,$2,'executed',$3) as ok", attempt.id, h.sessionId, {
      source: "provider_reconciliation", cost_state: "verified", provider_units: 7, provider_unit_name: "fixture-credits",
      provider_request_id: "fixture-provider-id",
    })).ok, true);
    await h.query("update @ai_content set expires_at=now()-interval '1 second' where session_id=$1", h.sessionId);
    assert.equal((await h.first("select @expire_ai_payloads($1) as n", h.sessionId)).n, 3);
    const contents = await h.query("select kind, body, expired_at is not null as expired from @ai_content order by kind");
    assert.deepEqual(contents, ["context", "output", "submitted"].map(kind => ({ kind, body: null, expired: true })));
    assert.equal((await h.first("select input_sha256 from @ai_operation")).input_sha256, null);
    assert.equal((await h.first("select reminder_suppressed_at is not null as suppressed from @explorer_session")).suppressed, true);
    assert.equal((await h.store.prepare(initial)).disposition, "duplicate");
    assert.equal(await h.store.finish(attempt.id, h.sessionId, "Fictional result"), false);
    assert.equal((await h.first("select @expire_ai_payloads($1) as n", h.sessionId)).n, 0);
    assert.deepEqual(await h.query("select stage, cost_state, amount, provider_units, provider_unit_name from @ai_usage_evidence order by stage"), [
      { stage: "reconciliation", cost_state: "verified", amount: null, provider_units: "7.000000", provider_unit_name: "fixture-credits" },
      { stage: "response", cost_state: "estimated", amount: "0.050000", provider_units: null, provider_unit_name: null },
    ]);
    assert.equal((await h.store.prepare(h.submit())).disposition, "prepared");
    assert.equal((await h.first("select reminder_suppressed_at is not null as suppressed from @explorer_session")).suppressed, true);
  } finally { await db.close(); }
});

const nativeBin = process.env.VELCRAFTING_NATIVE_PG_BIN;
test("native PostgreSQL serializes competing connections for the final allowance unit", {
  skip: nativeBin ? false : "Set VELCRAFTING_NATIVE_PG_BIN to a local PostgreSQL bin directory to run against a disposable native instance.",
}, async () => {
  const root = await mkdtemp("/tmp/velcrafting-pg-");
  const data = join(root, "data");
  const port = 5432;
  const run = (program, ...args) => promisify(execFile)(join(nativeBin, program), args, { timeout: 20_000 });
  const clients = [];
  let started = false;
  try {
    await run("initdb", "-D", data, "-U", "postgres", "--auth=trust", "--no-locale");
    await appendFile(join(data, "postgresql.conf"),
      `\nlisten_addresses = ''\nunix_socket_directories = '${root}'\nport = ${port}\n`);
    await run("pg_ctl", "-D", data, "-l", join(root, "server.log"), "-w", "start");
    started = true;
    for (let i = 0; i < 3; i++) clients.push(postgres({
      path: join(root, `.s.PGSQL.${port}`),
      database: "postgres", username: "postgres", password: "", ssl: false, max: 1,
    }));
    const [admin, first, second] = clients;
    await setup({ exec: (statement) => admin.unsafe(statement) });
    const [sessionA, sessionB] = [randomUUID(), randomUUID()];
    await admin`insert into velcrafting_private.explorer_session (id, notice_version, expires_at)
      values (${sessionA}, 'fixture-notice', now() + interval '1 hour'),
             (${sessionB}, 'fixture-notice', now() + interval '1 hour')`;
    await admin`insert into velcrafting_private.ai_allowance (day, unit_limit)
      values ((now() at time zone 'UTC')::date, 1)`;
    const [{ pid }] = await second`select pg_backend_pid() as pid`;
    let pending;
    await first.begin(async tx => {
      const [reserved] = await tx`select disposition from velcrafting_private.prepare_ai_attempt(
        ${sessionA}, ${randomUUID()}, 'fictional A', 'fixture-v1', 1)`;
      assert.equal(reserved.disposition, "prepared");
      pending = second`select disposition from velcrafting_private.prepare_ai_attempt(
        ${sessionB}, ${randomUUID()}, 'fictional B', 'fixture-v1', 1)`.execute();
      pending.catch(() => {});
      let blocked = false;
      for (let poll = 0; poll < 80 && !blocked; poll++) {
        [{ blocked }] = await admin`select cardinality(pg_blocking_pids(${pid})) > 0 as blocked`;
        if (!blocked) await setTimeout(25);
      }
      assert.equal(blocked, true, "the second connection must contend on the uncommitted allowance row");
    });
    const [refused] = await pending;
    assert.equal(refused.disposition, "allowance_unavailable");
    const [allowance] = await admin`select units_reserved from velcrafting_private.ai_allowance`;
    const [attempts] = await admin`select count(*)::integer as n from velcrafting_private.ai_call_attempt`;
    assert.equal(allowance.units_reserved, 1);
    assert.equal(attempts.n, 1);
  } finally {
    await Promise.all(clients.map(client => client.end({ timeout: 3 })));
    if (started) await run("pg_ctl", "-D", data, "-m", "immediate", "-w", "stop");
    await rm(root, { recursive: true, force: true });
  }
});
