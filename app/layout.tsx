import type { Metadata, Viewport } from "next";
import "./globals.css";

import { AuthProvider } from "@/lib/auth";
import { WeekProvider } from "@/lib/weekContext";
import { ToastProvider } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "RPA Regulatory System",
  description:
    "Radiation Protection Authority of Zambia — Nuclear & Radiation Safety regulatory information system.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#00A050",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <WeekProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </WeekProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
