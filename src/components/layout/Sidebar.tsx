// src/components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { SITE } from "@/config/site";
import {
  Github, Linkedin, Mail, FileText,
  Home, FolderKanban, FlaskConical, PenSquare, User2, CalendarClock,
  Brush,
  LucideToolCase,
  ToolCase,
  LucideHammer
} from "lucide-react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import StickyTOC from "@/components/layout/StickyTOC";
import IconButton from "@/components/ui/IconButton";
import Separator from "@/components/ui/Separator";
import { Card, GradientIcon } from "../ui";
import dynamic from "next/dynamic";
const SidebarArtPanel = dynamic(() => import("@/app/art/components/SidebarArtPanel"), { ssr: false });
// import ThemeToggle from "@/components/ui/ThemeToggle";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/about", label: "About", icon: User2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/writing", label: "Writing", icon: PenSquare },
  { href: "/labs", label: "Tools", icon: LucideHammer },
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
   <div className="flex h-full flex-col rail px-4 py-6 md:px-6 md:py-8 text-neutral-900 dark:text-neutral-100">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Image src="/avatar.png" alt="Steven Pajewski" width={72} height={72} className="rounded-full" />
        <div className="leading-tight">
          <div className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Steven Pajewski</div>
          <div className="text-2xl font-semibold text-center tracking-tight -mt-1 text-neutral-700 dark:text-neutral-300">Velcrafting</div>
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
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition",
                active
                  ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      </Card>

      {/* Art controls */}
      {pathname.startsWith("/art") && (
        <SidebarArtPanel />
      )}

      {/* TOC */}
      {showTOC && (
      <Card>
      <Separator variant="gradient" />
       <div className="mt-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">On this page</div>
          <StickyTOC />
        </div>
        </Card>
      )}

      {/* Footer actions */}
      <div className="mt-auto">
        <Separator variant="gradient" />
        <Card>

      <div className="flex items-center justify-between rounded-sm">
          {/* <ThemeToggle/> */}
          <IconButton className="group !text-white hover:!text-white" href={SITE.links.github} label="GitHub">
            <GradientIcon icon={<Github className="size-5" />} />
          </IconButton>
          <IconButton className="group !text-white hover:!text-white" href={SITE.links.linkedin} label="LinkedIn">
            <GradientIcon icon={<Linkedin className="size-5" />} />
          </IconButton>
          <IconButton className="group !text-white hover:!text-white" href={`mailto:${SITE.email}`} label="Email">
            <GradientIcon icon={<Mail className="size-5" />} />
          </IconButton>
          <IconButton className="group !text-white hover:!text-white" href={SITE.resumeUrl} label="Resume">
            <GradientIcon icon={<FileText className="size-5" />} />
          </IconButton>
        </div>
        </Card>
      </div>
    </div>
  );
}
