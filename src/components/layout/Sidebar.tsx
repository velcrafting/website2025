// src/components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import SecretAvatar from "@/components/SecretAvatar";
import { useEffect, useState } from "react";
import { SITE } from "@/config/site";
import {
  Github,
  Linkedin,
  Mail,
  FileText,
  Home,
  FolderKanban,
  PenSquare,
  User2,
  Gamepad2,
  LucideHammer,
  LayoutDashboard,
  FilePlus2,
  Send,
  Compass,
} from "lucide-react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import StickyTOC from "@/components/layout/StickyTOC";
import IconButton from "@/components/ui/IconButton";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { GradientIcon } from "../ui";
import { GuidedChatTrigger } from "@/components/guided-chat";
import dynamic from "next/dynamic";
const SidebarArtPanel = dynamic(
  () => import("@/app/art/components/SidebarArtPanel"),
  { ssr: false }
);
// import ThemeToggle from "@/components/ui/ThemeToggle";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/connect", label: "Connect", icon: Compass },
  { href: "/about", label: "About", icon: User2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/blog", label: "Blog", icon: PenSquare },
  { href: "/tools", label: "Tools", icon: LucideHammer },
  // No "/contact" entry: D1 consolidated the connect/contact surfaces and /contact
  // redirects to /connect, so a second nav item would only name a page that leaves
  // immediately. The URL still resolves for old links (src/app/contact/page.tsx).
  { href: "/arcade", label: "Arcade", icon: Gamepad2 },
];

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/new", label: "New Article", icon: FilePlus2 },
  { href: "/admin/newsletter", label: "Newsletter", icon: Send },
];

// Concept 03: a hairline rule between groups instead of repeated bordered cards.
function SidebarGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mt-[var(--space-5)]">
      <hr className="rule" />
      <div className="pt-[var(--space-4)]">
        {label ? (
          <p className="meta mb-[var(--space-2)] uppercase tracking-wide">{label}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function NavList({
  items,
  pathname,
}: {
  items: typeof nav;
  pathname: string;
}) {
  return (
    <nav className="grid gap-[var(--space-1)]">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex min-h-[44px] items-center gap-[var(--space-3)] rounded-[var(--radius-chip)] px-[var(--space-3)] py-[var(--space-2)] text-sm no-underline transition",
              active
                ? "bg-rule text-ink"
                : "text-ink hover:bg-paper-raised",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/admin")
      .then((res) => (res.ok ? res.json() : { admin: false }))
      .then((data) => setIsAdmin(Boolean(data.admin)))
      .catch(() => setIsAdmin(false));
  }, []);

  const showTOC =
    pathname.startsWith("/projects") ||
    pathname.startsWith("/tools") ||
    pathname.startsWith("/blog");

  return (
    <div className="rail flex h-full flex-col overflow-y-auto px-[var(--space-4)] py-[var(--space-6)] text-ink md:px-[var(--space-5)]">
      {/* Identity: Steven and Vel are shown together so a visitor who met the
          card recognises who this is (concept 03 recognition principle). */}
      <div className="flex items-center gap-[var(--space-3)]">
        <SecretAvatar size={64} />
        <div>
          <p className="text-[1.05rem] font-semibold tracking-tight text-ink">
            Steven Pajewski
          </p>
          <p className="meta">you can call me Vel</p>
        </div>
      </div>

      <SidebarGroup>
        <NavList items={nav} pathname={pathname} />
        <GuidedChatTrigger className="mt-[var(--space-1)] w-full justify-start" />
      </SidebarGroup>

      {pathname.startsWith("/art") && <SidebarArtPanel />}

      {showTOC && (
        <SidebarGroup label="On this page">
          <StickyTOC />
        </SidebarGroup>
      )}

      {isAdmin && (
        <SidebarGroup label="Admin pages">
          <NavList items={adminNav} pathname={pathname} />
        </SidebarGroup>
      )}

      <div className="mt-auto">
        <SidebarGroup>
          <ThemeToggle className="mb-[var(--space-3)] w-full justify-center" />
          <div className="flex items-center justify-between">
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
        </SidebarGroup>
      </div>
    </div>
  );
}
