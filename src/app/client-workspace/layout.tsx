import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isClientHost } from "@/consulting/server/request-boundary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Velcrafting client workspace", robots: { index: false, follow: false } };

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  if (!isClientHost((await headers()).get("host"))) notFound();
  return <main className="container-page px-[var(--gutter)] py-8">
    <header className="mb-8 border-b border-rule pb-4">
      <Link href="/">Velcrafting client workspace</Link>
    </header>
    {children}
  </main>;
}
