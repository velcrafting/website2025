# Author prompt — making a game for the Velcrafting arcade

Give this to whatever model or person is building the game. It states what the arcade needs, and what it
will refuse to do on your behalf.

## What you are building

A single self-contained web game that runs from a static host, normally GitHub Pages at
`https://<owner>.github.io/<repo>/`. It is embedded in the arcade and must be usable there, not only when
opened alone.

## The five things the arcade cannot do for you

The arcade embeds the game in a frame on a different origin. It **cannot** read anything inside that frame.
So it cannot see your score, pause your loop, or know how tall your page is. Those are yours:

1. **Keyboard and touch.** A game that only responds to a keyboard is unusable on most phones, and the
   arcade is browsed on phones. Provide both. Test both.
2. **Pause and restart.** Provide a visible, focusable pause control and a restart. The arcade offers a
   Reload that re-loads your frame, which is a restart, but it cannot pause you.
3. **Fit a fixed 4:3 stage.** The host renders you in a fixed-aspect frame and **does not resize to a
   reported height**. An earlier version of this document told authors to postMessage their height to the
   parent; `ArcadeClient` has never listened for it, so that instruction described a mechanism that does not
   exist and is withdrawn. Build to the frame you are given, and make your controls reflow inside it.
4. **Say what you are.** No external requests, no trackers, no fonts or scripts from other domains. A
   game that phones home will be visible to anyone reading the network tab.
5. **Be playable in the first five seconds.** Someone arriving from a card has not read anything.

## What belongs in `arcade.json`

At the root of the game repository:

```json
{
  "summary": "One line for the card.",
  "description": "The paragraph the title view shows: what it is, how it plays, what to expect.",
  "playUrl": "https://<owner>.github.io/<repo>/",
  "tags": ["model: <the model that made it>", "<genre>"],
  "status": "playable",
  "added": "2026 · 09"
}
```

Field rules, enforced by `src/lib/github/arcade.ts`:

**What the host actually consumes today** (audited 2026-09-17 — write only these, or the file describes a
contract nobody implements):

| Field | Consumed by | Notes |
| --- | --- | --- |
| repository name | the card title and the key | from the README index link, not from the file |
| `summary` | the card | **required**; an invalid summary invalidates the whole file |
| `description` | the title view | optional |
| `playUrl` | the player frame | **https only**; absent means no player |
| `tags` | card badges and the filter row | `model:` tags sort first, in the accent |
| `status` | which shelf (`playable` / `workshop`) | anything else is treated as `workshop` |
| `added` | the title view | free text, ≤20 characters |

**Not consumed yet — do not rely on them:** `version`, `id`, `cover`, `controls`, `aspect`, and any explicit
`attribution` field. Attribution currently travels in `tags`. If one of these becomes part of the contract,
it needs a reader in `ArcadeClient` first, and this table updated in the same change.

**Rejected values, and what happens:**

| Field | Rule | If it breaks the rule |
| --- | --- | --- |
| `summary` | non-empty string, 200 characters or fewer | the file is **ignored** and the card shows the repository name only |
| `description` | string, 600 characters or fewer | dropped, the rest of the file still applies |
| `playUrl` | **https only** | no player is shown; the card says it is not playable yet |
| `tags` | up to 5, each 40 characters or fewer | extra or oversized tags are dropped, not shown |
| `status` | `playable` or `workshop` | anything else is treated as `workshop` |
| `added` | 20 characters or fewer | dropped |

`model: <name>` tags carry the attribution — which model built the game. They sort first and render in the
accent colour, because Steven runs several models and wants each game attributed to its author.

## The rules the arcade holds itself to

- **Never invent a game.** An empty shelf says so. A placeholder is not shipped to fill space.
- **Never half-parse.** A malformed `arcade.json` is ignored in full; no field is guessed.
- **Never a dead button.** No `playUrl` means "not playable yet", never a Play control that does nothing.
- **Never a fake height.** The frame reports what it was told and nothing more.

## The reference game

`public/arcade/reference-game.html` in the website repository is the worked example: keyboard and touch,
explicit Start with no autoplay, arrows **and** WASD, pause on `P`, restart on `R`, pause on window blur, no
audio, and **no height handshake** — the host renders a fixed 4:3 frame and does not resize to a reported
height, so an earlier version of this document that asked authors to `postMessage` their height described a
mechanism that does not exist and has been withdrawn. Copy its structure, not its code.
