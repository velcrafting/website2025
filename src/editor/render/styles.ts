// Gate B / concept 03: prose styling for the database-backed issue projection.
//
// These rules use the shared tokens rather than page-specific values, so the
// reading surface follows the palette and the reading measure without a second
// visual system. Design authority: VELCRAFTING_DESIGN_PRINCIPLES.md (concept 03).

export const rendererCss = `
  .prose { max-width: var(--measure-prose); font-family: var(--font-serif); }
  .prose section { margin-bottom: var(--space-5); }
  .prose h2 {
    font-size: var(--step-h2);
    font-weight: 600;
    line-height: 1.2;
    margin: 0 0 var(--space-3);
    color: var(--ink);
  }
  .prose h3 {
    font-size: var(--step-h3);
    font-weight: 600;
    margin: var(--space-5) 0 var(--space-2);
    color: var(--ink);
  }
  .prose p {
    font-size: var(--step-prose);
    line-height: 1.7;
    margin: 0 0 var(--space-4);
    color: var(--foreground);
  }
  .prose ul, .prose ol { margin: 0 0 var(--space-4); padding-left: var(--space-5); }
  .prose li { margin-bottom: var(--space-2); }
  .prose blockquote {
    margin: 0 0 var(--space-4);
    padding-left: var(--space-4);
    border-left: 2px solid var(--rule);
    color: var(--muted);
  }
  .prose code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--paper-raised);
    padding: 0.1em 0.3em;
    border-radius: var(--radius-chip);
  }
  /* Callout and figure kinds (renderer version 2). The tone is carried by a word in the
     markup as well as by the border colour, so it does not depend on colour alone. */
  .prose .callout {
    margin: 0 0 var(--space-4);
    padding: var(--space-4);
    border-left: 3px solid var(--rule);
    background: var(--paper-raised);
    border-radius: var(--radius-surface);
  }
  .prose .callout[data-tone="tip"] { border-left-color: var(--accent); }
  .prose .callout[data-tone="warning"] { border-left-color: var(--warn-ink); }
  .prose .callout-label {
    margin: 0 0 var(--space-2);
    font-family: var(--font-sans);
    font-size: var(--step-meta);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .prose .callout-title {
    margin: 0 0 var(--space-2);
    font-weight: 600;
    color: var(--ink);
  }
  .prose .callout p:last-child { margin-bottom: 0; }
  .prose figure { margin: 0 0 var(--space-5); }
  .prose figure img {
    width: 100%;
    height: auto;
    border: 1px solid var(--rule);
    border-radius: var(--radius-surface);
  }
  .prose figcaption {
    margin-top: var(--space-2);
    font-size: var(--step-meta);
    color: var(--muted);
  }
`;
