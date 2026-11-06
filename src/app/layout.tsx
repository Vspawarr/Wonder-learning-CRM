import type { Metadata, Viewport } from "next";
import { Figtree, Quicksand } from "next/font/google";
import "./globals.css";

// Headings: Quicksand, rounded and friendly (Adobe's type-palette pick for an educational brand, R52); body: Figtree.
const quicksand = Quicksand({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-quicksand" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: { default: "Wonder Learning CRM", template: "%s · Wonder Learning" },
  description: "Sales & leads for Wonder Learning India",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${quicksand.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}
