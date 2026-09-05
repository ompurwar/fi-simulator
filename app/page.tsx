import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Fi-Plan — plan your financial future like a time machine",
  description:
    "Simulate income, expenses, EMIs, SIPs, taxes and assets for decades. Fi-Plan is the independent, encrypted-first financial planning simulator built for India — salary earners, FIRE planners and NRIs alike.",
  keywords: [
    "financial planning india",
    "financial independence",
    "FIRE calculator india",
    "net worth tracker",
    "retirement planner",
    "SIP planning",
    "NRI financial planning",
  ],
};

export default function Home() {
  return <LandingPage />;
}
