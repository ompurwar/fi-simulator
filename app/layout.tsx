import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter, Exo_2, Montserrat, Balsamiq_Sans } from "next/font/google";

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
    <html lang="en">
      <body
        className={`${inter.variable} ${exo2.variable} ${montserrat.variable} ${balsamiq.variable} bg-dark-50 text-dark-800 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
