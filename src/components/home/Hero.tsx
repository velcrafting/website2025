import Link from "next/link";

export default function Hero() {
  return (
    <section className="py-2">
{/*       <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold leading-[0.95] tracking-tight text-white">
        Strategic<br />Communications Leader
      </h1>

      {/* let copy wrap naturally, but protect line length *
      <p className="mt-4 text-neutral-400 text-lg">
        Managing brand sentiment and empowering communities.
      </p>
 */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/Steven_Pajewski_Resume.pdf"
            className="rounded-xl border border-neutral-700/80 px-8 py-2 text-md text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            View CV
          </Link>
          <a
            href="mailto:spajewski@outlook.com"
            className="rounded-xl border border-neutral-700/80 px-8 py-2 text-md text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Email
          </a>
          <a
            href="https://linkedin.com/in/spajewski"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-neutral-700/80 px-8 py-2 text-md text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            LinkedIn
          </a>
        </div>
    </section>
  );
}
