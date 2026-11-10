import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createModuleLoader } from "../editor/_module-loader.mjs";

const loader = createModuleLoader();
const { verifyBookingWebhook, recordBookingReceipt } = loader.load("src/consulting/server/booking-webhook.ts");
const { recordBookingConfirmation, readBookingStatus, revokeBookingConfirmation } = loader.load("src/consulting/server/booking-intent.ts");
const { createCalBookingReader } = loader.load("src/consulting/server/booking-cal.ts");
const { reconcileOneBooking, queueBookingReconciliation } = loader.load("src/consulting/server/booking-reconcile.ts");

const owner = "owner@example.invalid";
const visitor = "visitor@example.invalid";
const settings = { organizer: owner, eventTypeId: 123 };
const secret = "controlled-booking-fixture";
const sign = (body) => createHmac("sha256", secret).update(body).digest("hex");
const raw = (uid, trigger = "BOOKING_CREATED", eventTypeId = 123) => Buffer.from(JSON.stringify({
  triggerEvent: trigger, createdAt: new Date().toISOString(), payload: { uid, eventTypeId, sensitiveMessage: "discard this" },
}));
const receipt = (body) => verifyBookingWebhook(body, sign(body), secret, settings.eventTypeId);

function tagClient(db) {
  const tags = (connection) => Object.assign(async (parts, ...values) => {
    const statement = parts.reduce((value, part, i) => value + (i ? "$" + i : "") + part, "");
    return (await connection.query(statement, values)).rows;
  }, { json: (value) => JSON.stringify(value) });
  return Object.assign(tags(db), { begin: async (work) => db.transaction(async (tx) => work(tags(tx))) });
}

async function setup(db) {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  for (const file of [
    "004-client-workspace-boundary.sql", "005-ai-attempt-ledger.sql", "006-consulting-identity-workspace.sql", "007-booking.sql",
  ]) await db.exec(await readFile(new URL("../../db/postgres/" + file, import.meta.url), "utf8"));

  const a = { sessionId: randomUUID(), userId: randomUUID(), email: visitor };
  const b = { sessionId: randomUUID(), userId: a.userId, email: visitor };
  const sha256 = "a".repeat(64);
  const brief = { id: randomUUID(), version: 1, sha256 };
  await db.query("insert into auth.users values ($1)", [a.userId]);
  for (const { sessionId, userId, email } of [a, b]) {
    await db.query("insert into velcrafting_private.explorer_session(id,notice_version,expires_at) values($1,'test',now()+interval '1 day')", [sessionId]);
    await db.query("insert into velcrafting_private.prospect_contact(session_id,user_id,verified_email) values($1,$2,$3)", [sessionId,userId,email]);
  }
  await db.query("insert into velcrafting_private.brief_revision values($1,$2,1,$3,'{}')", [a.sessionId,brief.id,sha256]);
  await db.exec("set role velcrafting_runtime");
  return { a, b, brief, sql: tagClient(db) };
}

test("signed receipt uses the raw body and retains only lifecycle identifiers", () => {
  const body = raw("booking-a");
  assert.equal(receipt(body).bookingUid, "booking-a");
  assert.equal(verifyBookingWebhook(body, sign(Buffer.concat([body, Buffer.from(" ")])), secret, 123), null);
  assert.equal(verifyBookingWebhook(body, "0".repeat(64), secret, 123), null);
  assert.equal(receipt(raw("booking-a", "BOOKING_CREATED", 42)), "ignored");
  assert.equal(receipt(raw("booking-a", "MEETING_STARTED")), "ignored");
  assert.equal(receipt(raw("../other-booking")), null);
  assert.equal(JSON.stringify(receipt(body)).includes("discard this"), false);
});

test("Cal reader rejects wrong organizer/event and uses a unique Google reference", async () => {
  const requests = [];
  const value = {
    uid: "booking-a", eventType: { id: 123 }, hosts: [{ email: owner }], attendees: [{ email: visitor, timeZone: "America/Chicago" }],
    guests: [], status: "accepted", start: "2026-11-20T19:00:00Z", createdAt: "2026-11-10T17:00:00Z",
    updatedAt: "2026-11-10T17:00:00Z", bookingFieldsResponses: { velcraftingIntent: randomUUID() },
  };
  let references = [{ type: "google_calendar", destinationCalendarId: "fixture-calendar", eventUid: "fixture-event" }];
  const lookup = createCalBookingReader("fixture-token", settings, async (url, request) => {
    requests.push(url.href);
    assert.equal(request.headers["cal-api-version"], "2026-02-25");
    assert.equal(request.redirect, "error");
    return Response.json({ status: "success", data: url.pathname.endsWith("/references") ? references : value });
  });
  assert.equal((await lookup("booking-a")).event.uid, "fixture-event");
  assert.match(requests[1], /^https:\/\/api\.cal\.com\/v2\/bookings\/booking-a\/references\?type=google_calendar$/);
  references = [...references, { ...references[0], eventUid: "ambiguous" }];
  assert.equal((await lookup("booking-a")).event, null);
  value.hosts[0].email = "unknown@example.invalid";
  assert.equal(await lookup("booking-a"), null);
});

