import type { Metadata } from "next";
import ConsultingResources from "@/components/consulting/ConsultingResources";
import Button from "@/components/ui/Button";
import { SITE } from "@/config/site";
import { SITE_URL } from "@/lib/seo";
import { parseService } from "@/consulting/brief";
import BriefDesk from "./BriefDesk";

export const metadata: Metadata = {
  title: "AI, Software & Communications Consulting",
  description: "Velcrafting helps teams with AI workflows, custom software and communications. Based in Spring, Texas, serving The Woodlands, greater Houston and remote clients worldwide.",
  alternates: { canonical: `${SITE_URL}/consulting` },
};

export default async function ConsultingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const selectedService = parseService((await searchParams).service);

  return (
    <div data-consulting-page className="container-page pt-2 md:pt-3">
      <header className="border-b border-rule pb-3 md:pb-4">
        <p className="meta uppercase tracking-wide">Velcrafting · Consulting</p>
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <h1 className="text-[clamp(1.875rem,3.2vw,2.625rem)]!">Fix the work that keeps getting stuck.</h1>
          <Button asChild variant="ghost" size="sm"><a href="#schedule">Schedule a conversation</a></Button>
        </div>
        <p className="mt-1">Steven helps fix the workflow, software, or messaging slowing you down and leaves your team with a solution it can run.</p>
        <p className="mt-1 text-sm">Based in Spring, Texas, serving The Woodlands and greater Houston, with remote engagements worldwide.</p>
      </header>

      <BriefDesk initialService={selectedService} bookingUrl={SITE.bookingUrl} contactEmail={SITE.email} />

      <div className="flex flex-wrap items-start justify-between gap-x-5 border-t border-rule pt-1">
        <ConsultingResources />
        <a href={`mailto:${SITE.email}`} className="inline-flex min-h-11 items-center">Email Steven</a>
      </div>
    </div>
  );
}
