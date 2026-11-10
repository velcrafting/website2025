import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadWorkspaceSchema, seedWorkspace } from "./workspace-fixture/schema.mjs";

test("an exact, authorized booking converts selected visitor statements to one private draft", async () => {
  const db = await PGlite.create();
  const query = async (sql, ...params) => (await db.query(sql.replaceAll("@", "velcrafting_private."), params)).rows;
  const first = async (...args) => (await query(...args))[0];
  async function as(subject, work, role = "authenticated") {
    return db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      const run = async (sql, ...params) => (await tx.query(sql.replaceAll("@", "velcrafting_private."), params)).rows;
      await run("select set_config('request.jwt.claim.sub',$1,true)", subject);
      return work(run);
    });
  }

  try {
    await loadWorkspaceSchema((sql) => db.exec(sql), { provisioning: true });
    const id = await seedWorkspace(query);
    await db.exec("alter table auth.users add column email text");
    for (const migration of ["007-booking.sql", "009-workspace-intake.sql"]) {
      await db.exec(await readFile(new URL("../../db/postgres/" + migration, import.meta.url), "utf8"));
    }
    const organizer = "owner@fictional.example";
    const visitor = "visitor@fictional.example";
    const booking = "fictional-booking";
    const sha = "a".repeat(64);
    const [intent, session, contact, brief] = Array.from({ length: 4 }, randomUUID);
    const expected = { engagement: id.alpha, intent, confirmation: 1, booking, brief, version: 2, sha,
      fields: ["outcome"], retry: randomUUID() };
    await query("update auth.users set email=$1 where id=$2", organizer, id.issuer);
    await query("update auth.users set email=$1 where id=$2", "other@fictional.example", id.drafter);
    await query("update auth.users set email=$1 where id=$2", visitor, id.prospect);
    await query("insert into @workspace_provisioner(user_id) values($1),($2)", id.issuer, id.drafter);
    await query("insert into @staff_access(user_id,engagement_id,capability) values($1,$2,'draft')", id.issuer, id.alphaOther);
    await query("insert into @explorer_session(id,notice_version,expires_at) values($1,'fixture',now()+interval '1 day')", session);
    await query("insert into @prospect_contact(id,session_id,user_id,verified_email) values($1,$2,$3,$4)", contact, session, id.prospect, visitor);
    await query("insert into @brief_revision(session_id,brief_id,version,sha256,snapshot) values($1,$2,2,$3,$4)",
      session, brief, sha, { fields: {
        outcome: { source: "visitor", confirmation: "stated", text: "Understand the fictional handoff.", sourceMessageIds: ["secret-message-id"] },
        constraints: { source: "visitor", confirmation: "stated", text: "Use the existing fixture." },
        questions: { source: "model_suggestion", confirmation: "suggested", text: "secret-unapproved-suggestion" },
        problem: { source: "visitor", confirmation: "stated", text: "out-of-scope-visitor-field" },
      }, hiddenLog: "secret-model-transcript" });
    await query("insert into @booking_intent(id,session_id,event_type_id,organizer,expires_at) values($1,$2,1,$3,now()+interval '1 day')",
      intent, session, organizer);
    await query(`insert into @booking_confirmation(intent_id,version,session_id,contact_id,visitor_email,organizer,
      idempotency_key,material,brief_id,brief_version,brief_sha256)
      values($1,1,$2,$3,$4,$5,gen_random_uuid(),'shared_for_booking',$6,2,$7)`, intent, session, contact, visitor, organizer, brief, sha);
    await query("update @booking_intent set confirmation_version=1 where id=$1", intent);
    await query(`insert into @booking(uid,intent_id,confirmation_version,state,starts_at,time_zone,organizer,visitor_email,
      participants,calendar_id,event_uid,provider_updated_at)
      values($1,$2,1,'confirmed',now(),'UTC',$3,$4,$5,'fictional-calendar','fictional-event',now())`,
      booking, intent, organizer, visitor, JSON.stringify([organizer, visitor]));

    const review = (person, target = id.alpha) => as(id[person], (run) =>
      run("select * from @review_workspace_intake($1,$2)", target, intent));
    const convert = (person, changes = {}) => as(id[person], async (run) => {
      const { engagement, intent, confirmation, booking, brief, version, sha, fields, retry } = { ...expected, ...changes };
      return (await run("select * from @convert_workspace_intake($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        engagement, intent, confirmation, booking, brief, version, sha, fields, retry))[0];
    });

    assert.deepEqual(await review("drafter"), []); // Assigned but verified to a different organizer email.
    assert.deepEqual(await review("viewer"), []);
    assert.deepEqual(await review("prospect"), []);
    assert.deepEqual(await review("issuer", id.beta), []);
    const list = await as(id.issuer, (run) => run("select intent_id,booking_uid from @list_workspace_intake()"));
    assert.deepEqual(list, [{ intent_id: intent, booking_uid: booking }]);
    const [preview] = await review("issuer");
    assert.equal(preview.brief_sha256, sha);
    assert.deepEqual(preview.fields, [
      { key: "outcome", label: "Goals", text: "Understand the fictional handoff." },
      { key: "constraints", label: "Constraints", text: "Use the existing fixture." },
    ]);
    assert.doesNotMatch(JSON.stringify(preview), /secret|out-of-scope/);
    await query("update auth.users set email_confirmed_at=null where id=$1", id.issuer);
    assert.deepEqual(await review("issuer"), []);
    assert.equal((await convert("issuer")).disposition, "denied");
    await query("update auth.users set email_confirmed_at=now() where id=$1", id.issuer);
    await query("update @booking set state='cancelled' where uid=$1", booking);
    assert.equal((await convert("issuer")).disposition, "denied");
    await query("update @booking set state='confirmed' where uid=$1", booking);
    assert.equal((await convert("issuer", { sha: "b".repeat(64) })).disposition, "conflict");
    assert.equal((await convert("issuer", { booking: "prior-booking" })).disposition, "conflict");
    assert.equal((await convert("issuer", { fields: ["questions"] })).disposition, "invalid");
    assert.equal((await convert("issuer", { engagement: id.beta })).disposition, "denied");

    const created = await convert("issuer");
    assert.equal(created.disposition, "created");
    assert.deepEqual(await convert("issuer"), { item_id: created.item_id, disposition: "duplicate" });
    assert.deepEqual(await convert("issuer", { retry: randomUUID() }), { item_id: created.item_id, disposition: "duplicate" });
    assert.equal((await convert("issuer", { engagement: id.alphaOther, retry: randomUUID() })).disposition, "conflict");
    assert.equal((await convert("issuer", { fields: ["constraints"] })).disposition, "conflict");
    assert.deepEqual(await first("select stage,body,terms,version from @workspace_draft where item_id=$1", created.item_id), {
      stage: "discovery", version: 1, terms: null,
      body: { sections: [{ label: "Goals", text: "Understand the fictional handoff." }] },
    });
    assert.deepEqual(await first(`select actor,booking_uid,confirmation_version,brief_version,brief_sha256,engagement_id,imported_fields
      from @prospect_conversion`), {
      actor: id.issuer, booking_uid: booking, confirmation_version: 1, brief_version: 2, brief_sha256: sha,
      engagement_id: id.alpha, imported_fields: ["outcome"],
    });
    assert.deepEqual(await query("select item_id from @published_revision where item_id=$1", created.item_id), []);
    assert.deepEqual(await query("select user_id from @engagement_grant where user_id=$1", id.prospect), []);
    assert.deepEqual(await as(id.viewer, (run) => run("select item_id from @workspace_draft where item_id=$1", created.item_id)), []);
    await assert.rejects(as(id.issuer, (run) => run("select * from @prospect_conversion")), { code: "42501" });
    await assert.rejects(as(id.issuer, (run) => run("select * from @workspace_intake_sources($1)", intent)), { code: "42501" });
    await assert.rejects(query("delete from @prospect_conversion"), { code: "55000" });
    await query("update @booking_intent set revoked_at=now() where id=$1", intent);
    assert.equal((await convert("issuer")).disposition, "denied");
    assert.deepEqual(await review("issuer"), []);
  } finally { await db.close(); }
});
