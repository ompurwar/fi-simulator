import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Fi-Plan — Retirement & FIRE Planning Simulator for India",
  description:
    "Simulate income, expenses, EMIs, SIPs, taxes and assets for 50 years, month by month. Fi-Plan is the independent, encrypted-first retirement & FIRE planning simulator built for India — salary earners, FIRE planners and NRIs alike.",
  keywords: [
    "retirement planning india",
    "fire calculator india",
    "financial independence india",
    "financial planning app",
    "sip planning",
    "net worth tracker",
    "nri financial planning",
  ],
  openGraph: {
    title: "Fi-Plan — Plan your financial future like a time machine",
    description: "Trackers tell you what happened. Fi-Plan shows you what's possible. Simulate 50 years, month by month.",
    url: "https://fi-simulator-zeta.vercel.app",
    type: "website",
    locale: "en_IN",
    siteName: "Fi-Plan",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Fi-Plan — retirement and FIRE planning simulator for India",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fi-Plan — Plan your financial future like a time machine",
    description: "Trackers tell you what happened. Fi-Plan shows you what's possible.",
    images: ["/og-image.png"],
  },
};

export default function Home() {
  return <LandingPage />;
}
