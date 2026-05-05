import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeSnap — AI-powered snippet manager",
  description:
    "Your code snippets, instantly searchable with semantic AI. Save once, find forever.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-app font-sans">{children}</body>
    </html>
  );
}
