import type { Metadata } from "next";
import { Archivo, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { Toaster } from "sonner";

// next/font self-hosts the woff2 at build time, which is how the design's
// "no third-party font CDN at request time" requirement is met without
// hand-rolled @font-face. The three variable names are stable; only the
// families changed (Libre Caslon / Hanken Grotesk / Spline Sans Mono →
// Archivo / Instrument Sans / IBM Plex Mono). All three are SIL OFL 1.1.
// latin-ext is required: the product's copy and data are German.
const displayFace = Archivo({
  variable: "--font-display-face",
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"], // D1/D2 are 800; D3/T1/T2 are 700
});

const bodyFace = Instrument_Sans({
  variable: "--font-body-face",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
});

const dataFace = IBM_Plex_Mono({
  variable: "--font-data-face",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"], // data 400; label/micro 500; badge 600
});

// The two grounds are fixed by surface, not chosen: paper for marketing, auth
// and public guest pages; ink for the staff product. Set on <html> so
// portalled dialogs, popovers and toasts inherit the tokens, and painted
// before hydration so /business never flashes paper.
//
// Must live in the root layout, not app/business/layout.tsx: a nested layout
// renders on the client during soft navigation, and React never executes
// script elements it creates in a client render. (That constraint shaped the
// retired theme boot script; the mechanism outlived the preference it served.)
const GROUND_BOOT_SCRIPT = `try{if(location.pathname.startsWith("/business"))document.documentElement.classList.add("ground-ink")}catch(e){}`;

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
    // `lang` is a neutral default here: the root layout has no tenant. Surfaces
    // that resolve one set it from the venue's configured locale via
    // <DocumentLocale /> — see components/document-locale.tsx.
    // `suppressHydrationWarning` covers exactly one thing: the boot script
    // below adds `ground-ink` to this element before React hydrates, and
    // `document-locale.tsx` rewrites `lang` from tenant config. Both are
    // deliberate pre-hydration mutations of <html>, which is what this
    // attribute is for. It does not extend to any child.
    <html
      lang="en"
      className="min-h-screen bg-background"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: GROUND_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${displayFace.variable} ${bodyFace.variable} ${dataFace.variable} antialiased min-h-screen m-0 p-0 bg-background`}
      >
        <AuthProvider>{children}</AuthProvider>
        {/* `richColors` is deliberately off: it paints its own green/red
            palette from outside the token system, and a green success toast is
            exactly the pattern the settlement rules forbid. */}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
