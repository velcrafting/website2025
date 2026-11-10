import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadWorkspaceSchema, seedWorkspace } from "./workspace-fixture/schema.mjs";

async function withWorkspace(action) {
  const db = await PGlite.create();
  const query = async (statement, ...args) => (await db.query(statement.replaceAll("@", "velcrafting_private."), args)).rows;
  const first = async (...args) => (await query(...args))[0];
  async function as(role, identity, work) {
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      if (identity) await query("select set_config('request.jwt.claim.sub',$1,true)", identity);
      const result = await work();
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }
  try {
    await loadWorkspaceSchema((sql) => db.exec(sql));
    const id = await seedWorkspace(query);
    await action({ id, query, first, as, who: (person, work) => as("authenticated", id[person], work) });
  } finally { await db.close(); }
}

test("actual workspace policies isolate phase, tenant and commercial file/export projections", () => withWorkspace(async ({ id, query, as, who }) => {
  await who("viewer", async () => {
    assert.deepEqual(await query("select id from @engagement"), [{ id: id.alpha }]);
    assert.deepEqual(await query("select title from @project"), [{ title: "Alpha Project" }]);
    assert.deepEqual(await query("select filename from @workspace_file order by filename"), [{ filename: "alpha-delivery.txt" }]);
    assert.deepEqual(await query("select id,bytes from @workspace_file where id in ($1,$2)", id.betaFile, id.commercialFile), []);
    assert.deepEqual(await query("select title,body from @published_revision where engagement_id=$1", id.beta), []);
    assert.deepEqual(await query("select terms from @issued_terms where engagement_id=$1", id.alpha), []);
    assert.deepEqual(await query("select capability from @staff_access"), []);
  });
  await who("commercial", async () => {
    assert.deepEqual(await query("select terms from @issued_terms where engagement_id=$1", id.alpha),
      [{ terms: { text: "FICTION_ALPHA_COMMERCIAL" } }]);
    assert.deepEqual(await query("select filename from @workspace_file order by filename"),
      [{ filename: "alpha-commercial.txt" }, { filename: "alpha-delivery.txt" }]);
    assert.deepEqual(await query("select id from @workspace_file where id=$1", id.betaFile), []);
  });
  await who("betaUser", async () => assert.deepEqual(await query("select id from @workspace_file"), [{ id: id.betaFile }]));
  await who("prospect", async () => assert.deepEqual(await query("select id from @engagement"), []));
  for (const role of ["anon", "editorial"]) {
    await assert.rejects(as(role, null, () => query("select filename from @workspace_file")), { code: "42501" });
  }
  await query("update @client_membership set revoked_at=now() where user_id=$1", id.viewer);
  await who("viewer", async () => assert.deepEqual(await query("select id from @workspace_file where id=$1", id.ordinaryFile), []));
  await assert.rejects(query(`insert into @workspace_file(engagement_id,item_id,version,filename,media_type,bytes)
    values($1,$2,1,'fiction.txt','text/plain',convert_to('fiction','UTF8'))`, id.beta, id.proposal), { code: "23503" });
}));

