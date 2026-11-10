import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadWorkspaceSchema, seedWorkspace } from "./workspace-fixture/schema.mjs";

async function withProvisioning(run) {
  const db = await PGlite.create();
  const query = async (sql, ...args) => (await db.query(sql.replaceAll("@", "velcrafting_private."), args)).rows;
  const first = async (...args) => (await query(...args))[0];
  async function as(user, work, role = "authenticated") {
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      await query("select set_config('request.jwt.claim.sub',$1,true)", user);
      const result = await work();
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }
  try {
    await loadWorkspaceSchema((sql) => db.exec(sql), { provisioning: true });
    await db.exec("alter table auth.users add column email text");
    const id = await seedWorkspace(query);
    await query(`update auth.users set email = 'fictional-' || id::text || '@same-domain.example.invalid',
      email_confirmed_at = case when id <> $1 then now() end`, id.betaUser);
    await query("insert into @workspace_provisioner(user_id) values($1)", id.issuer);
    await run({
      id, first, query, as,
      create: (person, retry, template, objective = "Fictional objective") => as(id[person], () =>
        first(`select * from @create_workspace_engagement($1,'Fictional client','Fictional project','Fictional engagement',$2,$3)`,
          retry, template, objective)),
      access: (person, target, subject, operation, commercial = false) => as(id[person], async () =>
        (await first("select @set_workspace_access($1,$2,$3,$4) as result", target, subject, operation, commercial)).result),
    });
  } finally { await db.close(); }
}

test("only a current named provisioner can create an atomic private engagement with a pinned workflow", () =>
  withProvisioning(async ({ id, first, query, as, create }) => {
    const denied = { engagement_id: null, disposition: "denied" };
    const bad = await create("issuer", randomUUID(), "unrecognized-template");
    assert.deepEqual(bad, { engagement_id: null, disposition: "invalid" });
    assert.deepEqual(await create("viewer", randomUUID(), "review-decision"), denied);
    assert.deepEqual(await create("prospect", randomUUID(), "review-decision"), denied);
    await assert.rejects(as(id.issuer, () => query("select user_id from @workspace_provisioner")), { code: "42501" });
    await assert.rejects(as(id.issuer, () => query("select @can_workspace_provision()"), "velcrafting_runtime"), { code: "42501" });
    assert.equal((await first("select count(*)::integer as n from @engagement")).n, 3);

    const retry = randomUUID();
    const created = await create("issuer", retry, "review-decision");
    assert.equal(created.disposition, "created");
    assert.deepEqual(await create("issuer", retry, "review-decision"), { ...created, disposition: "duplicate" });
    assert.deepEqual(await create("issuer", retry, "review-decision", "Changed details"), { engagement_id: null, disposition: "conflict" });
    assert.deepEqual(await first(`select e.workflow_template, e.workflow_version, c.name, p.title, e.objective
      from @engagement e join @project p on (p.client_id,p.id)=(e.client_id,e.project_id)
      join @client c on c.id=e.client_id where e.id=$1`, created.engagement_id), {
      workflow_template: "review-decision", workflow_version: "0.1", name: "Fictional client",
      title: "Fictional project", objective: "Fictional objective",
    });
    assert.deepEqual(await query("select capability from @staff_access where engagement_id=$1 order by capability", created.engagement_id),
      ["draft", "issue", "manage_access", "publish", "record_agreement"].map((capability) => ({ capability })));
    assert.deepEqual(await query("select item_id from @published_revision where engagement_id=$1", created.engagement_id), []);
    assert.deepEqual(await query("select user_id from @engagement_grant where engagement_id=$1", created.engagement_id), []);
    assert.deepEqual(await as(id.viewer, () => query("select id from @engagement where id=$1", created.engagement_id)), []);

    for (const template of ["prototype-software", "workflow-ai-integration", "communications-knowledge"]) {
      assert.equal((await create("issuer", randomUUID(), template)).disposition, "created");
    }
    const drafts = await query(`select d.body->'sections'->1->>'text' as prompt from @workspace_draft d
      join @engagement e on e.id=d.engagement_id where e.workflow_version='0.1' and d.stage='discovery'`);
    assert.equal(new Set(drafts.map(({ prompt }) => prompt)).size, 4);
    for (const [table, expected] of [["client", 6], ["project", 6], ["engagement", 7], ["workspace_provision_event", 4]]) {
      assert.equal((await first(`select count(*)::integer as n from @${table}`)).n, expected);
    }
    await assert.rejects(query("delete from @workspace_provision_event where engagement_id=$1", created.engagement_id), { code: "55000" });
    await query("update @workspace_provisioner set revoked_at=now() where user_id=$1", id.issuer);
    assert.deepEqual(await create("issuer", randomUUID(), "review-decision"), denied);
  }));

