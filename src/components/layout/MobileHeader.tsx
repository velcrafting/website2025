"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Drawer from "@/components/ui/Drawer";
import { Github, Linkedin, Mail, FileText, Menu, X, Home, FolderKanban, FlaskConical, PenSquare, User2, CalendarClock, Brush } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { GradientIcon } from "@/components/ui";
import { SITE } from "@/config/site";
import clsx from "clsx";
import dynamic from "next/dynamic";
const SidebarArtPanel = dynamic(() => import("@/app/art/components/SidebarArtPanel"), { ssr: false });

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/about", label: "About", icon: User2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/writing", label: "Writing", icon: PenSquare },
  { href: "/labs", label: "Case Studies", icon: FlaskConical },
  { href: "/contact", label: "Contact", icon: CalendarClock },
  { href: "/art", label: "Something Different", icon: Brush },
];

export default function MobileHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex items-center justify-between">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <Image src="/avatar.png" alt="Steven Pajewski" width={32} height={32} className="rounded-full" />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Steven Pajewski</div>
          <div className="text-[11px] text-neutral-600 dark:text-neutral-300">Velcrafting</div>
        </div>
      </div>

      {/* Hamburger */}
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <Menu className="size-5" />
      </button>

      {/* Drawer */}
      <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Menu">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Image src="/avatar.png" alt="Steven Pajewski" width={40} height={40} className="rounded-full" />
            <div className="leading-tight">
              <div className="text-base font-semibold">Steven Pajewski</div>
              <div className="text-xs text-neutral-600 dark:text-neutral-300">Velcrafting</div>
            </div>
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="mt-2 grid gap-1.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
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

        {/* Art controls when on art page */}
        {pathname.startsWith("/art") && (
          <div className="mt-6">
            <SidebarArtPanel />
          </div>
        )}

        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Connect</div>
          <div className="flex items-center gap-2">
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
        </div>
      </Drawer>
    </div>
  );
}
