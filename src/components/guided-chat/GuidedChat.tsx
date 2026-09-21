"use client";

import Link from "next/link";
import {
  ArrowRight,
  GripHorizontal,
  MessageCircleQuestion,
  RotateCcw,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  resolveGuideChoice,
  WELCOME_REPLY,
  type GuideChoice,
  type GuideChoiceId,
  type GuideDestination,
  type GuideReply,
} from "./content";

type GuidedChatContextValue = {
  isOpen: boolean;
  openChat: (returnFocusTo?: HTMLElement | null) => void;
  closeChat: () => void;
  messages: TranscriptMessage[];
  pendingChoiceId: GuideChoiceId | null;
  chooseChoice: (choice: GuideChoice) => void;
  startOver: () => void;
};

const GuidedChatContext = createContext<GuidedChatContextValue | null>(null);

export function useGuidedChat() {
  const context = useContext(GuidedChatContext);
  if (!context) throw new Error("useGuidedChat must be used inside GuidedChatProvider");
  return context;
}

type GuidedChatTriggerProps = {
  label?: string;
  className?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onBeforeOpen?: () => void;
  deferOpen?: boolean;
};

export function GuidedChatTrigger({
  label = "Guided chat",
  className,
  returnFocusRef,
  onBeforeOpen,
  deferOpen = false,
}: GuidedChatTriggerProps) {
  const { isOpen, openChat } = useGuidedChat();

  return (
    <button
      type="button"
      aria-controls="guided-chat-panel"
      aria-expanded={isOpen}
      onClick={(event) => {
        onBeforeOpen?.();
        const returnFocusTo = returnFocusRef?.current ?? event.currentTarget;
        if (deferOpen) {
          window.requestAnimationFrame(() => openChat(returnFocusTo));
        } else {
          openChat(returnFocusTo);
        }
      }}
      className={cn(
        "inline-flex min-h-[44px] items-center gap-[var(--space-2)] rounded-[var(--radius-chip)] px-[var(--space-3)] py-[var(--space-2)] text-sm text-ink no-underline transition hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        className,
      )}
    >
      <MessageCircleQuestion className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

type TranscriptMessage = {
  id: string;
  kind: "guide" | "visitor";
  text: string;
  destinations?: readonly GuideDestination[];
  choices?: readonly GuideChoice[];
};

type PanelPosition = { x: number; y: number };
type DragState = PanelPosition & {
  pointerId: number;
  startX: number;
  startY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const PANEL_MARGIN = 16;
const DESKTOP_DRAG_QUERY = "(min-width: 1024px)";

function clamp(value: number, min: number, max: number) {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.min(Math.max(value, lower), upper);
}

function clampPanelPosition(panel: HTMLElement, current: PanelPosition, desired: PanelPosition): PanelPosition {
  const rect = panel.getBoundingClientRect();
  const baseLeft = rect.left - current.x;
  const baseTop = rect.top - current.y;
  return {
    x: clamp(desired.x, PANEL_MARGIN - baseLeft, window.innerWidth - PANEL_MARGIN - rect.width - baseLeft),
    y: clamp(desired.y, PANEL_MARGIN - baseTop, window.innerHeight - PANEL_MARGIN - rect.height - baseTop),
  };
}

function messageFromReply(reply: GuideReply, sequence: number): TranscriptMessage {
  return {
    id: `guide-${reply.id}-${sequence}`,
    kind: "guide",
    text: reply.message,
    destinations: reply.destinations,
    choices: reply.choices,
  };
}

function DestinationCard({ destination }: { destination: GuideDestination }) {
  const content = (
    <>
      <span className="min-w-0">
        <span className="block font-medium text-ink">{destination.label}</span>
        <span className="mt-0.5 block text-xs text-muted">{destination.description}</span>
      </span>
      {destination.unavailable ? null : <ArrowRight className="size-4 shrink-0 text-accent" aria-hidden="true" />}
    </>
  );

  if (destination.unavailable) {
    return (
      <li className="rounded-[var(--radius-chip)] border border-rule bg-paper-raised/60 px-[var(--space-3)] py-[var(--space-2)]">
        {content}
      </li>
    );
  }

  if (destination.external) {
    return (
      <li>
        <a
          href={destination.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[44px] items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-chip)] border border-rule px-[var(--space-3)] py-[var(--space-2)] no-underline transition hover:border-ink hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {content}
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={destination.href ?? "/"}
        className="flex min-h-[44px] items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-chip)] border border-rule px-[var(--space-3)] py-[var(--space-2)] no-underline transition hover:border-ink hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {content}
      </Link>
    </li>
  );
}

function GuidedChatPanel() {
  const { closeChat, messages, pendingChoiceId, chooseChoice, startOver } = useGuidedChat();
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>({ x: 0, y: 0 });
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const shouldAutoScrollRef = useRef(true);

  const isNearBottom = useCallback(() => {
    const element = transcriptRef.current;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 72;
  }, []);

  const scrollToBottom = useCallback(() => {
    const element = transcriptRef.current;
    if (!element) return;
    setHasNewMessages(false);
    nearBottomRef.current = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ top: element.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChat();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [closeChat]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      setHasNewMessages(true);
      shouldAutoScrollRef.current = true;
      return;
    }

    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, scrollToBottom]);

  const latestMessageId = messages[messages.length - 1]?.id;

  const resetPanelPosition = useCallback(() => {
    setPanelPosition({ x: 0, y: 0 });
  }, []);

  const movePanelByKeyboard = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!window.matchMedia(DESKTOP_DRAG_QUERY).matches) return;
    const step = event.shiftKey ? 48 : 24;
    const movement: Record<string, PanelPosition> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    if (event.key === "Home") {
      event.preventDefault();
      resetPanelPosition();
      return;
    }
    const delta = movement[event.key];
    if (!delta) return;
      event.preventDefault();
    setPanelPosition((current) => {
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      return panelRef.current ? clampPanelPosition(panelRef.current, current, next) : next;
    });
  }, [resetPanelPosition]);

  const startPanelDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!window.matchMedia(DESKTOP_DRAG_QUERY).matches || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const baseLeft = rect.left - panelPosition.x;
    const baseTop = rect.top - panelPosition.y;
    dragRef.current = {
      ...panelPosition,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      minX: PANEL_MARGIN - baseLeft,
      maxX: window.innerWidth - PANEL_MARGIN - rect.width - baseLeft,
      minY: PANEL_MARGIN - baseTop,
      maxY: window.innerHeight - PANEL_MARGIN - rect.height - baseTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [panelPosition]);

  const movePanelDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPanelPosition({
      x: clamp(drag.x + event.clientX - drag.startX, drag.minX, drag.maxX),
      y: clamp(drag.y + event.clientY - drag.startY, drag.minY, drag.maxY),
    });
  }, []);

  const endPanelDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_DRAG_QUERY);
    const clampForViewport = () => {
      setPanelPosition((current) => media.matches && panelRef.current
        ? clampPanelPosition(panelRef.current, current, current)
        : { x: 0, y: 0 });
    };
    clampForViewport();
    media.addEventListener("change", clampForViewport);
    window.addEventListener("resize", clampForViewport);
    return () => {
      media.removeEventListener("change", clampForViewport);
      window.removeEventListener("resize", clampForViewport);
    };
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!window.matchMedia(DESKTOP_DRAG_QUERY).matches) return;
      setPanelPosition((current) => clampPanelPosition(panel, current, current));
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={panelRef}
      id="guided-chat-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="guided-chat-title"
      data-guided-chat-panel
      style={{ transform: `translate3d(${panelPosition.x}px, ${panelPosition.y}px, 0)` }}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[min(78dvh,42rem)] w-full flex-col rounded-t-[var(--radius-surface)] border border-rule bg-surface text-ink shadow-[0_8px_32px_color-mix(in_oklab,var(--ink)_18%,transparent)] pb-[calc(var(--space-1)+env(safe-area-inset-bottom))] lg:inset-x-auto lg:bottom-[var(--space-5)] lg:right-[var(--space-6)] lg:w-[min(26rem,calc(100vw-3rem))] lg:rounded-[var(--radius-surface)]"
    >
      <header className="flex shrink-0 items-start justify-between gap-[var(--space-3)] border-b border-rule px-[var(--space-4)] py-[var(--space-3)]">
        <div>
          <p className="meta uppercase tracking-wide">Guided chat · prepared answers</p>
          <h2 id="guided-chat-title" className="mt-1 text-base font-semibold">Where should we start?</h2>
        </div>
        <div className="flex shrink-0 items-center gap-[var(--space-1)]">
          <button
            type="button"
            aria-label="Move guided chat"
            aria-describedby="guided-chat-position-help"
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
            onPointerDown={startPanelDrag}
            onPointerMove={movePanelDrag}
            onPointerUp={endPanelDrag}
            onPointerCancel={endPanelDrag}
            onKeyDown={movePanelByKeyboard}
            className="hidden h-11 w-11 cursor-grab touch-none items-center justify-center rounded-[var(--radius-chip)] text-ink hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:cursor-grabbing lg:inline-flex"
          >
            <GripHorizontal className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Reset guided chat position"
            onClick={resetPanelPosition}
            className="hidden h-11 w-11 items-center justify-center rounded-[var(--radius-chip)] text-ink hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:inline-flex"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={closeChat}
            aria-label="Close guided chat"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-chip)] text-ink hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <span id="guided-chat-position-help" className="sr-only">On desktop, use the arrow keys to move this panel. Press Home to reset its position.</span>
      </header>

      <div
        ref={transcriptRef}
        role="log"
        aria-label="Guided chat transcript"
        tabIndex={-1}
        onScroll={() => {
          const nearBottom = isNearBottom();
          nearBottomRef.current = nearBottom;
          if (nearBottom) setHasNewMessages(false);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-[var(--space-4)] py-[var(--space-4)]"
      >
        <div className="grid gap-[var(--space-4)]">
          {messages.map((message) => (
            <div key={message.id} className={message.kind === "visitor" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={cn(
                  "max-w-[92%] text-sm",
                  message.kind === "visitor"
                    ? "rounded-[var(--radius-chip)] bg-forest px-[var(--space-3)] py-[var(--space-2)] text-[var(--on-accent)]"
                    : "text-ink",
                )}
              >
                <p>{message.text}</p>
                {message.kind === "guide" && message.destinations?.length ? (
                  <ul className="mt-[var(--space-3)] grid gap-[var(--space-2)]">
                    {message.destinations.map((destination) => (
                      <DestinationCard key={destination.id} destination={destination} />
                    ))}
                  </ul>
                ) : null}
                {message.kind === "guide" && message.id === latestMessageId && message.choices?.length ? (
                  <div className="mt-[var(--space-3)] grid gap-[var(--space-2)]">
                    {message.choices.map((choice) => (
                      <Button
                        key={choice.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-left"
                        onClick={() => {
                          chooseChoice(choice);
                          window.requestAnimationFrame(() => transcriptRef.current?.focus({ preventScroll: true }));
                        }}
                      >
                        {choice.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {pendingChoiceId ? (
            <p className="text-sm text-muted" aria-hidden="true">Preparing a reply…</p>
          ) : null}
        </div>
      </div>

      {hasNewMessages ? (
        <div className="absolute bottom-[calc(var(--space-8)+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2">
          <Button type="button" variant="outline" size="sm" onClick={scrollToBottom}>
            New messages
          </Button>
        </div>
      ) : null}

      <footer className="flex shrink-0 flex-wrap gap-[var(--space-2)] border-t border-rule px-[var(--space-4)] pt-[var(--space-1)]">
        <Button type="button" variant="ghost" size="sm" onClick={startOver}>
          <RotateCcw className="size-4" aria-hidden="true" /> Start over
        </Button>
      </footer>
    </section>
  );
}

export default function GuidedChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([
    messageFromReply(WELCOME_REPLY, 0),
  ]);
  const [pendingChoiceId, setPendingChoiceId] = useState<GuideChoiceId | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const responseTimerRef = useRef<number | null>(null);
  const responseGenerationRef = useRef(0);
  const pendingChoiceRef = useRef<GuideChoiceId | null>(null);
  const pendingVisitorIdRef = useRef<string | null>(null);

  const cancelPendingResponse = useCallback(() => {
    if (responseTimerRef.current) {
      window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
    responseGenerationRef.current += 1;
    const pendingVisitorId = pendingVisitorIdRef.current;
    if (pendingVisitorId) {
      setMessages((messages) => messages.filter((message) => message.id !== pendingVisitorId));
    }
    pendingChoiceRef.current = null;
    pendingVisitorIdRef.current = null;
    setPendingChoiceId(null);
  }, []);

  const openChat = useCallback((returnFocusTo?: HTMLElement | null) => {
    returnFocusRef.current = returnFocusTo ?? null;
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    cancelPendingResponse();
    setIsOpen(false);
    const target = returnFocusRef.current;
    if (target?.isConnected) {
      window.requestAnimationFrame(() => target.focus());
    }
  }, [cancelPendingResponse]);

  const chooseChoice = useCallback((choice: GuideChoice) => {
    if (pendingChoiceId) return;

    const reply = resolveGuideChoice(choice.id);
    const visitorMessage = {
      id: `visitor-${choice.id}-${messages.length}`,
      kind: "visitor" as const,
      text: choice.label,
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setMessages((current) => [
        ...current,
        visitorMessage,
        messageFromReply(reply, current.length + 1),
      ]);
      return;
    }

    setMessages((current) => [...current, visitorMessage]);
    pendingChoiceRef.current = choice.id;
    pendingVisitorIdRef.current = visitorMessage.id;
    setPendingChoiceId(choice.id);
    const generation = ++responseGenerationRef.current;
    responseTimerRef.current = window.setTimeout(() => {
      if (responseGenerationRef.current !== generation) return;
      responseTimerRef.current = null;
      setMessages((current) => [...current, messageFromReply(reply, current.length + 1)]);
      pendingChoiceRef.current = null;
      pendingVisitorIdRef.current = null;
      setPendingChoiceId(null);
    }, 300);
  }, [messages.length, pendingChoiceId]);

  const startOver = useCallback(() => {
    cancelPendingResponse();
    setMessages([messageFromReply(WELCOME_REPLY, 0)]);
  }, [cancelPendingResponse]);

  useEffect(() => () => cancelPendingResponse(), [cancelPendingResponse]);

  return (
    <GuidedChatContext.Provider
      value={{ isOpen, openChat, closeChat, messages, pendingChoiceId, chooseChoice, startOver }}
    >
      {children}
      {isOpen ? <GuidedChatPanel /> : null}
    </GuidedChatContext.Provider>
  );
}
