import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESP32-S3-Touch-AMOLED-1.43 | Visor 3D",
  description:
    "Visor 3D interactivo del Waveshare ESP32-S3-Touch-AMOLED-1.43, renderizado con Three.js sobre Next.js 16 en Docker.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="dark">
      <body className={`${GeistSans.className} antialiased`}>{children}</body>
    </html>
  );
}
