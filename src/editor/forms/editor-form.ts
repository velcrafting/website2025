// Reading the editor's form back into block inputs.
//
// This lives in its own module because TWO callers must agree exactly: the save action, and the
// unsaved reader preview. The preview has to show what a save *would* store, so a second copy of
// this reading logic would drift from the first the moment either side changed — and the drift
// would be invisible, because both would still produce *some* output.
//
// Nothing here persists, imports a store, or renders. It only reads a submitted form.

import type { BlockData, BlockKind } from "../contracts/types";
import type { BlockInput } from "../validation/revision";

/**
 * Read one block's kind-specific payload from the form.
 *
 * Only the fields belonging to the selected kind are meaningful; the others arrive empty
 * and `normaliseBlocks` ignores them, so an empty extra field can never become data.
 */
export function blockDataFromForm(formData: FormData, prefix: string): BlockData {
  const read = (field: string) => {
    const value = String(formData.get(`${prefix}${field}`) ?? "").trim();
    return value || undefined;
  };
  return {
    tone: read("tone") as BlockData["tone"],
    title: read("title"),
    src: read("src"),
    alt: read("alt"),
    caption: read("caption"),
  };
}

/**
 * Read the picker's pending new block's payload.
 *
 * The picker names its fields `newTone`, `newSrc`, `newAlt`… — camelCase, unlike the per-block
 * fields which are lowercase (`block.0.tone`). Reading them with the per-block helper silently
 * looked for `newtone`/`newsrc`, so a callout lost its tone and a figure lost the image path and
 * alt text the author had just typed, and the save was then rejected for a field they had filled
 * in. The two naming schemes are stated here rather than inferred.
 */
export function blockDataFromNewForm(formData: FormData): BlockData {
  const read = (field: string) => {
    const value = String(formData.get(`new${field}`) ?? "").trim();
    return value || undefined;
  };
  return {
    tone: read("Tone") as BlockData["tone"],
    title: read("Title"),
    src: read("Src"),
    alt: read("Alt"),
    caption: read("Caption"),
  };
}

/** Read every block the form carries, optionally including the picker's pending new block. */
export function blocksFromForm(formData: FormData, includeNew: boolean): BlockInput[] {
  const count = Number(formData.get("blockCount") ?? 0);
  const blocks: BlockInput[] = [];
  for (let index = 0; index < count; index += 1) {
    const markdown = String(formData.get(`block.${index}.markdown`) ?? "");
    const heading = String(formData.get(`block.${index}.heading`) ?? "");
    // An absent kind keeps the block's stored shape (see normaliseBlocks), so submitting
    // an older revision through this form cannot silently reinterpret it.
    const rawKind = String(formData.get(`block.${index}.kind`) ?? "").trim();
    blocks.push({
      id: String(formData.get(`block.${index}.id`) ?? `blk_${index}`),
      kind: (rawKind || undefined) as BlockKind | undefined,
      heading,
      markdown,
      humanLocked: formData.get(`block.${index}.locked`) === "on",
      origin: "human",
      data: blockDataFromForm(formData, `block.${index}.`),
    });
  }
  if (includeNew) {
    const newKind = String(formData.get("newKind") ?? "").trim();
    // A new block appears only when the picker selected a kind. Its required fields are
    // then validated; an incomplete figure or callout is rejected with a readable reason
    // and nothing is written, rather than being silently dropped.
    if (newKind) {
      blocks.push({
        // The picker mints this identity once and carries it in the form, so the preview and the
        // save describe the same block. Without it each normalisation mints its own UUID and the
        // stored `data-block` and revision hash move for no reason of the author's making.
        id: String(formData.get("newId") ?? "").trim() || undefined,
        kind: newKind as BlockKind,
        heading: String(formData.get("newHeading") ?? ""),
        markdown: String(formData.get("newMarkdown") ?? ""),
        humanLocked: true,
        origin: "human",
        data: blockDataFromNewForm(formData),
      });
    }
  }
  return blocks;
}
