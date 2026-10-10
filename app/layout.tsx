import type { Metadata } from "next";
import "./globals.css";
import "./study.css";
import "./canvas-interactions.css";

export const metadata: Metadata = {
  title: "UML Studio",
  description: "Diagramas UML y estudio de Ingeniería de Software II con teoría y práctica por niveles.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
