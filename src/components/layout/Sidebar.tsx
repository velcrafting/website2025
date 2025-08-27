// src/components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { SITE } from "@/config/site";
import {
  Github, Linkedin, Mail, FileText,
  Home, FolderKanban, FlaskConical, PenSquare, User2, CalendarClock,
  Brush
} from "lucide-react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import StickyTOC from "@/components/layout/StickyTOC";
import IconButton from "@/components/ui/IconButton";
import Separator from "@/components/ui/Separator";
import { Card } from "../ui";
import ThemeToggle from "@/components/ui/ThemeToggle";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/about", label: "About", icon: User2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/writing", label: "Writing", icon: PenSquare },
  { href: "/labs", label: "Case Studies", icon: FlaskConical },
  { href: "/contact", label: "Contact", icon: CalendarClock },
    { href: "/art", label: "Something Different", icon: Brush },
];

export default function Sidebar() {
  const pathname = usePathname();
  const showTOC =
    pathname.startsWith("/projects") ||
    pathname.startsWith("/labs") ||
    pathname.startsWith("/writing");

  return (
    <div className="flex h-full flex-col border-r border-neutral-800 bg-neutral-900 px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Image src="/avatar.png" alt="Steven Pajewski" width={72} height={72} className="rounded-full" />
        <div className="leading-tight">
          <div className="text-2xl font-semibold tracking-tight">Steven Pajewski</div>
          <div className="text-2xl font-semibold text-center tracking-tight -mt-1">Velcrafting</div>
        </div>
      </div>

      {/* Nav */}

      <Card>
      <Separator variant="gradient" />
      <nav className=" grid gap-1.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-lg transition",
                active ? "bg-neutral-800 text-white" : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      </Card>

      {/* TOC */}
      {showTOC && (
      <Card>
      <Separator variant="gradient" />
       <div className="mt-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-neutral-300">On this page</div>
          <StickyTOC />
        </div>
        </Card>
      )}

      {/* Footer actions */}
      <div className="mt-auto">
        <Separator variant="gradient" />
        <Card>
        <div className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 p-3">
        <ThemeToggle/>
        </div>
        <div className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 p-3">
          <IconButton href={SITE.links.github} label="GitHub"><Github className="size-5" /></IconButton>
          <IconButton href={SITE.links.linkedin} label="LinkedIn"><Linkedin className="size-5" /></IconButton>
          <IconButton href={`mailto:${SITE.email}`} label="Email"><Mail className="size-5" /></IconButton>
          <IconButton href={SITE.resumeUrl} label="Resume"><FileText className="size-5" /></IconButton>
        </div>
        </Card>
      </div>
    </div>
  );
}