test("current explorer and exact brief guard immutable sharing, retries, revocation and private status", async () => {
  const db = await PGlite.create();
  try {
    const { a, b, brief, sql } = await setup(db);
    const request = { idempotencyKey: randomUUID(), material: { state: "shared_for_booking", brief } };
    assert.equal((await recordBookingConfirmation(sql, b, settings, request)).status, "denied");
    const first = await recordBookingConfirmation(sql, a, settings, request);
    assert.equal(first.status, "confirmed");
    assert.equal((await recordBookingConfirmation(sql, a, settings, request)).correlationId, first.correlationId);
    assert.equal(await readBookingStatus(sql, b, first.intentId), null);
    const changed = await recordBookingConfirmation(sql, a, settings, {
      idempotencyKey: randomUUID(), intentId: first.intentId, expectedVersion: 1, material: { state: "no_brief_confirmed", brief: null },
    });
    assert.equal(changed.confirmationVersion, 2);
    assert.notEqual(changed.correlationId, first.correlationId);
    assert.equal((await recordBookingConfirmation(sql, a, settings, request)).status, "conflict");
    assert.equal(await revokeBookingConfirmation(sql, b, first.intentId, 2), false);
    assert.equal(await revokeBookingConfirmation(sql, a, first.intentId, 1), false);
    assert.equal(await revokeBookingConfirmation(sql, a, first.intentId, 2), true);
    assert.equal((await readBookingStatus(sql, a, first.intentId)).revoked, true);
    await assert.rejects(db.exec("update velcrafting_private.booking_confirmation set version=3"), /permission denied/);
  } finally { await db.close(); }
});

test("durable receipt queue binds actual lookup, handles duplicate/out-of-order events and finds a missed cancellation", async () => {
  const db = await PGlite.create();
  try {
    const { a, brief, sql } = await setup(db);
    const share = await recordBookingConfirmation(sql, a, settings, {
      idempotencyKey: randomUUID(), material: { state: "shared_for_booking", brief },
    });
    const good = {
      uid: "booking-a", correlation: share.correlationId, state: "confirmed",
      createdAt: new Date(Date.now() + 1000).toISOString(), updatedAt: new Date(Date.now() + 1000).toISOString(),
      startsAt: "2026-11-20T19:00:00.000Z", timeZone: "America/Chicago", organizer: owner, visitor,
      participants: [owner, visitor], rescheduledFrom: null, rescheduledTo: null, event: { calendarId: "calendar", uid: "event-a" },
    };
    const initial = receipt(raw(good.uid));
    assert.equal(await recordBookingReceipt(sql, initial), true);
    assert.equal(await recordBookingReceipt(sql, initial), false);
    assert.equal((await reconcileOneBooking(sql, 123, async () => good)).intentId, share.intentId);
    const status = await readBookingStatus(sql, a, share.intentId);
    assert.equal(status.bookingState, "confirmed");
    assert.equal(status.preparationState, "pending");
    assert.equal(status.meetUrl, null);

    await recordBookingReceipt(sql, receipt(raw(good.uid, "BOOKING_RESCHEDULED")));
    const successor = { ...good, uid: "booking-b", startsAt: "2026-11-21T19:00:00.000Z",
      rescheduledFrom: good.uid, event: { calendarId: "calendar", uid: "event-b" } };
    const rescheduled = { ...good, state: "rescheduled", rescheduledTo: successor.uid, event: null };
    await reconcileOneBooking(sql, 123, async () => rescheduled);
    await reconcileOneBooking(sql, 123, async () => successor);
    assert.equal((await readBookingStatus(sql, a, share.intentId)).bookingState, "confirmed");
    await recordBookingReceipt(sql, { ...initial, digest: "1".repeat(64) });
    await reconcileOneBooking(sql, 123, async () => good);
    assert.equal((await db.query("select state from velcrafting_private.booking where uid=$1",[good.uid])).rows[0].state,"rescheduled");

    await db.query("update velcrafting_private.booking set observed_at=now()-interval '11 minutes' where uid=$1", [successor.uid]);
    assert.equal(await queueBookingReconciliation(sql), 1);
    const cancelled = { ...successor, state: "cancelled", event: null };
    await reconcileOneBooking(sql, 123, async () => cancelled);
    assert.equal((await readBookingStatus(sql, a, share.intentId)).bookingState, "cancelled");
  } finally { await db.close(); }
});

