// src/app/layout.tsx
import { Geist_Mono, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import Providers from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
