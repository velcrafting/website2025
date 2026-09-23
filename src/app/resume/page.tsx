// src/app/resume/page.tsx
//
// A place to get a resume.
//
// F3, 2026-09-17 — keep the page focused on the formal download and the public context around it.
//
// Steven, 2026-09-16: "for now lets get the page in place, use the same resume in each one (For now)"
// — the shared PDF is explicitly authorised, so this page does not block on four missing files. When a
// role-targeted PDF is selected, link it beside the summary. Local existence alone is not selection.
//
// No phone number and no address appear here. The PDF is the file already published from public/,
// unchanged by this page.

import Link from "next/link";

import { Button } from "@/components/ui";
import { SITE } from "@/config/site";
import { buildMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  buildMetadata({
    title: "Resume",
    description: "Download Steven Pajewski's resume, then read the public context and project evidence.",
    canonicalPath: "/resume",
  });

export default function ResumePage() {
  return (
    <div className="container-index py-[var(--space-7)]">
      <section>
        <h1 className="measure-prose">Resume</h1>
        <p className="lead mt-[var(--space-3)]">
          The formal version is here to download. Read the public context below, then follow the work it
          describes.
        </p>

        {/* One download. Not four buttons pointing at the same file. */}
        <p className="mt-[var(--space-5)]">
          <Button asChild>
            <a href={SITE.resumeUrl} download>
              Download the resume <span aria-hidden="true">↓</span>
            </a>
          </Button>
        </p>
      </section>

      <section className="mt-[var(--space-7)] border-t border-rule pt-[var(--space-4)]" aria-labelledby="resume-context">
        <h2 id="resume-context">See the context</h2>
        <p className="measure-prose mt-[var(--space-2)]">
          <Link href="/about">Read About me</Link> for the role and value-add, or{" "}
          <Link href="/projects">browse Projects</Link> for the evidence.
        </p>
      </section>
    </div>
  );
}
