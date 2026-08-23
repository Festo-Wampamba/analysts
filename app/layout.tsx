import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Analysts | Daily Idea Engine",
  description: "Cross-sectional equity screening with AI-generated research narratives.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-canvas text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
