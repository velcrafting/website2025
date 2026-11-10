// src/app/arcade/page.tsx
//
// The arcade. F4, 2026-09-17: "README index -> arcade.json -> shelf -> usable player is implemented,
// not merely described."
//
// DISCOVERY, as built:
//   - The FLAG is a `## Arcade` section on the profile README. README inclusion is already this
//     project's authorised inclusion rule, so this reuses extractReadmeIndex unchanged rather than
//     adding a second discovery mechanism. A repository listed there is on the shelf.
//   - The CARD is `arcade.json` at the root of each game repository, read through the same public-read
//     path as release-note.json. The fail-closed rules live in src/lib/github/arcade.ts.
//
// The surface — marquee, tag filter, category shelves, the Netflix-style title view and the player — is
// built from the shared components (Card, Badge, Button, Drawer on Radix dialog) and uses the site's own
// palette, so light and dark themes both work with no raw colour.
//
// THREE HONEST EMPTY STATES, because "nothing is listed" and "the read failed" are different facts and
// only one of them is a reason to change something:
//   discovery failed  → the index could not be read at all
//   section missing   → the README has no Arcade section yet
//   empty             → the section exists and lists nothing
//
// Never invent a game to fill the shelf. Entries come from the index or they do not exist.

import { buildMetadata } from "@/lib/seo";
import { readArcade } from "@/lib/github/arcade";
import { readPublicText, README_URLS } from "@/lib/github/portfolio-source";

import ArcadeClient from "./ArcadeClient";

export const generateMetadata = () =>
  buildMetadata({
    title: "Arcade",
    description: "Games and playable experiments, on the shelf.",
    canonicalPath: "/arcade",
  });

// Request-driven, like the portfolio: the reads carry a daily revalidation window, so a request after
// the window refreshes without a rebuild.
export const revalidate = 3600;

export default async function ArcadePage() {
  const readme = await readPublicText(README_URLS.personal, fetch);
  const shelf = await readArcade(readme.status === "ok" ? readme.text : null, fetch);

  const emptyNote = shelf.discoveryFailed ? (
    <>
      <p className="text-[0.95rem]">
        <strong>The shelf could not be checked.</strong>
      </p>
      <p className="measure-prose mt-[var(--space-2)] text-muted">
        Reading the public index failed, so this page cannot say what is on the shelf. That is a read
        failure, not an empty arcade — try again later.
      </p>
    </>
  ) : shelf.missing.includes("Arcade") ? (
    <>
      <p className="text-[0.95rem]">
        <strong>No Arcade section yet.</strong>
      </p>
      <p className="measure-prose mt-[var(--space-2)] text-muted">
        The public profile README has no <code>## Arcade</code> section, so nothing is listed. Adding one,
        with links to game repositories, is what publishes a game here.
      </p>
    </>
  ) : (
    <>
      <p className="text-[0.95rem]">
        <strong>No cabinets on the shelf yet.</strong>
      </p>
      <p className="measure-prose mt-[var(--space-2)] text-muted">
        The Arcade section lists no games, so there is nothing to play. An arcade with no machines in it
        says so.
      </p>
    </>
  );

  return (
    <div className="container-index py-[var(--space-7)]">
      {/* The cabinet's marquee: the page announces itself, then gets out of the way. */}
      <header className="border-b border-rule pb-[var(--space-4)]">
        <h1 className="text-[1.6rem] uppercase tracking-[0.14em]">
          Velcrafting <span style={{ color: "var(--link)" }}>Arcade</span>
        </h1>
        <p className="measure-prose mt-[var(--space-2)] text-muted">
          Games, experiments and playable things. Pick a cabinet and press start.
        </p>
      </header>

      <ArcadeClient entries={shelf.entries} emptyNote={emptyNote} />
    </div>
  );
}
