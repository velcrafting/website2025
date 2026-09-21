// Honest unavailable action — concept 03.
//
// "If the community is not ready, omit the control or accurately label its
// current state rather than linking a placeholder."
//
// The state must be visible BEFORE any interaction. The previous version hid the
// explanation inside a closed <details>, so a visitor only learned the action was
// unavailable after clicking — and the wording described internal setup rather
// than the visitor's situation. This version is a non-interactive control with a
// visible state chip and reader-facing copy.
//
// Copy rule: write for the reader, not for the build log.

export default function UnavailableAction({
  label,
  state,
  reason,
  alternative,
}: {
  label: string;
  /** Short, accurate current state, e.g. "Not open yet". */
  state: string;
  /** Reader-facing explanation of what this would do and why it is unavailable. */
  reason: string;
  /** What the visitor can do instead, right now. */
  alternative?: string;
}) {
  return (
    <div className="w-full">
      <p className="flex flex-wrap items-center gap-[var(--space-3)]">
        <span
          aria-disabled="true"
          className="btn-secondary cursor-not-allowed no-underline"
        >
          {label}
          <span aria-hidden="true">→</span>
        </span>
        <span className="meta rounded-[var(--radius-chip)] bg-warn-fill px-[var(--space-2)] py-0.5 text-ink">
          {state}
        </span>
      </p>
      <p className="meta measure-prose mt-[var(--space-2)]">
        {reason}
        {alternative ? <> {alternative}</> : null}
      </p>
    </div>
  );
}
