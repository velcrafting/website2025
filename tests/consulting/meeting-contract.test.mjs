import assert from "node:assert/strict";
import { test } from "node:test";
import { createModuleLoader } from "../editor/_module-loader.mjs";

const loader = createModuleLoader();
const { planMeetingPreparation, meetingPreparationReady } = loader.load("src/consulting/server/meeting-contract.ts");
const { runBookingStep } = loader.load("src/consulting/server/booking-worker.ts");
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
const eventRef = { uid: event.uid, calendarId: event.calendarId };
const current = { confirmation, contact, booking, event };
const pdf = { kind: "brief", brief, contextVersion: 3, fileId: "fixture-brief-file", attachments: [eventRef], bookingGrants: [] };
const notes = { kind: "notes", brief, contextVersion: 3, contentsSha256: "a".repeat(64), fileId: "fixture-notes-file", attachments: [eventRef], bookingGrants: [] };
const registry = { intentId: confirmation.intentId, revision: 1, artifacts: [pdf, notes] };
const evidence = [pdf, notes].map(({ brief, contextVersion, fileId }) =>
  ({ brief, contextVersion, fileId, privateFile: true, verifiedRecipients: recipients }));

function prepare(live = current) {
  return planMeetingPreparation(live.confirmation, live.contact, live.booking, live.event);
}

test("a confirmed booking alone cannot authorize meeting materials", () => {
  assert.equal(prepare({ ...current, confirmation: null }), null);
  assert.equal(prepare({ ...current, contact: null }), null);
  assert.equal(prepare({ ...current, contact: { ...contact, id: "same-email-other-identity" } }), null);
  assert.equal(prepare({ ...current, confirmation: { ...confirmation, revoked: true } }), null);
  assert.equal(prepare({ ...current, booking: { ...booking, confirmationVersion: 2 } }), null);
  assert.equal(prepare({ ...current, event: { ...event, participants: [...recipients, "extra@example.invalid"] } }), null);
  assert.equal(prepare({ ...current, event: { ...event, uid: "other-event" } }), null);
});

test("ready requires current consent, the correct event, both literal files, Meet and private access", () => {
  const plan = prepare();
  const ready = (live = current, files = registry, observed = evidence) =>
    meetingPreparationReady(plan, live, files, observed);
  assert.ok(plan);
  assert.equal(ready(), true);
  assert.equal(ready({ ...current, confirmation: { ...confirmation, revoked: true } }), false);
  assert.equal(ready({ ...current, event: { ...event, attachments: event.attachments.slice(1) } }), false);
  assert.equal(ready({ ...current, event: { ...event, meetState: "pending" } }), false);
  assert.equal(ready(current, registry, [{ ...evidence[0], privateFile: false }, evidence[1]]), false);
  assert.equal(ready(current, registry, [{ ...evidence[0], verifiedRecipients: [owner] }, evidence[1]]), false);
  assert.equal(ready(current, registry, [{ ...evidence[0], brief: { ...brief, version: 1 } }, evidence[1]]), false);
  assert.equal(ready(current, registry, [evidence[0], { ...evidence[1], contextVersion: 2 }]), false);
});

test("a resumed plan cannot mutate or record ready after authority or booking changes", async () => {
  const prior = prepare();
  const changes = [
    { ...current, confirmation: { ...confirmation, revoked: true } },
    { ...current, booking: { ...booking, state: "cancelled" } },
    { ...current, booking: { ...booking, uid: "rescheduled", startsAt: "2026-11-16T18:00:00Z" },
      event: { ...event, startsAt: "2026-11-16T18:00:00Z" } },
    { ...current, contact: { ...contact, verifiedEmail: "other@example.invalid" } },
    { ...current, confirmation: { ...confirmation, version: 4,
      material: { state: "shared_for_booking", brief: { ...brief, version: 3 } } },
      booking: { ...booking, confirmationVersion: 4 } },
  ];

  for (const changed of changes) {
    const state = { current, registry: { ...registry, artifacts: [] } };
    const store = {
      read: async () => ({ ...state, current: changed }),
      runMutation: async () => assert.fail("stale worker attempted a write"),
      markReady: async () => assert.fail("stale worker recorded ready"),
    };
    assert.equal(await runBookingStep(confirmation.intentId, prior, store, {}), "stale");

    // The same change may occur while a worker holds a durable operation claim.
    let reads = 0;
    const racingStore = {
      ...store, read: async () => ++reads === 1 ? state : { ...state, current: changed },
      runMutation: async (_state, _mutation, invoke) => (await invoke("fixture-op")) === "stale" ? "stale" : "applied",
    };
    assert.equal(await runBookingStep(confirmation.intentId, prior, racingStore, {
      mutate: async () => assert.fail("stale worker reached provider"),
    }), "stale");
  }

  let reads = 0;
  const readyStore = {
    read: async () => ({ registry, current: ++reads === 1 ? current : changes[0] }),
    markReady: async () => assert.fail("stale worker recorded ready"),
  };
  assert.equal(await runBookingStep(confirmation.intentId, prior, readyStore, {
    observe: async ({ fileId }) => evidence.find((item) => item.fileId === fileId),
  }), "stale");
});

