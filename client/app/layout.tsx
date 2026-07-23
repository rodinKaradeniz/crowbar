import type { Metadata } from "next";
import { Libre_Caslon_Text, Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { Toaster } from "sonner";

const displayFace = Libre_Caslon_Text({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const bodyFace = Hanken_Grotesk({
  variable: "--font-body-face",
  subsets: ["latin"],
});

const dataFace = Spline_Sans_Mono({
  variable: "--font-data-face",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crowbar",
  description: "Reservation management for businesses and customers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="min-h-screen bg-background">
      <body
        className={`${displayFace.variable} ${bodyFace.variable} ${dataFace.variable} antialiased min-h-screen m-0 p-0 bg-background`}
      >
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
