import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter, Exo_2, Montserrat, Balsamiq_Sans } from "next/font/google";
import { NotificationList } from "@/components/ui/NotificationList";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const exo2 = Exo_2({ subsets: ["latin"], variable: "--font-exo2" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const balsamiq = Balsamiq_Sans({ weight: "700", subsets: ["latin"], variable: "--font-balsamiq" });

const site = {
  name: "Fi-Plan",
  url: "https://fi-simulator-zeta.vercel.app",
  description:
    "Fi-Plan helps you simulate incomes, expenses, loans, assets and retirement — your financial data is encrypted at rest (AES-256-GCM, keys in Google Cloud KMS), so only you decide who sees it.",
  ogImage: "/og-image.png",
};

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — plan your finances, keep them private`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  manifest: "/manifest.json",
  authors: [{ name: site.name }],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: site.name,
    title: `${site.name} — Financial planning, encrypted by default`,
    description: site.description,
    images: [
      {
        url: site.ogImage,
        width: 1200,
        height: 630,
        alt: "Fi-Plan — plan your finances, keep them private",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — Financial planning, encrypted by default`,
    description: site.description,
    images: [site.ogImage],
  },
};

export const viewport: Viewport = {
  themeColor: "#f8f9fa",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
