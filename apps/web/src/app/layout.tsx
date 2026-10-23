import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/app-provider";
import { AuthGate } from "@/components/auth-gate";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HolyWord — Read. Grow. Be Closer to God.",
    template: "%s · HolyWord",
  },
  description:
    "An offline-first Bible reader with search, highlights, notes, bookmarks and reading plans.",
  applicationName: "HolyWord",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HolyWord",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123B8F",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" data-reading-theme="light">
      <body>
        <AppProvider>
          <AuthGate>{children}</AuthGate>
        </AppProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
