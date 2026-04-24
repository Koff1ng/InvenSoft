import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d0d0d',
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "La Comitiva - Inventarios",
  description: "Sistema de inventario para restaurante La Comitiva",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'La Comitiva',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen font-[var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
