import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Codexa — Understand any codebase. Instantly.",
  description: "Chat with your codebase, explore its architecture, and build a living understanding of how your software works.",
  openGraph: {
    title: "Codexa — Understand any codebase. Instantly.",
    description: "Chat with your codebase, explore its architecture, and build a living understanding of how your software works.",
    type: "website",
  },
};

// Applies the saved theme before first paint so there's no dark→light
// flash on load. Kept tiny and inline — this is the one script that must
// run before React hydrates.
const themeInitScript = `(function(){try{var t=localStorage.getItem('codexa-theme');if(t==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-text antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
