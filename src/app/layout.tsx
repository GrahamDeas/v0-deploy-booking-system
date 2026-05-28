import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fife College Recording Studio Booking System",
  description: "Fife College sound production room and equipment booking system",
  icons: {
    icon: "/branding/fife-college-logo.svg",
    shortcut: "/branding/fife-college-logo.svg",
    apple: "/branding/fife-college-logo.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
