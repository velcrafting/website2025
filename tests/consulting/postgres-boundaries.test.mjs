import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { createModuleLoader } from "../editor/_module-loader.mjs";

const fixtureModule = process.env.VELCRAFTING_PGLITE_MODULE;
if (!fixtureModule || !isAbsolute(fixtureModule)) throw new Error("Set VELCRAFTING_PGLITE_MODULE to an absolute local PGlite entrypoint. This suite never uses a database URL.");
const { PGlite } = await import(pathToFileURL(fixtureModule));
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

test("attempt is durable before fixture dispatch; duplicates, missing allowance and lost storage fail closed", async () => {
  const data = await mkdtemp(join(tmpdir(), "velcrafting-pg-"));
  let db = await PGlite.create(data);
  const sessionId = randomUUID();
  const submission = { sessionId, idempotencyKey: randomUUID(), input: "Fictional early question", instructionVersion: "fixture-v1", allowanceUnits: 1 };
  const query = (s, args = []) => db.query(s.replaceAll("@", "velcrafting_private."), args).then(result => result.rows);
  const store = {
    async prepare(s) {
      const [row] = await query("select * from @prepare_ai_attempt($1,$2,$3,$4,$5)", [s.sessionId, s.idempotencyKey, s.input, s.instructionVersion, s.allowanceUnits]);
      return { operationId: row.operation_id, attemptId: row.attempt_id, disposition: row.disposition };
    },
    async claim(attempt, session) {
      return (await query("select @claim_ai_dispatch($1,$2) as ok", [attempt, session]))[0].ok;
    },
    async finish(attempt, session, output) {
      return (await query("select @finish_ai_attempt($1,$2,$3) as ok", [attempt, session, output]))[0].ok;
    },
  };
  let dispatched = 0;
  let attempted;
  let dispatchProof;
  let concurrentDisposition;
  const dispatch = async (request) => {
    dispatched++;
    attempted = request.attemptId;
    await db.close();
    db = await PGlite.create(data);
    dispatchProof = {
      record: (await query("select provider, model, dispatched_at is not null as claimed from @ai_call_attempt where id=$1", [request.attemptId]))[0],
      baseURL: request.baseURL,
      input: (await query("select body from @ai_content where kind='submitted'"))[0].body,
    };
    concurrentDisposition = (await store.prepare({ ...submission, idempotencyKey: randomUUID(), input: "Fixture while busy" })).disposition;
    throw new Error("Simulated disconnect after physical dispatch");
  };
  try {
    await setup(db);
    await query("insert into @explorer_session values ($1, 'fixture-notice', now() + interval '1 hour')", [sessionId]);
    await query("insert into @ai_allowance (day,unit_limit) values ((now() at time zone 'UTC')::date,1)");
    const actual = await runRecordedAttempt(store, dispatch, submission);
    assert.equal(actual.disposition, "indeterminate");
    assert.ok(attempted);
    assert.equal(concurrentDisposition, "session_busy");
    assert.deepEqual(dispatchProof, {
      record: { provider: "command-code", model: "deepseek/deepseek-v4.1-flash", claimed: true },
      baseURL: "https://api.commandcode.ai/provider/v1",
      input: submission.input,
    });
    assert.equal(await store.claim(attempted, sessionId), false);
    assert.equal((await runRecordedAttempt(store, dispatch, submission)).disposition, "duplicate");
    await assert.rejects(runRecordedAttempt(store, dispatch, { ...submission, input: "different" }), /conflicts/);
    const refused = await runRecordedAttempt(store, dispatch, { ...submission, idempotencyKey: randomUUID(), input: "Fixture after limit" });
    assert.equal(refused.disposition, "allowance_unavailable");
    await assert.rejects(runRecordedAttempt({ ...store, prepare: async () => { throw new Error("storage offline"); } }, dispatch, submission), /storage offline/);
    await assert.rejects(runRecordedAttempt({ ...store, prepare: async () => ({ disposition: "prepared", attemptId: randomUUID() }), claim: async () => { throw new Error("commit acknowledgement missing"); } }, dispatch, submission), /acknowledgement missing/);
    assert.equal(dispatched, 1);
    assert.deepEqual(await query("select outcome,cost_state from @ai_call_attempt"), [{ outcome: "indeterminate", cost_state: "pending" }]);
    assert.equal((await query("select count(*)::integer as n from @ai_content where kind='submitted'"))[0].n, 3);
    assert.deepEqual((await query("select refused_reason from @ai_operation where refused_reason is not null order by refused_reason")).map(row => row.refused_reason), ["allowance_unavailable", "session_busy"]);
    await query("update @ai_allowance set unit_limit=2");
    const completed = await runRecordedAttempt(store, async () => "Fictional response", { ...submission, idempotencyKey: randomUUID() });
    assert.equal(completed.disposition, "completed");
    assert.deepEqual(await query("select a.cost_state,c.body from @ai_call_attempt a join @ai_content c on c.id=a.output_id"), [{ cost_state: "unavailable", body: "Fictional response" }]);
  } finally {
    await db.close();
    await rm(data, { recursive: true, force: true });
  }
});
