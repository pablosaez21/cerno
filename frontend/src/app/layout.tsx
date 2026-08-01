import type { Metadata } from "next";
import { Martian_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const groteskFont = localFont({
  src: "./fonts/MartianGrotesk.woff2",
  variable: "--font-grotesk",
  display: "swap",
  weight: "100 1000",
  style: "normal",
});

const monoFont = Martian_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Cerno | Chess analysis and training",
  description:
    "Analyze Lichess games or PGN with Stockfish, identify weaknesses, and build a focused training plan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${groteskFont.variable} ${monoFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