test("durable worker recovers a lost file receipt, observes private access and cleans only its own artifacts", async () => {
  const { postgresBookingStore, bookingBrief, bookingArtifact, reconcileBookingMutation } =
    loader.load("src/consulting/server/booking-store.ts");
  const { createGoogleMeetingAdapter } = loader.load("src/consulting/server/booking-google.ts");
  const { planMeetingPreparation } = loader.load("src/consulting/server/meeting-contract.ts");
  const { runBookingStep } = loader.load("src/consulting/server/booking-worker.ts");
  const db = await PGlite.create();
  try {
    const { a, sql } = await setup(db);
    const share = await recordBookingConfirmation(sql, a, settings, {
      idempotencyKey: randomUUID(), material: { state: "no_brief_confirmed", brief: null },
    });
    const booking = {
      uid: "booking-worker", correlation: share.correlationId, state: "confirmed",
      createdAt: new Date(Date.now() + 1000).toISOString(), updatedAt: new Date(Date.now() + 1000).toISOString(),
      startsAt: "2026-11-20T19:00:00.000Z", timeZone: "America/Chicago", organizer: owner, visitor,
      participants: [owner, visitor], rescheduledFrom: null, rescheduledTo: null, event: { calendarId: "calendar", uid: "event-a" },
    };
    const lookup = async () => booking;
    await recordBookingReceipt(sql, receipt(raw(booking.uid)));
    assert.equal((await reconcileOneBooking(sql, 123, lookup)).intentId, share.intentId);

    const unrelated = { fileId: "owner-file", fileUrl: "https://drive.google.com/file/d/owner-file/view", mimeType: "application/pdf" };
    const event = {
      id: "event-a", organizer: { email: owner }, attendees: [{ email: visitor }], start: { dateTime: booking.startsAt },
      conferenceData: { conferenceSolution: { key: { type: "hangoutsMeet" } }, entryPoints: [
        { entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" },
      ] },
      attachments: [unrelated],
    };
    const notesFile = { id: "notes-file", mimeType: "application/vnd.google-apps.document",
      name: "Meeting agenda and notes", webViewLink: "https://docs.google.com/document/d/notes-file/edit", owners: [{ emailAddress: owner }] };
    const writes = [];
    let createdOperation;
    let agenda = "";
    const humanText = "Owner's existing notes\n";
    let visitorGrant = false;
    let probeCanOpen = false;
    const google = createGoogleMeetingAdapter({
      ownerEmail: owner, ownerToken: "fixture-owner-token", calendarId: "calendar",
      visitorProbeToken: "fixture-visitor-token",
      loadBrief: (id, brief) => bookingBrief(sql, id, brief),
      lookupArtifact: (id, fileId) => bookingArtifact(sql, id, fileId),
      transport: async (url, init) => {
        const target = new URL(url);
        const visitorProbe = init.headers.Authorization === "Bearer fixture-visitor-token";
        const { pathname, searchParams } = target;
        if (init.method && init.method !== "GET") writes.push([init.method, pathname]);
        if (pathname.endsWith("/calendar/v3/calendars/calendar/events/event-a")) {
          if (init.method === "PATCH") {
            assert.equal(init.headers["If-Match"], "fixture-etag");
            assert.equal(searchParams.get("supportsAttachments"), "true");
            assert.equal(searchParams.get("sendUpdates"), "none");
            const patch = JSON.parse(init.body);
            assert.deepEqual(Object.keys(patch), ["attachments"]);
            event.attachments = patch.attachments.map((file) => ({ ...file, fileId: file.fileUrl.includes("owner-file") ? "owner-file" : "notes-file" }));
          }
          return Response.json(event, { headers: { ETag: "fixture-etag" } });
        }
        if (pathname === "/drive/v3/files") {
          if (init.method === "POST") {
            assert.equal(createdOperation, undefined);
            createdOperation = JSON.parse(init.body).appProperties.velcraftingOperation;
            assert.ok(createdOperation);
            throw new Error("provider accepted the request but response was lost");
          }
          assert.match(searchParams.get("q"), new RegExp(createdOperation));
          return Response.json({ files: [{ id: notesFile.id, mimeType: notesFile.mimeType }] });
        }
        if (pathname === "/drive/v3/files/notes-file") {
          if (visitorProbe && (!visitorGrant || !probeCanOpen)) return new Response(null, { status: 404 });
          return Response.json(notesFile);
        }
        if (pathname === "/drive/v3/about") return Response.json({ user: { emailAddress: visitor } });
        if (pathname === "/drive/v3/files/notes-file/permissions") {
          if (init.method === "POST") {
            assert.equal(JSON.parse(init.body).emailAddress, visitor);
            assert.equal(searchParams.get("sendNotificationEmail"), "false");
            visitorGrant = true;
            return Response.json({ id: "visitor-grant" });
          }
          return Response.json({ permissions: [
            { id: "owner-permission", type: "user", role: "owner", emailAddress: owner },
            ...(visitorGrant ? [{ id: "visitor-grant", type: "user", role: "reader", emailAddress: visitor }] : []),
          ] });
        }
        if (pathname === "/drive/v3/files/notes-file/permissions/visitor-grant" && init.method === "DELETE") {
          visitorGrant = false;
          return new Response(null, { status: 204 });
        }
        if (pathname === "/v1/documents/notes-file") {
          if (visitorProbe && (!visitorGrant || !probeCanOpen)) return new Response(null, { status: 404 });
          return Response.json({
            documentId: "notes-file", revisionId: "fixture-doc-revision",
            namedRanges: agenda ? { velcrafting_prepared_agenda: { namedRanges: [{
              namedRangeId: "app-agenda-range", ranges: [{ startIndex: 1, endIndex: agenda.length + 1 }],
            }] } } : {},
            body: { content: [{ paragraph: { elements: [{ startIndex: 1, textRun: { content: agenda + humanText } }] } }] },
          });
        }
        if (pathname === "/v1/documents/notes-file:batchUpdate") {
          const { requests, writeControl } = JSON.parse(init.body);
          assert.equal(writeControl.requiredRevisionId, "fixture-doc-revision");
          assert.equal(requests[0].insertText.location.index, 1);
          agenda = requests[0].insertText.text;
          assert.equal(requests[1].createNamedRange.range.endIndex, agenda.length + 1);
          return Response.json({ documentId: "notes-file" });
        }
        throw new Error("Unexpected controlled Google request: " + pathname);
      },
    });
    const store = postgresBookingStore(sql, lookup, google.readEvent);
    const plan = await store.read(share.intentId).then(({ current }) =>
      planMeetingPreparation(current.confirmation, current.contact, current.booking, current.event));
    const step = (expected = plan) => runBookingStep(share.intentId, expected, store, google.provider);
    assert.equal(await step(), "reconcile");
    assert.equal(await step(), "reconcile");
    assert.equal(writes.filter(([method, path]) => method === "POST" && path === "/drive/v3/files").length, 1);
    await db.exec("reset role");
    await db.query("update velcrafting_private.booking_mutation set created_at=now()-interval '3 minutes'");
    await db.exec("set role velcrafting_runtime");
    assert.equal(await reconcileBookingMutation(sql, share.intentId, google.reconcileMutation), true);
    assert.equal(await step(), "pending"); // Add managed context before sharing the notes file.
    assert.equal(await step(), "pending"); // Grant named visitor view.
    assert.equal(await step(), "pending"); // Add literal notes attachment.
    assert.equal(await step(), "pending"); // Drive permission alone is not recipient access proof.
    assert.equal((await readBookingStatus(sql, a, share.intentId)).preparationState, "pending");
    probeCanOpen = true;
    assert.equal(await step(), "ready");
    assert.equal((await readBookingStatus(sql, a, share.intentId)).meetUrl, "https://meet.google.com/abc-defg-hij");
    assert.match(agenda, /No brief supplied/);
    assert.equal(event.attachments.length, 2);

    assert.equal(await revokeBookingConfirmation(sql, a, share.intentId, share.confirmationVersion), true);
    assert.equal(await step(), "stale");
    assert.equal(await step(null), "pending"); // Revoke the booking-derived visitor grant.
    assert.equal(await step(null), "pending"); // Remove the registered notes attachment.
    assert.equal(await step(null), "cleaned");
    assert.equal(visitorGrant, false);
    assert.deepEqual(event.attachments, [unrelated]);
    assert.equal(humanText, "Owner's existing notes\n");
  } finally { await db.close(); }
});
