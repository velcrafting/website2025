import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "./providers";
import { Sidebar } from "@/components/layout";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.className} ${geistMono.variable}`}>
      {/* lock viewport height and prevent document scrolling */}
      <body className="antialiased h-dvh overflow-hidden">
        <Providers>
          <div className="w-full h-full">
            {/* fill viewport and hide overflow at this level */}
            <div className="grid h-full grid-cols-1 md:grid-cols-[320px_1fr] overflow-hidden">
              {/* fixed rail */}
              <aside className="w-[320px] shrink-0">
                <div className="sticky top-0 h-dvh">
                  <Sidebar />
                </div>
              </aside>

              {/* the only scrollable area */}
              <main className="h-dvh overflow-y-auto px-6 mb-6 md:px-10 lg:px-12">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
