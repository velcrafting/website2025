"use client";
//
// shadcn-backed shared Drawer (docs/2026-refresh.md §4).
//
// Behaviour comes from Radix Dialog: the focus trap the previous hand-rolled version
// lacked, `aria-hidden` on the rest of the document, and the scroll lock.
//
// Two defects fixed after review (CODEX_REFRESH_REVIEW.md finding 3):
//
//  1. FOCUS RETURNED TO THE DOCUMENT. Radix restores focus to its own Dialog.Trigger,
//     but this drawer's trigger lives in the caller (the site menu button in
//     MobileHeader), so closing left focus on <body> — a keyboard user lost their
//     place. The caller now passes `returnFocusTo` and `onCloseAutoFocus` focuses it
//     explicitly.
//  2. THE TITLE SAT OUTSIDE THE PANEL BACKGROUND. The surface colour was on an inner
//     div, so the visible "Menu" title rendered on whatever was behind the panel. The
//     surface, border and scroll area now belong to the panel itself, and the title is
//     inside it.
//
// The public API is extended, not changed: { open, onClose, side, title, children }
// still work unchanged, and `returnFocusTo` is optional.
import * as Dialog from "@radix-ui/react-dialog";
import type { RefObject } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  side?: "right" | "left";
  title?: string;
  children: React.ReactNode;
  /**
   * The control that opened the drawer. Focus returns here on close. Pass this
   * whenever the trigger is outside the Drawer — otherwise focus lands on <body>.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
};

export default function Drawer({
  open,
  onClose,
  side = "right",
  title,
  children,
  returnFocusTo,
}: Props) {
  const origin = side === "right" ? "right-0" : "left-0";
  const borderSide = side === "right" ? "border-l" : "border-r";
  // Both literals must appear verbatim in the source: Tailwind scans text, so an
  // interpolated class name is never generated.
  const closedTransform =
    side === "right"
      ? "data-[state=closed]:translate-x-full"
      : "data-[state=closed]:-translate-x-full";

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="scrim fixed inset-0 z-50 backdrop-blur-sm transition-opacity duration-[var(--motion-slow)] data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
        />
        <Dialog.Content
          className={`${borderSide} fixed top-0 ${origin} z-50 flex h-full w-[28rem] max-w-[90vw] transform flex-col border-rule bg-surface text-ink transition-transform duration-[var(--motion-slow)] data-[state=open]:translate-x-0 ${closedTransform} focus:outline-none`}
          // Radix warns unless the content is labelled.
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            // Radix would focus its own Trigger, which does not exist here.
            const target = returnFocusTo?.current;
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <Dialog.Title
            className={
              title
                ? "shrink-0 border-b border-rule px-[var(--space-4)] py-[var(--space-3)] text-base font-semibold text-ink"
                : "sr-only"
            }
          >
            {title ?? "Menu"}
          </Dialog.Title>
          {/*
            min-h-0 lets this flex child shrink so the panel scrolls on a short
            viewport instead of overflowing.
          */}
          <div className="min-h-0 flex-1 overflow-y-auto p-[var(--space-4)]">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