test("named draft, issue and agreement capabilities are distinct and exact revisions survive amendment", () => withWorkspace(async ({ id, query, first, who }) => {
  const item = randomUUID();
  const save = (person, target, expected, stage, title, text, terms = null) => who(person, async () =>
    (await first("select @save_workspace_draft($1,$2,$3,$4,$5,$6,$7) as result", target, item, expected, stage, title, { sections: [{ label: "Outcome", text }] }, terms)).result);
  const issue = (person, candidate, prior, retry) => who(person, async () =>
    (await first("select @publish_workspace_draft($1,$2,$3,$4,$5) as result", id.alpha, item, candidate, prior, retry)).result);
  assert.equal(await save("viewer", id.alpha, 0, "proposal", "Fictional proposal", "unauthorized"), -1);
  assert.equal(await save("drafter", id.beta, 0, "proposal", "Fictional proposal", "cross tenant"), -1);
  assert.equal(await save("drafter", id.alpha, 0, "proposal", "Fictional proposal", "draft", { text: "unauthorized terms" }), -1);
  assert.equal(await save("drafter", id.alpha, 0, "proposal", "Fictional proposal", "initial draft"), 1);
  assert.equal(await save("issuer", id.alpha, 0, "proposal", "Fictional proposal", "stale edit"), -2);
  assert.equal(await save("issuer", id.alpha, 1, "proposal", "Fictional proposal", "revision two", { text: "FICTION_ISSUED_ONLY" }), 2);
  assert.equal(await issue("drafter", 2, 0, randomUUID()), -1);
  assert.equal(await issue("issuer", 1, 0, randomUUID()), -2);
  const retry = randomUUID();
  assert.equal(await issue("issuer", 2, 0, retry), 2);
  assert.equal(await issue("issuer", 2, 0, retry), 2);
  assert.equal(await issue("issuer", 2, 0, randomUUID()), -2);
  await who("viewer", async () => {
    assert.deepEqual(await query("select item_id from @workspace_draft"), []);
    assert.deepEqual(await query("select terms from @issued_terms"), []);
    assert.deepEqual(await query("select title from @published_revision where item_id=$1", item), [{ title: "Fictional proposal" }]);
  });
  await who("commercial", async () => assert.deepEqual(await query("select terms from @issued_terms where item_id=$1", item),
    [{ terms: { text: "FICTION_ISSUED_ONLY" } }]));

  const agree = (person, exactItem, version, authority, parentItem = null, parentVersion = null) => who(person, async () =>
    (await first(`select @record_workspace_agreement($1,$2,$3,$4,clock_timestamp(),
      'Fictional signed approval received from delegated sponsor',$5,$6) as result`, id.alpha, exactItem, version, authority, parentItem, parentVersion)).result);
  assert.equal(await agree("issuer", id.proposal, 1, id.authority), false);
  assert.equal(await agree("recorder", id.proposal, 1, id.betaAuthority), false);
  assert.equal(await agree("recorder", item, 1, id.authority), false);
  assert.equal(await agree("recorder", id.proposal, 1, id.authority), true);
  assert.equal(await save("issuer", id.alpha, 2, "proposal", "Fictional proposal", "unissued revision three", { text: "FICTION_UNISSUED" }), 3);
  assert.equal(await agree("recorder", item, 3, id.authority, id.proposal, 1), false);
  assert.equal(await agree("recorder", item, 2, id.authority), false);
  assert.equal(await agree("recorder", item, 2, id.authority, id.proposal, 1), true);
  await assert.rejects(query("update @workspace_agreement set evidence_ref='Changed approval' where item_id=$1", id.proposal), { code: "55000" });
  await assert.rejects(query("update @issued_terms set terms='{}' where item_id=$1", id.proposal), { code: "55000" });
  assert.deepEqual(await query("select item_id,version,parent_item,parent_version from @workspace_agreement order by recorded_at"), [
    { item_id: id.proposal, version: 1, parent_item: null, parent_version: null },
    { item_id: item, version: 2, parent_item: id.proposal, parent_version: 1 },
  ]);
  assert.deepEqual(await query("select terms from @issued_terms where item_id=$1 order by version", item), [{ terms: { text: "FICTION_ISSUED_ONLY" } }]);
}));

test("runtime prospect claim and brief save keep session identity and revision independent from client grants", () => withWorkspace(async ({ id, first, query, as, who }) => {
  const [a, b, brief] = [randomUUID(), randomUUID(), randomUUID()];
  await as("velcrafting_runtime", null, async () => {
    await query(`insert into @explorer_session(id,notice_version,expires_at,capability_sha256)
      values($1,'not-accepted',now()+interval '1 hour',repeat('1',64)),($2,'not-accepted',now()+interval '1 hour',repeat('2',64))`, a, b);
    const claim = async (session, person) => (await first("select @claim_prospect($1,$2,'fictional@example.invalid') as ok", session, person)).ok;
    assert.equal(await claim(a, id.prospect), true);
    assert.equal(await claim(a, id.prospect), true);
    assert.equal(await claim(a, id.viewer), false);
    assert.deepEqual(await query("select user_id from @prospect_contact where session_id=$1", b), []);
    const save = async (session, snapshot) => (await first("select @save_brief_revision($1,$2,1,$3) as digest", session, brief, snapshot)).digest;
    const snapshot = { id: brief, version: 1, sample: "fictional" };
    assert.match(await save(a, snapshot), /^[a-f0-9]{64}$/);
    assert.equal(await save(a, { ...snapshot, sample: "replacement" }), null);
    assert.deepEqual(await query("select brief_id from @brief_revision where session_id=$1", b), []);
  });
  await who("prospect", async () => assert.deepEqual(await query("select id from @engagement"), []));
  await assert.rejects(who("prospect", () => query("select session_id from @prospect_contact")), { code: "42501" });
  await assert.rejects(who("prospect", () => query("select @claim_prospect($1,$2,'fictional@example.invalid')", b, id.prospect)), { code: "42501" });
  await assert.rejects(as("editorial", null, () => query("select snapshot from @brief_revision")), { code: "42501" });
}));
