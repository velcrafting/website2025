export const commandCode = {
  provider: "command-code",
  baseURL: "https://api.commandcode.ai/provider/v1",
  model: "deepseek/deepseek-v4.1-flash",
} as const;

export type Submission = {
  sessionId: string;
  idempotencyKey: string;
  input: string;
  instructionVersion: string;
  allowanceUnits: number;
  context?: string;
  payloadExpiresAt?: string;
  retry?: { kind: "retry" | "repair"; previousAttemptId: string };
};

type Preparation =
  | { operationId: string | null; disposition: "duplicate" | "allowance_unavailable" | "session_busy" | "session_unavailable" | "retry_refused" }
  | { operationId: string; attemptId: string; disposition: "prepared" };

export type ProviderEvidence = {
  source: "provider_response" | "provider_reconciliation" | "documented_estimate";
  cost_state: "pending" | "unavailable" | "estimated" | "verified";
  provider_request_id?: string;
  actual_model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
  provider_units?: number;
  provider_unit_name?: string;
  amount?: number;
  currency?: string;
  rate_basis?: string;
  failure_category?: "provider_rejected" | "rate_limited" | "invalid_output";
};

export type ProviderReply = { output: string | null; evidence: ProviderEvidence };

export type AttemptStore = {
  /** Resolve only after the preparation transaction commits. */
  prepare(input: Submission): Promise<Preparation>;
  /** Resolve only after the compare-and-set dispatch marker commits. */
  claim(attemptId: string, sessionId: string): Promise<boolean>;
  receive(attemptId: string, sessionId: string, evidence: ProviderEvidence): Promise<boolean>;
  markUnknown(attemptId: string, sessionId: string, failure: "provider_unconfirmed"): Promise<boolean>;
  finish(attemptId: string, sessionId: string, output: string | null): Promise<boolean>;
};

// The transport sends one physical request and disables hidden retries.
export async function runRecordedAttempt(
  store: AttemptStore,
  dispatchOnce: (attempt: typeof commandCode & { attemptId: string; input: string; context: string; instructionVersion: string }) => Promise<ProviderReply>,
  submission: Submission,
) {
  const preparation = await store.prepare(submission);
  if (preparation.disposition !== "prepared") return preparation;
  const { operationId, attemptId } = preparation;
  if (!(await store.claim(attemptId, submission.sessionId))) {
    return { operationId, disposition: "not_dispatched" } as const;
  }

  let response: ProviderReply;
  try {
    response = await dispatchOnce({
      ...commandCode,
      attemptId,
      input: submission.input,
      context: submission.context ?? submission.input,
      instructionVersion: submission.instructionVersion,
    });
  } catch {
    if (!(await store.markUnknown(attemptId, submission.sessionId, "provider_unconfirmed"))) throw new Error("Attempt outcome could not be recorded.");
    return { operationId, disposition: "indeterminate" } as const;
  }

  const { evidence, output } = response;
  if (!(await store.receive(attemptId, submission.sessionId, evidence))) throw new Error("Provider response evidence could not be recorded.");
  // A lost output-write acknowledgment permits a retry of the same storage write only.
  const stored = await store.finish(attemptId, submission.sessionId, output)
    .catch(() => store.finish(attemptId, submission.sessionId, output));
  if (!stored) throw new Error("Attempt output could not be recorded.");
  return output === null
    ? { operationId, disposition: "provider_unavailable" } as const
    : { operationId, disposition: "completed", output } as const;
}
