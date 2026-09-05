import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Fi-Plan stores, encrypts and protects your financial data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-dark-50 px-6 py-16 text-dark-600 dark:bg-slate-950 dark:text-dark-400">
      <article className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-exo2 text-3xl font-bold text-dark-800 dark:text-white">Privacy Policy</h1>
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <p>
            Fi-Plan is built so that your financial data belongs to you. This page explains, in plain
            language, what we store and how it is protected.
          </p>
          <h2 className="text-lg font-bold text-dark-800 dark:text-white">What we store</h2>
          <p>
            Your profile (email, name) and the plans you create: incomes, expenses, cashflow changes,
            loans, fund distribution strategies, accounts, assets and tax settings. Net-worth sync
            tokens are stored encrypted and kept read-only.
          </p>
          <h2 id="security" className="text-lg font-bold text-dark-800 dark:text-white">
            Security & encryption
          </h2>
          <p>
            Financial documents are encrypted at rest with AES-256-GCM. The per-document data keys are
            wrapped by Google Cloud KMS and are never stored in plaintext. Email-based lookups use
            HMAC tokenization so contact details are not searchable in plaintext. Passwords are
            salted + hashed (HMAC-SHA256); access is via short-lived signed JWTs.
          </p>
          <h2 className="text-lg font-bold text-dark-800 dark:text-white">Integrations</h2>
          <p>
            Net-worth and market integrations are read-only. Fi-Plan never asks for broker passwords.
          </p>
          <h2 className="text-lg font-bold text-dark-800 dark:text-white">Deletion</h2>
          <p>
            You can request full deletion of your account and all associated data at any time via
            support@fi-plan.com — we remove the data within 30 days.
          </p>
          <h2 className="text-lg font-bold text-dark-800 dark:text-white">Analytics</h2>
          <p>
            We collect anonymized product events (page visits, plan actions) to improve the product.
            These do not include the contents of your financial plan.
          </p>
          <p className="text-xs text-dark-300">
            Draft of 2026-09-05. Questions: support@fi-plan.com
          </p>
        </div>
      </article>
    </div>
  );
}
