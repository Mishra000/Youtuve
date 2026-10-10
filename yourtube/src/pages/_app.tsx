import type { AppProps } from "next/app";
import Head from "next/head";
import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";

import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider } from "@/lib/AuthContext";
import LoginOtpModal from "@/components/LoginOtpModal";

import "@/styles/globals.css";

function ThemeSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    const handleThemeChange = (e: CustomEvent) => {
      if (e.detail && (e.detail === "light" || e.detail === "dark")) {
        setTheme(e.detail);
      }
    };

    window.addEventListener(
      "yourtube:theme-change",
      handleThemeChange as EventListener
    );
    return () => {
      window.removeEventListener(
        "yourtube:theme-change",
        handleThemeChange as EventListener
      );
    };
  }, [setTheme]);

  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <UserProvider>
        <ThemeSync />
        <Head>
          <title>YourTube - YouTube Clone</title>
          <meta name="description" content="YourTube - YouTube Clone" />
        </Head>

        <div className="min-h-screen bg-background text-foreground flex flex-col">
          <div className="sticky top-0 z-50 bg-background border-b border-border">
            <Header />
          </div>

          <Toaster />
          <LoginOtpModal />

          <div className="flex flex-1">
            <div className="hidden md:block w-64 flex-shrink-0 border-r border-border bg-background min-h-[calc(100vh-57px)]">
              <Sidebar />
            </div>

            <main className="flex-1 min-w-0 p-4">
              <Component {...pageProps} />
            </main>
          </div>
        </div>
      </UserProvider>
    </ThemeProvider>
  );
}