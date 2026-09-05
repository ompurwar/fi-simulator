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
};

export default function Home() {
  return <LandingPage />;
}
