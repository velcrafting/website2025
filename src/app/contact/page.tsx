// src/app/contact/page.tsx
import { ScheduleEmbed, ContactForm } from "@/components/contact";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 space-y-12">
      <section id="contact">
        <h1 className="mb-2 text-2xl font-semibold">Send a message</h1>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
          Prefer email? <a href="mailto:hello@velcrafting.com" className="underline">hello@velcrafting.com</a>
        </p>
        <ContactForm />
      </section>

      <section id="schedule">
        <h2 className="mb-2 text-xl font-semibold">Book time</h2>
        <ScheduleEmbed />
      </section>
    </div>
  );
}