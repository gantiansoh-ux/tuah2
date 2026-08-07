import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TUAH.com — Tournament Umpire Automation Hawkeye",
  description: "DIY Tournament Management. Host, play, umpire, coach, court booking — all in one platform.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "TUAH",
    statusBarStyle: "black-translucent",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
  },
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                window.addEventListener("load", function () {
                  navigator.serviceWorker.register("/sw.js").catch(function (err) {
                    console.warn("SW registration failed:", err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
