export const commandCode = {
  provider: "command-code",
  baseURL: "https://api.commandcode.ai/provider/v1",
  model: "deepseek/deepseek-v4.1-flash",
} as const;

type Submission = {
  sessionId: string;
  idempotencyKey: string;
  input: string;
  instructionVersion: string;
  allowanceUnits: number;
};

type Preparation =
  | { operationId: string; disposition: "duplicate" | "allowance_unavailable" | "session_busy" }
  | { operationId: string; attemptId: string; disposition: "prepared" };

export type AttemptStore = {
  /** Resolve only after the preparation transaction commits. */
  prepare(input: Submission): Promise<Preparation>;
  /** Resolve only after the compare-and-set dispatch marker commits. */
  claim(attemptId: string, sessionId: string): Promise<boolean>;
  finish(attemptId: string, sessionId: string, output: string | null): Promise<boolean>;
};

// There is deliberately no live dispatch implementation. A future transport must
// send one physical request and disable hidden retries.
export async function runRecordedAttempt(
  store: AttemptStore,
  dispatchOnce: (attempt: typeof commandCode & { attemptId: string; input: string }) => Promise<string>,
  submission: Submission,
) {
  const preparation = await store.prepare(submission);
  if (preparation.disposition !== "prepared") return preparation;
  const { operationId, attemptId } = preparation;
  if (!(await store.claim(attemptId, submission.sessionId))) {
    return { operationId, disposition: "not_dispatched" } as const;
  }

  let output: string;
  try {
    output = await dispatchOnce({ ...commandCode, attemptId, input: submission.input });
  } catch {
    if (!(await store.finish(attemptId, submission.sessionId, null))) throw new Error("Attempt outcome could not be recorded.");
    return { operationId, disposition: "indeterminate" } as const;
  }

  if (!(await store.finish(attemptId, submission.sessionId, output))) throw new Error("Attempt output could not be recorded.");
  return { operationId, disposition: "completed", output } as const;
}
