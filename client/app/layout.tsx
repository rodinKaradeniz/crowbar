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

// Paints a stored dark preference before hydration so the dashboard doesn't
// flash light. Mirrors the storage key in components/staff-theme.tsx.
// Must live in the root layout, not app/business/layout.tsx: a nested layout
// renders on the client during soft navigation, and React never executes
// script elements it creates in a client render.
const THEME_BOOT_SCRIPT = `try{if(location.pathname.startsWith("/business")&&localStorage.getItem("crowbar-staff-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${displayFace.variable} ${bodyFace.variable} ${dataFace.variable} antialiased min-h-screen m-0 p-0 bg-background`}
      >
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
