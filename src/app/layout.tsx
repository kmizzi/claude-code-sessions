import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AiChat } from "@/components/ai-chat";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Claude Code Sessions",
  description: "Browse, search, and manage your Claude Code conversation history.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-background font-sans antialiased scrollbar-thin`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <AiChat />
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "bg-card border-border text-foreground",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
