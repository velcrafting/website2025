import {
  currentArtifact, currentMeetingPlan, meetingPreparationReady, normalizeRecipient, sameRecipients,
  type Artifact, type CurrentMeeting, type EventRef, type ManagedArtifact, type ManagedRegistry,
  type PreparationPlan, type VerifiedArtifact,
} from "./meeting-contract";

export type BookingMutation =
  | { kind: "create-file"; artifact: Artifact }
  | { kind: "refresh-notes-context"; fileId: string; artifact: Extract<Artifact, { kind: "notes" }> }
  | { kind: "revoke-booking-grant"; fileId: string; permissionId: string }
  | { kind: "remove-attachment"; fileId: string; event: EventRef }
  | { kind: "grant-visitor"; fileId: string; recipient: string }
  | { kind: "attach-file"; fileId: string; artifact: Artifact; event: EventRef };

export type BookingMutationReceipt = Readonly<{
  fileId?: string;
  permissionId?: string;
  contentsSha256?: string;
}>;

export type BookingStepState = Readonly<{
  current: CurrentMeeting;
  registry: ManagedRegistry;
}>;

export type BookingStepStore = {
  read(intentId: string, ownMutationId?: string): Promise<BookingStepState | null>;
  // A durable operation key and exclusive claim precede the callback. Ambiguous
  // calls are reconciled through provider reads before a subsequent mutation.
  runMutation(
    state: BookingStepState,
    operation: BookingMutation,
    invoke: (operationId: string) => Promise<BookingMutationReceipt | "stale">,
  ): Promise<"applied" | "stale" | "reconcile">;
  // Compare current authorization, booking and registry versions in the write transaction.
  markReady(state: BookingStepState, expected: PreparationPlan): Promise<boolean>;
};

export type BookingArtifactProvider = {
  observe(file: ManagedArtifact, current: CurrentMeeting): Promise<VerifiedArtifact | null>;
  // Patch only the registered attachment with an event ETag. Notes mutations
  // patch only the app-owned section using the document revision precondition.
  mutate(
    operation: BookingMutation, current: CurrentMeeting, operationId: string, authorized: () => Promise<boolean>,
  ): Promise<BookingMutationReceipt | "stale">;
};

const isCurrentEvent = (ref: EventRef, plan: PreparationPlan) =>
  ref.uid === plan.eventUid && ref.calendarId === plan.calendarId;

function cleanupOperation(state: BookingStepState, plan: PreparationPlan | null): BookingMutation | null {
  const { registry, current } = state;
  for (const entry of registry.artifacts) {
    const currentFile = plan && currentArtifact(plan, entry);
    const permission = entry.bookingGrants.find(({ recipient }) =>
      !currentFile || !plan.recipients.includes(normalizeRecipient(recipient)));
    if (permission) return { kind: "revoke-booking-grant", fileId: entry.fileId, permissionId: permission.permissionId };
    const actualAttachment = current.event.attachments.some(({ fileId }) => fileId === entry.fileId)
      ? [{ calendarId: current.event.calendarId, uid: current.event.uid }] : [];
    const attachment = [...entry.attachments, ...actualAttachment].find((ref) => !currentFile || !isCurrentEvent(ref, plan));
    if (attachment) return { kind: "remove-attachment", fileId: entry.fileId, event: attachment };
  }
  return null;
}

/** Each invocation performs at most one mutation or records verified readiness. */
export async function runBookingStep(
  intentId: string,
  expected: PreparationPlan | null,
  store: BookingStepStore,
  provider: BookingArtifactProvider,
): Promise<"pending" | "stale" | "reconcile" | "ready" | "cleaned"> {
  const state = await store.read(intentId);
  if (!state || state.registry.intentId !== intentId || state.current.booking.intentId !== intentId) return "stale";
  const { registry, current } = state;
  const cleanupAuthorized = (live: CurrentMeeting) =>
    live.booking.state === "cancelled" || live.confirmation?.revoked === true || live.contact === null || live.bindingValid === false ||
    (!!live.confirmation && (!sameRecipients(live.event.participants, live.confirmation.recipients) ||
      normalizeRecipient(live.booking.visitor) !== normalizeRecipient(live.contact.verifiedEmail)));
  const plan = expected && expected.intentId === intentId ? currentMeetingPlan(expected, current) : null;
  if (expected ? !plan : !cleanupAuthorized(current)) return "stale";
  if (registry.revision === null) return "reconcile";

  async function mutate(operation: BookingMutation) {
    const result = await store.runMutation(state!, operation, async (operationId) => {
      async function freshAuthority() {
        const fresh = await store.read(intentId, operationId);
        return fresh && fresh.registry.revision === registry.revision && fresh.registry.intentId === intentId &&
          fresh.current.booking.intentId === intentId &&
          (expected ? currentMeetingPlan(expected, fresh.current) : cleanupAuthorized(fresh.current)) ? fresh.current : null;
      }
      const fresh = await freshAuthority();
      if (!fresh) return "stale";
      return provider.mutate(operation, fresh, operationId, async () => !!(await freshAuthority()));
    });
    return result === "applied" ? "pending" : result;
  }

  const cleanup = cleanupOperation(state, plan);
  if (cleanup) return mutate(cleanup);
  if (!plan) return "cleaned";

  const observed: VerifiedArtifact[] = [];
  for (const artifact of plan.artifacts) {
    const matches = registry.artifacts.filter((entry) => entry.kind === artifact.kind && currentArtifact(plan, entry));
    if (matches.length > 1) return "reconcile";
    if (matches.length === 0) {
      if (artifact.kind === "notes") {
        const notes = registry.artifacts.find(({ kind }) => kind === "notes");
        if (notes) return mutate({ kind: "refresh-notes-context", fileId: notes.fileId, artifact });
      }
      return mutate({ kind: "create-file", artifact });
    }

    const [file] = matches;
    if (artifact.kind === "notes" && !file.contentsSha256)
      return mutate({ kind: "refresh-notes-context", fileId: file.fileId, artifact });
    const evidence = await provider.observe(file, current);
    if (!evidence || !evidence.privateFile || evidence.fileId !== file.fileId) return "reconcile";
    const visitor = plan.recipients.find((recipient) => recipient !== plan.organizer);
    if (visitor && !(evidence.grantedRecipients ?? evidence.verifiedRecipients).map(normalizeRecipient).includes(visitor)) {
      // A recorded grant that cannot be observed needs reconciliation, not another grant.
      if (file.bookingGrants.some(({ recipient }) => normalizeRecipient(recipient) === visitor)) return "reconcile";
      return mutate({ kind: "grant-visitor", fileId: file.fileId, recipient: visitor });
    }
    if (!current.event.attachments.some(({ fileId }) => fileId === file.fileId)) {
      return mutate({ kind: "attach-file", fileId: file.fileId, artifact, event: current.event });
    }
    observed.push(evidence);
  }

  const fresh = await store.read(intentId);
  if (!fresh || fresh.registry.revision !== registry.revision || !currentMeetingPlan(plan, fresh.current)) return "stale";
  if (!meetingPreparationReady(plan, fresh.current, fresh.registry, observed)) return "pending";
  return await store.markReady(fresh, plan) ? "ready" : "stale";
}
