import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Brag Doc Generator",
  description: "AI-powered daily achievement tracking and performance coaching",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
