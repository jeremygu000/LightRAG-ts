import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LightRAG UI",
  description: "A modern interface for LightRAG TypeScript",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
