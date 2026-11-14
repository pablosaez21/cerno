import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cerno",
  description: "Tus últimas partidas, analizadas en tu navegador: qué te cuesta puntos y qué entrenar.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
