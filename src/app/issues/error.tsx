"use client";

export default function IssuesError({ reset }: { reset: () => void }) {
  return (
    <div className="container-index py-[var(--space-7)]">
      <h1>Issues are temporarily unavailable</h1>
      <p className="mt-[var(--space-5)]">Please try again shortly.</p>
      <button className="mt-[var(--space-4)] underline" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
