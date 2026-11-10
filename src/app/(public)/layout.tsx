import type { Metadata } from "next";
import Script from "next/script";
import { Sidebar, MobileHeader } from "@/components/layout";
import { GuidedChatProvider } from "@/components/guided-chat";
import { SITE_URL, SHARE_CARD_DESCRIPTION, SHARE_CARD_IMAGE, SHARE_CARD_TITLE, organizationSchema, personSchema } from "@/lib/seo";

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

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
    </>
  );
}
