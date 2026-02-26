import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnapFlow AI",
  description: "Real-time event photo delivery MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
