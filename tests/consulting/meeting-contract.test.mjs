import assert from "node:assert/strict";
import { test } from "node:test";
import { createModuleLoader } from "../editor/_module-loader.mjs";

const { planMeetingPreparation, meetingPreparationReady } =
  createModuleLoader().load("src/consulting/server/meeting-contract.ts");
const owner = "owner@example.invalid";
const visitor = "visitor@example.invalid";
const recipients = [owner, visitor];
const brief = { id: "fixture-brief", version: 2, sha256: "a".repeat(64) };
const contact = { id: "verified-fixture-contact", verifiedEmail: visitor };
const confirmation = {
  intentId: "fixture-intent", version: 3, verifiedContactId: contact.id,
  recipients, organizer: owner, revoked: false, material: { state: "shared_for_booking", brief },
};
const booking = {
  uid: "fixture-booking", intentId: confirmation.intentId, confirmationVersion: 3,
  state: "confirmed", calendarId: "fixture-calendar", eventUid: "fixture-event",
  startsAt: "2026-11-15T18:00:00Z", organizer: owner, visitor,
};
const event = {
  calendarId: booking.calendarId, uid: booking.eventUid, startsAt: booking.startsAt,
  organizer: owner, participants: recipients, meetState: "ready",
  attachments: [
    { fileId: "fixture-brief-file", mimeType: "application/pdf" },
    { fileId: "fixture-notes-file", mimeType: "application/vnd.google-apps.document" },
  ],
};
const artifacts = [
  { kind: "brief", brief, bookingUid: booking.uid, fileId: "fixture-brief-file", privateFile: true, verifiedRecipients: recipients },
  { kind: "notes", brief: null, bookingUid: booking.uid, fileId: "fixture-notes-file", privateFile: true, verifiedRecipients: recipients },
];

test("a confirmed booking alone cannot authorize meeting materials", () => {
  assert.equal(planMeetingPreparation(null, contact, booking, event), null);
  assert.equal(planMeetingPreparation(confirmation, null, booking, event), null);
  assert.equal(planMeetingPreparation(confirmation, { ...contact, id: "same-email-other-identity" }, booking, event), null);
  assert.equal(planMeetingPreparation({ ...confirmation, revoked: true }, contact, booking, event), null);
  assert.equal(planMeetingPreparation(confirmation, contact, { ...booking, confirmationVersion: 2 }, event), null);
  assert.equal(planMeetingPreparation(confirmation, contact, booking, { ...event, participants: [...recipients, "extra@example.invalid"] }), null);
  assert.equal(planMeetingPreparation(confirmation, contact, booking, { ...event, uid: "other-event" }), null);
});

test("ready needs the literal PDF of the exact revision and notes, access and Meet", () => {
  const plan = planMeetingPreparation(confirmation, contact, booking, event);
  assert.ok(plan);
  assert.equal(meetingPreparationReady(plan, event, artifacts), true);
  assert.equal(meetingPreparationReady(plan, { ...event, attachments: event.attachments.slice(1) }, artifacts), false);
  assert.equal(meetingPreparationReady(plan, { ...event, meetState: "pending" }, artifacts), false);
  assert.equal(meetingPreparationReady(plan, { ...event, startsAt: "2026-11-16T18:00:00Z" }, artifacts), false);
  assert.equal(meetingPreparationReady(plan, event, [{ ...artifacts[0], privateFile: false }, artifacts[1]]), false);
  assert.equal(meetingPreparationReady(plan, event, [{ ...artifacts[0], verifiedRecipients: [owner] }, artifacts[1]]), false);
  assert.equal(meetingPreparationReady(plan, event, [{ ...artifacts[0], brief: { ...brief, version: 1 } }, artifacts[1]]), false);
  assert.equal(meetingPreparationReady(plan, event, [{ ...artifacts[0], brief: { ...brief, sha256: "b".repeat(64) } }, artifacts[1]]), false);
});

test("an explicit no-brief confirmation requires notes and never plans a PDF", () => {
  const plan = planMeetingPreparation({ ...confirmation, material: { state: "no_brief_confirmed", brief: null } }, contact, booking, event);
  assert.ok(plan);
  assert.deepEqual(Array.from(plan.artifacts, ({ kind }) => kind), ["notes"]);
  assert.equal(meetingPreparationReady(plan, { ...event, attachments: event.attachments.slice(1) }, artifacts.slice(1)), true);
  assert.equal(meetingPreparationReady(plan, { ...event, attachments: [] }, []), false);
  assert.equal(meetingPreparationReady(plan, event, artifacts), false);
});
