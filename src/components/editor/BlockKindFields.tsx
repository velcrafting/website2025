"use client";

// Kind selector and its kind-specific fields for one editor block.
//
// The fields must FOLLOW the current selection, not the stored kind. When this was
// server-rendered from the stored block, choosing "Figure" changed nothing on screen, so the
// required image and alt fields never appeared and the save was rejected for a field the
// author had no way to fill. The selector and the fields it controls therefore live in one
// client component that owns the choice.

import { useState } from "react";

import Input from "@/components/ui/Input";
import { BLOCK_KINDS, type BlockData, type BlockKind } from "@/editor/contracts/types";

const KIND_LABELS: Record<BlockKind, string> = {
  paragraph: "Paragraph",
  heading: "Section heading",
  callout: "Callout",
  figure: "Figure",
};

const FIELD_CLASS =
  "w-full rounded-[var(--radius-surface)] border border-[var(--input)] bg-[var(--field-background)] px-2 py-1 text-ink";
const SELECT_CLASS =
  "rounded-[var(--radius-chip)] border border-[var(--input)] bg-[var(--field-background)] px-[var(--space-3)] py-[var(--space-2)] text-ink";

type Props = {
  index: number;
  initialKind: BlockKind;
  initialData: BlockData;
};

export default function BlockKindFields({ index, initialKind, initialData }: Props) {
  const [kind, setKind] = useState<BlockKind>(initialKind);

  const fieldId = (name: string) => `block-${index}-${name}`;

  return (
    <>
      <label className="block text-sm" htmlFor={fieldId("kind")}>
        Component
      </label>
      <select
        id={fieldId("kind")}
        name={`block.${index}.kind`}
        value={kind}
        onChange={(event) => setKind(event.target.value as BlockKind)}
        className={`mt-1 ${SELECT_CLASS}`}
      >
        {BLOCK_KINDS.map((option) => (
          <option key={option} value={option}>
            {KIND_LABELS[option]}
          </option>
        ))}
      </select>

      {kind === "callout" ? (
        <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-chip)] border border-rule p-2">
          <label className="text-sm" htmlFor={fieldId("tone")}>
            Callout tone
          </label>
          <select
            id={fieldId("tone")}
            name={`block.${index}.tone`}
            defaultValue={initialData.tone ?? "note"}
            className={SELECT_CLASS}
          >
            <option value="note">Note</option>
            <option value="tip">Tip</option>
            <option value="warning">Warning</option>
          </select>
          <label className="text-sm" htmlFor={fieldId("title")}>
            Callout title (optional)
          </label>
          <input
            id={fieldId("title")}
            name={`block.${index}.title`}
            defaultValue={initialData.title ?? ""}
            className={FIELD_CLASS}
          />
          <p className="meta">
            A callout needs text below. Its tone is also stated in words, so it never relies on
            colour alone.
          </p>
        </div>
      ) : null}

      {kind === "figure" ? (
        <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-chip)] border border-rule p-2">
          <label className="text-sm" htmlFor={fieldId("src")}>
            Image path (local, under /public)
          </label>
          <Input
            id={fieldId("src")}
            name={`block.${index}.src`}
            defaultValue={initialData.src ?? ""}
            placeholder="/projects/example/hero.png"
          />
          <label className="text-sm" htmlFor={fieldId("alt")}>
            Alt text (required)
          </label>
          <Input
            id={fieldId("alt")}
            name={`block.${index}.alt`}
            defaultValue={initialData.alt ?? ""}
            placeholder="What the image shows"
          />
          <label className="text-sm" htmlFor={fieldId("caption")}>
            Caption (optional)
          </label>
          <input
            id={fieldId("caption")}
            name={`block.${index}.caption`}
            defaultValue={initialData.caption ?? ""}
            className={FIELD_CLASS}
          />
          <p className="meta">
            A figure needs both an image path and alt text. The path must be a plain local path —
            nothing that has to be decoded first.
          </p>
        </div>
      ) : null}
    </>
  );
}
