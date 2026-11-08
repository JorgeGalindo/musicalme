import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Nav from "./components/Nav";

// Served from the repo (Fontsource, OFL) so the build never depends on Google Fonts.
const robotoMono = localFont({
  src: "./fonts/roboto-mono-latin-wght-normal.woff2",
  variable: "--font-mono",
  weight: "100 700",
});

export const metadata: Metadata = {
  title: "musicalme",
  description: "Music analytics and playlists from my own listening history",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${robotoMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-[family-name:var(--font-mono)]">
        <Nav />
        {children}
      </body>
    </html>
  );
}
