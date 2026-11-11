import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// The site's three faces (web/src/app/layout.tsx): Sora body, Michroma for the wordmark, labels and
// buttons, Chivo Mono for numbers and utility labels. Self-hosted copies of the Google Fonts files
// (github.com/google/fonts, OFL licences in src/fonts/) so builds never fetch from Google.
const sora = localFont({ src: "../fonts/sora-v1.woff2", variable: "--font-sora", weight: "300 600", style: "normal", display: "swap" });
const michroma = localFont({ src: "../fonts/michroma-v1.woff2", variable: "--font-michroma", weight: "400", style: "normal", display: "swap" });
const chivoMono = localFont({ src: "../fonts/chivo-mono-v1.woff2", variable: "--font-chivo-mono", weight: "400 500", style: "normal", display: "swap" });

export const metadata: Metadata = {
  title: "Launch Control CRM",
  description: "Launch Control pipeline: leads, deals, tasks and scored lead-gen prospects.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${michroma.variable} ${chivoMono.variable}`}>
      <body
        className="flex min-h-svh flex-col bg-[var(--color-bg-primary)] text-[var(--color-text)]"
      >
        {children}
      </body>
    </html>
  );
}