test("no-brief reconciles superseded app files and updates only the managed notes context", async () => {
  const oldGrant = { permissionId: "booking-permission", recipient: visitor };
  const unrelated = { fileId: "other-doc", mimeType: "application/pdf" };
  const replacement = { ...current, confirmation: { ...confirmation, version: 4,
    material: { state: "no_brief_confirmed", brief: null } },
    booking: { ...booking, confirmationVersion: 4 },
    event: { ...event, attachments: [...event.attachments, unrelated] } };
  const plan = prepare(replacement);
  const state = { current: replacement, registry: { ...registry, artifacts: [{ ...pdf, bookingGrants: [oldGrant] }, notes] } };
  const newNotes = { ...notes, brief: null, contextVersion: 4 };
  const newEvidence = { ...evidence[1], brief: null, contextVersion: 4 };
  assert.deepEqual(Array.from(plan.artifacts, ({ kind }) => kind), ["notes"]);
  assert.equal(meetingPreparationReady(plan, replacement, { ...registry, revision: null }, [newEvidence]), false);
  assert.equal(meetingPreparationReady(plan, replacement, { ...registry, artifacts: [pdf, newNotes] }, [newEvidence]), false);

  const writes = [];
  let humanNotes = "Owner's manually entered notes";
  const store = {
    read: async () => state,
    runMutation: async (_state, _operation, invoke) => (await invoke("fixture-op")) === "stale" ? "stale" : "applied",
    markReady: async () => true,
  };
  const provider = {
    observe: async () => newEvidence,
    mutate: async (action) => {
      writes.push(action.kind);
      const entry = state.registry.artifacts.find(({ fileId }) => fileId === action.fileId);
      if (action.kind === "revoke-booking-grant") {
        assert.equal(action.permissionId, oldGrant.permissionId);
        entry.bookingGrants = [];
      } else if (action.kind === "remove-attachment") {
        state.current.event.attachments = state.current.event.attachments.filter(({ fileId }) => fileId !== entry.fileId);
        if (entry === notes) state.registry.artifacts[1] = { ...notes, attachments: [] };
        else entry.attachments = [];
      } else if (action.kind === "refresh-notes-context") {
        assert.equal(action.fileId, notes.fileId);
        assert.equal(action.artifact.brief, null);
        state.registry.artifacts[1] = { ...newNotes, attachments: [] };
      } else if (action.kind === "attach-file") {
        entry.attachments = [eventRef];
        state.current.event.attachments.push(event.attachments[1]);
      } else {
        humanNotes = "";
      }
    },
  };

  for (let step = 0; step < 5; step++) assert.equal(await runBookingStep(confirmation.intentId, plan, store, provider), "pending");
  assert.equal(await runBookingStep(confirmation.intentId, plan, store, provider), "ready");
  assert.deepEqual(writes, ["revoke-booking-grant", "remove-attachment", "remove-attachment", "refresh-notes-context", "attach-file"]);
  assert.equal(humanNotes, "Owner's manually entered notes");
  assert.ok(state.current.event.attachments.includes(unrelated));
});

test("revocation reconciliation touches only registered booking-derived permissions and attachments", async () => {
  const revoked = { ...current, confirmation: { ...confirmation, revoked: true } };
  const oldGrant = { permissionId: "booking-permission", recipient: visitor };
  const state = { current: revoked, registry: { ...registry, artifacts: [{ ...pdf, bookingGrants: [oldGrant] }, notes] } };
  const store = { read: async () => state, runMutation: async (_state, _operation, invoke) => (await invoke("fixture-op")) === "stale" ? "stale" : "applied" };
  const writes = [];
  assert.equal(await runBookingStep(confirmation.intentId, null, store, {
    mutate: async (operation) => writes.push(operation),
  }), "pending");
  assert.deepEqual(writes.map(({ kind, permissionId }) => [kind, permissionId]), [["revoke-booking-grant", oldGrant.permissionId]]);
});
