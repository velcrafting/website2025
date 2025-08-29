// src/app/contact/page.tsx
import { ScheduleEmbed, ContactForm } from "@/components/contact";
import { ChevronDown } from "lucide-react";
import { buildMetadata } from "@/lib/seo";

export const generateMetadata = () =>
  buildMetadata({
    title: "Contact",
    description: "Get in touch to discuss communications strategy, AI systems, and community operations.",
    canonicalPath: "/contact",
  });

export default function Page() {
  return (
    <div className="mx-auto px-6 py-12 space-y-6">
      <section id="contact">
        <details className="group rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-4" open>
          <summary className="flex cursor-pointer items-center justify-between list-none">
            <h1 className="text-2xl font-semibold">Send a message</h1>
            <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-4">
            <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
              Prefer email? <a href="mailto:steven@velcrafting.com" className="underline">steven@velcrafting.com</a>
            </p>
            <ContactForm />
          </div>
        </details>
      </section>

      <section id="schedule">
        <details className="group rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-4">
          <summary className="flex cursor-pointer items-center justify-between list-none">
            <h2 className="text-2xl font-semibold">Schedule a meeting</h2>
            <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Book time that fits your schedule — let’s talk about your project, goals, and next steps.
          </div>
          <div className="mt-4">
            <ScheduleEmbed />
          </div>
        </details>
      </section>
    </div>
  );
}
