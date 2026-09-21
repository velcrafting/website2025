"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import SecretAvatar from "@/components/SecretAvatar";
import { usePathname } from "next/navigation";
import Drawer from "@/components/ui/Drawer";
import { Github, Linkedin, Mail, FileText, Menu, X, Home, FolderKanban, PenSquare, User2, LucideHammer, Compass, Gamepad2 } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { GradientIcon } from "@/components/ui";
import { SITE } from "@/config/site";
import { GuidedChatTrigger } from "@/components/guided-chat";
import clsx from "clsx";
import dynamic from "next/dynamic";
const SidebarArtPanel = dynamic(() => import("@/app/art/components/SidebarArtPanel"), { ssr: false });

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/connect", label: "Connect", icon: Compass },
  { href: "/about", label: "About", icon: User2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/blog", label: "Blog", icon: PenSquare },
  { href: "/tools", label: "Tools", icon: LucideHammer },
  // No "/contact" entry — D1 consolidated connect/contact and /contact now redirects
  // to /connect. The URL still resolves for existing links.
  { href: "/arcade", label: "Arcade", icon: Gamepad2 },
];

export default function MobileHeader() {
  const [open, setOpen] = useState(false);
  // Focus must return to this control when the drawer closes; the trigger is outside
  // the Drawer, so Radix cannot restore it on its own.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  return (
    <div className="flex items-center justify-between gap-[var(--space-3)]">
      {/* Identity */}
      <div className="flex items-center gap-[var(--space-2)]">
        <SecretAvatar size={32} />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-ink">Steven Pajewski</p>
          <p className="meta">you can call me Vel</p>
        </div>
      </div>

      {/* Hamburger — 44px minimum target */}
      <button
        ref={triggerRef}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-chip)] text-ink hover:bg-paper-raised"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {/* Drawer */}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="left"
        title="Menu"
        returnFocusTo={triggerRef}
      >
        <div className="mb-[var(--space-3)] flex items-center justify-between gap-[var(--space-3)]">
          <div className="flex items-center gap-[var(--space-3)]">
            <SecretAvatar size={40} />
            <div className="leading-tight">
              <p className="text-base font-semibold text-ink">Steven Pajewski</p>
              <p className="meta">you can call me Vel</p>
            </div>
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-chip)] text-ink hover:bg-paper-raised"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <nav className="mt-[var(--space-2)] grid gap-[var(--space-1)]">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex min-h-[44px] items-center gap-[var(--space-3)] rounded-[var(--radius-chip)] px-[var(--space-3)] py-[var(--space-2)] text-sm no-underline transition",
                  active ? "bg-rule text-ink" : "text-ink hover:bg-paper-raised",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <GuidedChatTrigger
          returnFocusRef={triggerRef}
          onBeforeOpen={() => setOpen(false)}
          deferOpen
          className="mt-[var(--space-2)] w-full justify-start"
        />

        {pathname.startsWith("/art") && (
          <div className="mt-[var(--space-5)]">
            <SidebarArtPanel />
          </div>
        )}

        <div className="mt-[var(--space-5)]">
          <hr className="rule mb-[var(--space-4)]" />
          <p className="meta mb-[var(--space-2)] uppercase tracking-wide">Connect</p>
          <div className="flex items-center gap-[var(--space-2)]">
            <IconButton href={SITE.links.github} label="GitHub">
              <GradientIcon icon={<Github className="size-5" />} />
            </IconButton>
            <IconButton href={SITE.links.linkedin} label="LinkedIn">
              <GradientIcon icon={<Linkedin className="size-5" />} />
            </IconButton>
            <IconButton href={`mailto:${SITE.email}`} label="Email">
              <GradientIcon icon={<Mail className="size-5" />} />
            </IconButton>
            <IconButton href={SITE.resumeUrl} label="View resume (PDF)">
              <GradientIcon icon={<FileText className="size-5" />} />
            </IconButton>
          </div>
          <div className="mt-[var(--space-4)]">
            <ThemeToggle className="w-full justify-center" />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