test("verified identity, client membership, per-engagement access and commercial authority remain separate", () =>
  withProvisioning(async ({ id, first, query, as, access }) => {
    for (const [person, target] of [["drafter", id.alpha], ["issuer", id.alpha], ["recorder", id.alphaOther]]) {
      await query("insert into @staff_access(user_id,engagement_id,capability) values($1,$2,'manage_access')", id[person], target);
    }
    const visible = () => as(id.prospect, () => query("select id from @engagement order by id"));
    assert.deepEqual(await visible(), []);
    assert.equal(await access("viewer", id.alpha, id.prospect, "membership_grant"), "denied");
    assert.equal(await access("issuer", id.beta, id.prospect, "membership_grant"), "denied");
    assert.equal(await access("issuer", id.alpha, id.betaUser, "membership_grant"), "denied");
    assert.equal(await access("issuer", id.alpha, randomUUID(), "membership_grant"), "denied");
    assert.equal(await access("issuer", id.alpha, id.issuer, "membership_grant"), "denied");
    assert.equal(await access("issuer", id.alpha, id.prospect, "engagement_grant"), "membership_required");

    assert.equal(await access("drafter", id.alpha, id.prospect, "membership_grant"), "changed");
    assert.equal(await access("drafter", id.alpha, id.prospect, "membership_grant"), "unchanged");
    assert.deepEqual(await visible(), []);
    assert.equal(await access("drafter", id.alpha, id.prospect, "engagement_grant", true), "denied");
    assert.equal(await access("drafter", id.alpha, id.prospect, "engagement_grant"), "changed");
    assert.deepEqual(await visible(), [{ id: id.alpha }]);
    assert.deepEqual(await as(id.prospect, () => query("select terms from @issued_terms")), []);
    assert.equal(await access("issuer", id.alpha, id.prospect, "engagement_grant", true), "changed");
    assert.deepEqual(await as(id.prospect, () => query("select terms from @issued_terms")), [
      { terms: { text: "FICTION_ALPHA_COMMERCIAL" } },
    ]);
    assert.equal(await access("recorder", id.alphaOther, id.prospect, "engagement_grant"), "changed");
    assert.equal(await access("issuer", id.alpha, id.prospect, "membership_revoke"), "denied");
    assert.equal((await visible()).length, 2);
    assert.equal(await access("drafter", id.alpha, id.prospect, "engagement_revoke"), "changed");
    assert.deepEqual(await visible(), [{ id: id.alphaOther }]);
    assert.equal(await access("recorder", id.alphaOther, id.prospect, "membership_revoke"), "changed");
    assert.deepEqual(await visible(), []);
    assert.equal(await access("drafter", id.alpha, id.prospect, "membership_grant"), "changed");
    assert.deepEqual(await visible(), []);
    assert.equal(await access("drafter", id.alpha, id.prospect, "engagement_grant"), "changed");
    assert.deepEqual(await visible(), [{ id: id.alpha }]);
    assert.deepEqual(await as(id.prospect, () => query("select terms from @issued_terms")), []);
    assert.equal((await first("select count(*)::integer as n from auth.users")).n, 7);
    assert.deepEqual(await query("select actor,subject from @workspace_provision_event where action='membership_revoke'"), [
      { actor: id.recorder, subject: id.prospect },
    ]);
  }));
