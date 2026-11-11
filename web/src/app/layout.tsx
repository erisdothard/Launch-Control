import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { site } from "@/content/site";

// Self-hosted copies of the Google Fonts files (github.com/google/fonts, OFL licences in src/fonts/),
// so builds never fetch from Google. Sora and Chivo Mono are variable fonts; the weight ranges cover the
// weights the site used to request.
const sora = localFont({
  src: "../fonts/sora-v1.woff2",
  variable: "--font-sora",
  weight: "400 600",
  style: "normal",
  display: "swap",
});

const michroma = localFont({
  src: "../fonts/michroma-v1.woff2",
  variable: "--font-michroma",
  weight: "400",
  style: "normal",
  display: "swap",
});

const chivoMono = localFont({
  src: "../fonts/chivo-mono-v1.woff2",
  variable: "--font-chivo-mono",
  weight: "400 500",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: site.seo.title,
  description: site.seo.description,
  metadataBase: new URL(site.seo.url),
  openGraph: {
    title: site.seo.title,
    description: site.seo.description,
    type: "website",
    siteName: site.brand.name,
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${michroma.variable} ${chivoMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-background text-text">{children}</body>
    </html>
  );
}
