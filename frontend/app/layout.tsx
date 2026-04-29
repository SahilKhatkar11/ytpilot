import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YTPilot",
  description: "Liquid Glass yt-dlp control tower with server-side FFmpeg processing.",
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
