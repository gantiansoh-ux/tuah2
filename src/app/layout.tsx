import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TUAH.com — Tournament Umpire Automation Hawkeye",
  description: "DIY Tournament Management. Host, play, umpire, coach, court booking — all in one platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
