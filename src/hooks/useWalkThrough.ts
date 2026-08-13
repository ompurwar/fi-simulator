"use client";

import Shepherd from "shepherd.js";
import "shepherd.js/dist/css/shepherd.css";

/** Port of walk_through.composable.js + plan_page_walkthrough.steps.js (shepherd.js tour). */
export function GenerateWalkThroughStepsForPlan(plan: any) {
  return [
    {
      title: "Welcome to Fi-Plan",
      text: `Let's take a quick tour of your financial plan "${plan?.title || ""}".`,
      attachTo: { element: ".plan-header", on: "bottom" },
      buttons: [
        { text: "Next", action: () => (window as any).tour?.next() },
      ],
    },
    {
      title: "Income & Expenses",
      text: "Manage your income and expense streams here.",
      attachTo: { element: ".income-manager", on: "right" },
      buttons: [
        { text: "Back", action: () => (window as any).tour?.back() },
        { text: "Next", action: () => (window as any).tour?.next() },
      ],
    },
    {
      title: "Your Balance",
      text: "Track your emergency fund, savings and investments.",
      attachTo: { element: ".balance-card", on: "top" },
      buttons: [
        { text: "Back", action: () => (window as any).tour?.back() },
        { text: "Done", action: () => (window as any).tour?.complete() },
      ],
    },
  ];
}

export function useWalkThrough(plan: any) {
  return () => {
    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        scrollTo: { behavior: "smooth", block: "center" },
      },
    });
    (window as any).tour = tour;
    GenerateWalkThroughStepsForPlan(plan).forEach((step: any) => tour.addStep(step));
    tour.start();
  };
}
