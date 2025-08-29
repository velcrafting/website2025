import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "./providers";
import { Sidebar } from "@/components/layout";
import { MobileHeader } from "@/components/layout";
import "@/app/globals.css";
import "@/styles/prose.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Steven Pajewski",
    template: "%s · Steven Pajewski",
  },
  description: "Portfolio",
  openGraph: {
    siteName: "Steven Pajewski",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.className} ${geistMono.variable}`}>
      {/* lock viewport height and prevent document scrolling */}
      <body className="antialiased h-dvh overflow-hidden">
        <Providers>
          <div className="w-full h-full">
            {/* fill viewport and hide overflow at this level */}
            <div className="grid h-full grid-cols-1 2xl:grid-cols-[320px_1fr] overflow-hidden">
              {/* fixed rail */}
              <aside className="w-[320px] shrink-0 hidden 2xl:block">
                <div className="sticky top-0 h-dvh">
                  <Sidebar />
                </div>
              </aside>

              {/* the only scrollable area */}
              <main className="h-dvh overflow-y-auto px-6 mb-6 md:px-10 lg:px-12 scroll-area">
                {/* Mobile top bar with hamburger menu */}
                <div className="2xl:hidden pt-4">
                  <MobileHeader />
                </div>
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
