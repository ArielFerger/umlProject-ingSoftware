import type { Metadata } from "next";
import "@fontsource-variable/source-sans-3/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";
import "./study.css";
import "./canvas-interactions.css";
import "./git.css";
import "./themes.css";
import { ThemeManager } from "@/components/theme-picker";

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
      <body className="antialiased"><ThemeManager />{children}</body>
    </html>
  );
}
