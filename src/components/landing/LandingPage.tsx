"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { EncryptionPill } from "@/components/security/EncryptionShield";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightToBracket,
  faChartLine,
  faLock,
  faScaleBalanced,
  faClockRotateLeft,
  faWandMagicSparkles,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";

const FEATURES = [
  {
    icon: faClockRotateLeft,
    title: "Simulate decades, not months",
    desc: "Declare income, expenses, EMIs, SIPs and assets once — Fi-Plan's engine models the next 50 years month by month: net worth, runway, funding gaps.",
  },
  {
    icon: faLock,
    title: "Private by design",
    desc: "Encrypted at rest (AES-256-GCM, keys wrapped in Google Cloud KMS), tokenized email lookups, read-only market integrations. Your plan is yours alone.",
  },
  {
    icon: faScaleBalanced,
    title: "Compare & what-if",
    desc: "Ask the engine instead of guessing: what if I raise my SIP by 10%? Should I prepay the loan or invest? Compare plans side by side on the same timeline.",
  },
];

const INDIA_LINES = [
  "Indian units from the start — ₹ Lakh / Crore, EMI/SIP language, old vs new tax regime",
  "FIRE-ready vocabulary: runway coverage, FI freedom, savings rate",
  "NRI-friendly: 401(k) vs India scenarios, return-and-retire plans",
  "Works with your AI assistant too — ask Claude, Copilot or ChatGPT to explore your plan",
];

export default function LandingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .IsLoggedIn()
      .then(() => {
        if (!cancelled) router.replace("/plan");
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-dark-50 dark:bg-slate-950 text-dark-600 dark:text-dark-400">
      <header className="flex items-center justify-between px-6 py-4 pb-2">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="hidden text-sm font-bold text-dark-500 hover:text-dark-800 md:inline">
            Sign in
          </Link>
          <Link href="/login?mode=signup">
            <Button className="rounded-lg px-4 py-2 text-sm">Start planning free</Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-24 pt-8">
        <section className="flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
            <EncryptionPill />
            <span>Encrypted at rest · read-only integrations</span>
          </div>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight text-dark-800 md:text-6xl">
            Plan your financial future like a <span className="text-primary-600">time machine</span>
          </h1>
          <p className="max-w-2xl text-base text-dark-400 md:text-lg">
            Trackers tell you what happened. Fi-Plan shows you what is possible — income, expenses,
            EMIs, SIPs, taxes and assets simulated for decades, with honest gaps surfaced early.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/login?mode=signup">
              <Button variant="primary" className="rounded-xl px-6 py-3 text-base">
                <FontAwesomeIcon icon={faWandMagicSparkles} className="mr-2" />
                Create your free plan
              </Button>
            </Link>
            <a href="/login">
              <Button variant="outline" className="rounded-xl px-6 py-3 text-base">
                <FontAwesomeIcon icon={faArrowRightToBracket} className="mr-2" />
                I already have an account
              </Button>
            </a>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-3 rounded-2xl border border-dark-200 bg-white p-6 shadow-xs"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-xl text-primary-600">
                <FontAwesomeIcon icon={f.icon} />
              </div>
              <h3 className="text-lg font-bold text-dark-800">{f.title}</h3>
              <p className="text-sm leading-relaxed text-dark-400">{f.desc}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-10 rounded-3xl border border-dark-200 bg-white p-8 shadow-xs md:grid-cols-2 md:p-12">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-extrabold text-dark-800">Built for India, built for real life</h2>
            <ul className="flex flex-col gap-3">
              {INDIA_LINES.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-dark-500">
                  <FontAwesomeIcon icon={faCircleCheck} className="mt-0.5 text-primary-600" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-dark-900 p-8 text-center">
            <FontAwesomeIcon icon={faChartLine} className="text-3xl text-primary-400" />
            <p className="text-sm font-semibold leading-relaxed text-dark-100">
              The dashboard answers the questions you actually have — <br />
              "Am I on track? What's my runway? When does the money get tight?"
            </p>
            <Link href="/login?mode=signup">
              <Button className="rounded-lg px-5 py-2 text-sm">See it with your own numbers</Button>
            </Link>
          </div>
        </section>

        <footer className="flex flex-col items-center gap-2 text-center text-xs text-dark-400">
          <Logo badge={false} className="justify-center text-2xl" />
          <p>Fi-Plan — personal financial simulation, encrypted by default.</p>
        </footer>
      </main>
    </div>
  );
}
