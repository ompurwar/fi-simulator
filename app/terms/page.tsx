import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Fi-Plan terms of use — a simulator, not an investment advisor.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-dark-50 px-6 py-16 text-dark-600 dark:bg-slate-950 dark:text-dark-400">
      <article className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-exo2 text-3xl font-bold text-dark-800 dark:text-white">Terms of Use</h1>
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <p>By using Fi-Plan you agree to these terms.</p>
          <h2 className="text-lg font-bold text-dark-800 dark:text-white">A simulator, not advice</h2>
          <p>
            Fi-Plan is a financial simulation tool. Nothing in the product constitutes financial,
            investment, tax or legal advice. Outcomes are projections based on your inputs and our
            algorithm; they are not guarantees and do not reflect market reality.
          </p>
          <h2 className="text-lg font-bold text-dark-800 dark:text-white">Your responsibility</h2>
          <p>
            You are responsible for the accuracy of the data you enter and for any decisions you take
            based on it. Consult a SEBI-registered advisor for investment decisions.
          </p>
          <h2 className="text-lg font-bold text-dark-800 dark:text-white">Accounts</h2>
          <p>
            You may create one account per person. You are responsible for keeping your credentials
            secure. We may suspend accounts that abuse the service.
          </p>
          <h2 className="text-lg font-bold text-dark-800 dark:text-white">Service</h2>
          <p>
            The service is provided "as is" without warranties. We aim for high availability during
            the beta phase but do not guarantee uptime.
          </p>
        </div>
      </article>
    </div>
  );
}
