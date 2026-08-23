import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter, Exo_2, Montserrat, Balsamiq_Sans } from "next/font/google";
import { NotificationList } from "@/components/ui/NotificationList";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const exo2 = Exo_2({ subsets: ["latin"], variable: "--font-exo2" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const balsamiq = Balsamiq_Sans({ weight: "700", subsets: ["latin"], variable: "--font-balsamiq" });

export const metadata: Metadata = {
  title: "Fi-Plan - a platform that helps you take charge of your financial health.",
  description: "Fi-Plan - a platform that helps you take charge of your financial health.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#f8f9fa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="fi-theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body
        className={`${inter.variable} ${exo2.variable} ${montserrat.variable} ${balsamiq.variable} font-montserrat font-medium bg-[#f8f9fa] dark:bg-slate-950 text-dark-600 dark:text-dark-400 transition-colors duration-150`}
      >
        {children}
        <NotificationList />
      </body>
    </html>
  );
}
