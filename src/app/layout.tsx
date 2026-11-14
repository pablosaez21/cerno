import type { Metadata } from "next";

const description = "Tus últimas partidas, analizadas en tu navegador: qué te cuesta puntos y qué entrenar.";

// Icons and the share preview are the files next to this layout (icon.svg, favicon.ico, apple-icon.png,
// opengraph-image.png, twitter-image.png). Set NEXT_PUBLIC_SITE_URL when deploying so their URLs are absolute.
export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: "Cerno",
  description,
  openGraph: { title: "Cerno", description, type: "website" },
  twitter: { card: "summary_large_image", title: "Cerno", description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
