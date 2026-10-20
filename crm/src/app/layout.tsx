import type { Metadata } from "next";
import { Chivo_Mono, Michroma, Sora } from "next/font/google";
import "./globals.css";

// The site's three faces (web/src/app/layout.tsx): Sora body, Michroma for the wordmark, labels and
// buttons, Chivo Mono for numbers and utility labels.
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const michroma = Michroma({ variable: "--font-michroma", subsets: ["latin"], weight: ["400"], display: "swap" });
const chivoMono = Chivo_Mono({ variable: "--font-chivo-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: "Launch Control CRM",
  description: "Launch Control CRM: today's work, leads, deals.",
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
