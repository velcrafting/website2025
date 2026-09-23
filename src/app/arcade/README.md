# The arcade

A shelf of games and playable experiments. The page is `page.tsx`; the browsing behaviour is
`ArcadeClient.tsx`.

## September 17 implementation target

The discovery and author contract below are planned, not shipped. The current finishing scope is
`docs/implementation_plan_Sep16.md` → F4: build one real local reference game, its copyable LLM author
prompt and manifest, then prove README discovery through the shelf and player. Use that working game
to settle keyboard/touch controls and iframe behavior before copying the pattern elsewhere. The older
JSON examples below describe the current UI shape, not a validated versioned manifest. Do not treat
them as proof discovery already runs.

## Where the games come from

**v0:** `entries.json` in this folder. It is an empty array today, so the page shows its honest empty
state. Add one entry and the shelves appear.

**Next:** two parts, and they mirror conventions this workspace already has.

### 1. The flag — a README index section, not a topic

Discovery needs a list, because a file inside a repo cannot announce that the repo exists. This
codebase already has the right list mechanism: the **README index**, which is the authorised inclusion
rule for the portfolio ("README inclusion IS the inclusion rule"). So a section on the profile README
becomes the arcade's switch:

```md
## Arcade

- [game-name](https://github.com/<owner>/<game-name>)
```

A repository listed there is on the shelf. Nothing else needs to be set, and the list lives wherever
Steven already edits these things. GitHub topics were the first instinct and are the wrong tool: a
topic is invisible in the places he actually looks, and it cannot carry metadata.

### 2. The card — a per-repo file, exactly like `release-note.json`

Each game repo carries `arcade.json` at its root, read through the **same public-read path** already
used for the release note and the README: approved-owner boundary, daily window, last-good, fail
closed. Same shape, same rules, same template and skill in the project scaffold so Codex can roll it
out per repository.

```json
{
  "summary": "One line for the card.",
  "description": "The longer paragraph the title view shows.",
  "playUrl": "https://<owner>.github.io/<game-name>/",
  "tags": ["model: one", "puzzle"],
  "status": "playable",
  "added": "2026 · 09"
}
```

This is where the attribution lives — the `model:` tags that say which model built the game, which is
the reason the title view has a tag block at all.

**Fail closed, like the release note:**

| Condition | Result |
| --- | --- |
| Repo not in the README index | Not on the shelf, and nothing is fetched from it |
| Indexed, but no `arcade.json` | On the shelf with only what the index and the repository give: name, and a link |
| `arcade.json` malformed or over the byte bound | On the shelf, file ignored. The card never shows half-parsed data |
| Read fails | Last-good, or the card without the file's fields. Never an empty shelf because one fetch failed |
| No `playUrl` | `"Not playable yet"` — never a Play button that does nothing |

**Never invent a game.** An empty arcade says so plainly. That rule does not relax once discovery works.

## Entry shape

Copy this into `entries.json`:

```json
[
  {
    "title": "Repository name",
    "summary": "One line for the card.",
    "description": "The longer paragraph the title view shows.",
    "playUrl": "https://example.github.io/game/",
    "tags": ["model: one", "puzzle"],
    "status": "playable",
    "added": "2026 · 09"
  }
]
```

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Repository name. Shown as the card title and used as the key. |
| `summary` | yes | One line. Keep it short; the card truncates visually, not in the data. |
| `description` | no | The paragraph the title view shows. This is where the detail goes, so the card can stay quiet. |
| `playUrl` | no | Where the game runs. **Omit it and the title view says "Not playable yet"** rather than showing a button that does nothing. |
| `tags` | yes | Free-form. `model: <name>` tags carry the attribution and sort first, in the accent colour. |
| `status` | yes | `playable` or `workshop`. Decides which shelf it lands on. |
| `added` | no | e.g. `2026 · 09`. Shown in the title view. |

## Rules

- **Never invent a game.** No placeholder entry ships. An empty shelf is honest; a fake entry is not.
- **No raw colour.** The page uses the shared tokens, so light and dark themes both work. The accent is
  the site's own violet (`var(--link)`), not a separate arcade palette.
- **Reuse the shared components.** `Card`, `Badge`, `Button` and `Drawer` already exist. `Drawer` is a
  Radix dialog, which is what gives the title view a real focus trap, Escape-to-close, and phone
  behaviour. Do not hand-roll a modal.
- **The shelf is styled in `globals.css`** under `.arcade-shelf` — snap points, a token-tinted
  scrollbar, contained overscroll. Change it there, not with inline styles.
- **Type is never shrunk** to make a row fit. That rule holds everywhere on this site.
