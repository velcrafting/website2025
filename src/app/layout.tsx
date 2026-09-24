// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist_Mono, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import Script from "next/script";
import Providers from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import { Sidebar } from "@/components/layout";
import { MobileHeader } from "@/components/layout";
import { GuidedChatProvider } from "@/components/guided-chat";
import {
  SITE_URL,
  SHARE_CARD_DESCRIPTION,
  SHARE_CARD_IMAGE,
  SHARE_CARD_TITLE,
  organizationSchema,
  personSchema,
} from "@/lib/seo";
import "@/app/globals.css";
import "@/styles/prose.css";

// Concept 03 typography: a contemporary serif for headings and editorial reading,
// paired with a restrained sans for controls, labels and utility text. Both are
// declared as CSS variables so the token layer falls back to a local stack if a
// font fails to load.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Velcrafting",
    template: "%s · Velcrafting",
  },
  description: SHARE_CARD_DESCRIPTION,
  icons: { icon: "/logo.svg" },

  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Velcrafting",
    title: SHARE_CARD_TITLE,
    description: SHARE_CARD_DESCRIPTION,
    images: [{ url: SHARE_CARD_IMAGE, width: 1200, height: 630 }],
  },

  twitter: {
    card: "summary_large_image",
    title: SHARE_CARD_TITLE,
    description: SHARE_CARD_DESCRIPTION,
    images: [SHARE_CARD_IMAGE],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },

  alternates: { canonical: SITE_URL },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // The pre-paint theme script sets the light/dark class on this element before paint,
      // so the client class is intentionally not the server's. Suppressing the warning here
      // is what keeps a correct, flash-free theme from being reported as a hydration bug.
      suppressHydrationWarning
      className={`${sourceSerif.variable} ${sourceSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        {/*
          Theme initialisation, first in the body so it runs before the rest of the document
          is painted. Deliberately a raw inline <script>, not next/script: next/script defers,
          which is exactly the wrong-theme flash this prevents. The logic lives beside the
          provider it must agree with (THEME_INIT_SCRIPT) so the two cannot drift.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Script
          id="ld-organization-global"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }}
        />
        <Script
          id="ld-person-global"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema()) }}
        />
        <Providers>
          <GuidedChatProvider>
            {/*
              Ordinary document scrolling. The previous shell locked the viewport
              height and scrolled inside <main>, which trapped nested scrolling and
              conflicted with the mobile reading order concept 03 requires. The rail
              is sticky instead of a fixed-height scroll region.
            */}
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <div className="grid min-h-dvh grid-cols-1 2xl:grid-cols-[256px_1fr]">
              <aside className="hidden w-[256px] shrink-0 2xl:block">
                <div className="sticky top-0 h-dvh">
                  <Sidebar />
                </div>
              </aside>

              <main id="main" className="px-[var(--gutter)] pb-[var(--space-8)] md:px-10 lg:px-12">
                <div className="2xl:hidden pt-4">
                  <MobileHeader />
                </div>
                {children}
              </main>
            </div>
          </GuidedChatProvider>
        </Providers>
      </body>
    </html>
  );
}
