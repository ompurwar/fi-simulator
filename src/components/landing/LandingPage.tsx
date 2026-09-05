"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import HeroChart from "@/components/landing/HeroChart";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightToBracket,
  faChartLine,
  faLock,
  faScaleBalanced,
  faClockRotateLeft,
  faWandMagicSparkles,
  faCircleCheck,
  faCirclePlus,
  faChevronDown,
  faCopy,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";

// Near-black label for filled emerald CTAs — a fixed value (the dark-* tokens invert in dark mode,
// so a token here would flip to white and fail contrast on the green fill).
const CTA_LABEL = "#0f172a";

const TEMPLATES = [
  { icon: faClockRotateLeft, title: "Retire at 45", stat: "₹18L income · 55% savings rate", fi: "FI at 44y 7m" },
  { icon: faArrowRightToBracket, title: "NRI return to India", stat: "401(k) → LLP · tax bridge", fi: "Zero taxable on exit" },
  { icon: faChartLine, title: "₹12L first plan", stat: "The starter blueprint", fi: "Runway in 3 clicks" },
  { icon: faScaleBalanced, title: "Prepay vs invest", stat: "EMI @ 8.6% vs index SIP", fi: "₹4.9L better invested" },
];

const FEATURES = [
  {
    icon: faClockRotateLeft,
    tint: "bg-primary-500/15 text-primary-300",
    title: "Simulate decades, not months",
    desc: "Declare income, expenses, EMIs, SIPs and assets once — the engine models 50 years, month by month.",
  },
  {
    icon: faLock,
    tint: "bg-success-500/15 text-success-300",
    title: "Private by design",
    desc: "Manual entry or read-only sync — never your broker password. Encrypted at rest, readable only by you.",
  },
  {
    icon: faScaleBalanced,
    tint: "bg-accent-500/15 text-accent-300",
    title: "Compare & what-if",
    desc: "SIP +10%? Prepay the loan? Compare two plans on one timeline, then pick the better one.",
  },
];

const STEPS = [
  { title: "Set your numbers", desc: "Income, expenses, EMIs, SIPs, assets — minutes, not spreadsheets." },
  { title: "Watch 50 years simulate", desc: "Net worth, runway, gaps — every single month, scrubbable like a timeline." },
  { title: "What-if & compare", desc: "Test the raise, the loan prepay, the sabbatical — then pick the better plan." },
];

const INDIA_LINES = [
  "Indian units from the start — ₹ Lakh / Crore, EMI/SIP language, old vs new tax regime",
  "FIRE-ready vocabulary: runway coverage, FI freedom, savings rate",
  "NRI-friendly: 401(k) vs India scenarios, return-and-retire plans",
];

const CALCULATORS = [
  { title: "FIRE number", desc: "How much is enough?" },
  { title: "Savings rate", desc: "Am I saving 30%?" },
  { title: "Prepay vs invest", desc: "Which is better?" },
  { title: "SIP goal", desc: "Monthly amount to reach it" },
];

function Section({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`py-16 md:py-24 ${className}`}>
      {children}
    </section>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const MCP_CONFIG = `{ "mcpServers": { "fi-plan": { "url": "https://fi-simulator-zeta.vercel.app/api/mcp" } } }`;

  function CopyConfig() {
    navigator.clipboard?.writeText(MCP_CONFIG).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="min-h-screen bg-dark-50 dark:bg-slate-950 text-dark-600 dark:text-dark-400">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-transparent bg-dark-50/80 px-6 py-3 backdrop-blur-md transition-colors dark:bg-slate-950/80">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="hidden text-sm font-bold text-dark-500 hover:text-dark-800 md:inline">
            Sign in
          </Link>
          <Link href="/login?mode=signup">
            <Button sub_variant="solid" className="rounded-lg px-4 py-2 text-sm font-bold focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-50 dark:focus-visible:ring-offset-slate-950" style={{ color: CTA_LABEL }}>
              Start planning free
            </Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6">
        {/* 1 · HERO — left copy, right product visual */}
        <div className="relative grid min-h-[86vh] items-center gap-12 py-12 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-6 text-center lg:text-left">
            <p className="mx-auto text-sm font-semibold tracking-wide text-dark-400 lg:mx-0">
              Trackers tell you what happened.{" "}
              <span className="text-primary-400">Fi-Plan shows you what's possible.</span>
            </p>
            <h1 className="font-exo2 text-balance text-[clamp(2.25rem,7vw,5.5rem)] font-bold leading-[1.05] tracking-tight text-dark-800 dark:text-white">
              Plan your financial future
              <br className="hidden lg:block" />{" "}
              <span className="text-primary-500 dark:text-primary-400"> like a time machine</span>
            </h1>
            <p className="mx-auto max-w-[42ch] text-balance font-inter text-[clamp(1rem,2vw,1.25rem)] leading-relaxed text-dark-500 lg:mx-0">
              Simulate your entire financial life, decades ahead — and spot the gaps before they happen.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link href="/login?mode=signup">
                <Button variant="primary" sub_variant="solid" className="rounded-lg px-6 py-3 text-base font-bold shadow-glow focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-50 dark:focus-visible:ring-offset-slate-950" style={{ color: CTA_LABEL }}>
                  <FontAwesomeIcon icon={faCirclePlus} className="mr-2" />
                  Create your free plan
                </Button>
              </Link>
              <a href="/login">
                <Button variant="neutral" className="rounded-lg px-6 py-3 text-base" style={{ color: "var(--color-dark-500)" }}>
                  <FontAwesomeIcon icon={faArrowRightToBracket} className="mr-2" />
                  I already have an account
                </Button>
              </a>
            </div>
            {/* trust — engine first, three only */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-dark-500 lg:justify-start">
              <span className="rounded-full border border-dark-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                50 years, month by month
              </span>
              <span className="rounded-full border border-dark-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                Read-only — no broker passwords
              </span>
              <span className="rounded-full border border-dark-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                Encrypted at rest (AES-256 + KMS)
              </span>
            </div>
          </div>

          <HeroChart />

          <button
            type="button"
            aria-label="Scroll down"
            onClick={() => document.getElementById("templates")?.scrollIntoView({ behavior: "smooth" })}
            className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-dark-400 hover:text-primary-400 lg:block transition-colors"
            style={{ animation: "bob 2s ease-in-out infinite" }}
          >
            <style>{`@media (prefers-reduced-motion: reduce) { [style*='animation: bob'] { animation: none !important; } }`}</style>
            <FontAwesomeIcon icon={faChevronDown} />
          </button>
        </div>

        {/* 2 · TEMPLATES — persona entry points */}
        <Section id="templates" className="border-t border-dark-100 dark:border-slate-800">
          <div className="flex flex-col gap-2 text-center lg:text-left">
            <h2 className="font-exo2 text-3xl font-bold tracking-tight text-dark-800 dark:text-white">
              Start from someone else's plan
            </h2>
            <p className="text-balance text-dark-500">
              Fork a template, swap in your numbers, see your 50 years in about four minutes.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((t) => (
              <Link
                key={t.title}
                href="/shared_templates"
                className="group flex flex-col gap-3 rounded-xl border border-dark-200 bg-white p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary-400/50 hover:shadow-card-lg dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="grid h-10 w-10 place-content-center rounded-lg bg-primary-500/15 text-lg text-primary-300 transition-transform duration-200 group-hover:scale-110">
                  <FontAwesomeIcon icon={t.icon} />
                </div>
                <span className="text-base font-bold text-dark-800 dark:text-white">{t.title}</span>
                <span className="text-xs leading-relaxed text-dark-400">{t.stat}</span>
                <span className="mt-auto pt-1 font-mono text-[11px] font-extrabold tabular-nums text-primary-400">
                  {t.fi}
                </span>
                <span className="text-xs font-bold text-primary-500 after:content-['‣'] after:pl-0.5 after:transition-all group-hover:after:pl-2">
                  Fork this plan
                </span>
              </Link>
            ))}
          </div>
        </Section>

        {/* 3 · FEATURES */}
        <Section className="text-center">
          <h2 className="font-exo2 text-3xl font-bold tracking-tight text-dark-800 dark:text-white">
            Retirement & FIRE planning, built for Indian salaries
          </h2>
          <div className="mt-10 grid gap-6 text-left md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex flex-col gap-3 rounded-xl border border-dark-200 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-primary-400/40 hover:shadow-card-lg dark:border-slate-800 dark:bg-slate-900"
              >
                <div className={`grid h-11 w-11 place-content-center rounded-lg text-xl ${f.tint}`}>
                  <FontAwesomeIcon icon={f.icon} />
                </div>
                <h3 className="text-lg font-bold text-dark-800 dark:text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-dark-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 4 · HOW IT WORKS */}
        <Section id="how-it-works">
          <h2 className="font-exo2 text-3xl font-bold tracking-tight text-dark-800 dark:text-white">
            How the financial simulator works
          </h2>
          <div className="relative mt-12 flex flex-col gap-10 md:flex-row md:gap-8">
            <div className="absolute left-4 top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-primary-500/50 to-transparent md:hidden" />
            <div className="absolute left-0 right-0 top-4 hidden h-px bg-gradient-to-r from-primary-500/50 via-primary-500/30 to-transparent md:block" />
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative flex flex-1 flex-col gap-2 pl-12 md:pl-0 md:pt-14">
                <span className="absolute left-0 top-0 z-10 grid h-8 w-8 place-content-center rounded-full bg-primary-600 text-sm font-extrabold text-white shadow-glow md:left-4">
                  {i + 1}
                </span>
                <h3 className="text-base font-bold text-dark-800 dark:text-white">{s.title}</h3>
                <p className="text-sm leading-relaxed text-dark-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 5 · AGENTS / MCP */}
        <Section id="agents">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h2 className="font-exo2 text-3xl font-bold tracking-tight text-dark-800 dark:text-white">
                Plan from your terminal, or your chat window
              </h2>
              <p className="text-dark-500">
                Ask Claude, ChatGPT or Cursor to explore your plan — "what if I take a sabbatical?",
                "modelled my NRI return" — and open the result in Fi-Plan with one link.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Claude", "ChatGPT", "Cursor"].map((c) => (
                  <span key={c} className="rounded-full border border-dark-200 bg-white px-3 py-1 text-xs font-bold text-dark-500 dark:border-slate-800 dark:bg-slate-900">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative rounded-xl border border-dark-700 bg-slate-950 p-4 shadow-card-lg">
              <button
                type="button"
                onClick={CopyConfig}
                className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-dark-700 px-2 py-1 text-[10px] font-bold text-dark-300 transition-colors hover:border-primary-500/50 hover:text-white"
              >
                <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="text-[9px]" />
                {copied ? "Copied" : "Copy"}
              </button>
              <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-primary-200">
                {MCP_CONFIG}
              </pre>
            </div>
          </div>
        </Section>

        {/* 6 · BUILT FOR INDIA — a deliberate dark island in both themes */}
        <Section>
          <div className="grid gap-10 rounded-2xl border border-dark-700 bg-dark-800 p-8 shadow-card-lg dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2 md:p-12">
            <div className="flex flex-col gap-4">
              <h2 className="font-exo2 text-2xl font-extrabold tracking-tight text-white">
                Built for India, built for real life
              </h2>
              <ul className="flex flex-col gap-3">
                {INDIA_LINES.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-slate-300">
                    <FontAwesomeIcon icon={faCircleCheck} className="mt-0.5 text-primary-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col items-center justify-center gap-5 rounded-xl bg-slate-900/50 p-8 text-center ring-1 ring-white/5">
              <div className="h-px w-12 bg-slate-600" aria-hidden />
              <FontAwesomeIcon icon={faChartLine} className="text-3xl text-primary-400" />
              <p className="text-sm font-semibold leading-relaxed text-slate-200">
                The dashboard answers the questions you actually have: <br />
                "Am I on track? What's my runway? When does the money get tight?"
              </p>
              <Link href="/login?mode=signup">
                <Button variant="primary" sub_variant="solid" className="rounded-lg px-5 py-2 text-sm font-bold focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800 dark:focus-visible:ring-offset-slate-800" style={{ color: CTA_LABEL }}>
                  See it with your own numbers
                </Button>
              </Link>
            </div>
          </div>
        </Section>

        {/* 7 · CALCULATORS — SEO surface */}
        <Section>
          <h2 className="font-exo2 text-3xl font-bold tracking-tight text-dark-800 dark:text-white">
            Free calculators
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {CALCULATORS.map((c) => (
              <Link
                key={c.title}
                href="/login?mode=signup"
                className="group flex flex-col gap-1.5 rounded-xl border border-dark-200 bg-white p-5 transition-all hover:-translate-y-1 hover:border-primary-400/40 hover:shadow-card-lg dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="text-sm font-bold text-dark-800 dark:text-white">{c.title}</span>
                <span className="text-xs text-dark-400">{c.desc}</span>
                <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-primary-500">
                  Soon
                </span>
              </Link>
            ))}
          </div>
        </Section>

        {/* 8 · FINAL CTA — the one centred block */}
        <Section className="text-center">
          <h2 className="font-exo2 text-balance text-3xl font-bold tracking-tight text-dark-800 dark:text-white md:text-4xl">
            Your future self will thank you.
          </h2>
          <p className="mx-auto mt-3 max-w-[42ch] text-balance text-dark-500">
            Four minutes of numbers today, a decade of clear decisions tomorrow.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/login?mode=signup">
              <Button variant="primary" sub_variant="solid" className="rounded-lg px-8 py-3 text-base font-bold shadow-glow focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-50 dark:focus-visible:ring-offset-slate-950" style={{ color: CTA_LABEL }}>
                <FontAwesomeIcon icon={faWandMagicSparkles} className="mr-2" />
                Start planning free
              </Button>
            </Link>
          </div>
        </Section>
      </main>

      {/* 9 · FOOTER */}
      <footer className="border-t border-dark-100 bg-white px-6 py-12 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto grid max-w-7xl gap-10 text-sm md:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Logo badge={false} className="text-2xl" />
            <p className="max-w-[24ch] text-xs text-dark-400">
              Personal financial simulation, encrypted by default.
            </p>
          </div>
          {[
            {
              col: "Product",
              links: [
                ["How it works", "#how-it-works"],
                ["Templates", "/shared_templates"],
                ["Compare", "/plans/compare"],
              ],
            },
            {
              col: "For developers",
              links: [
                ["Use with an AI assistant", "#agents"],
              ],
            },
            {
              col: "Trust",
              links: [
                ["Privacy Policy", "/privacy"],
                ["Terms", "/terms"],
                ["Security & encryption", "/privacy#security"],
              ],
            },
            {
              col: "Company",
              links: [
                ["Contact", "mailto:support@fi-plan.com"],
                ["Sign in", "/login"],
                ["Create an account", "/login?mode=signup"],
              ],
            },
          ].map((g) => (
            <div key={g.col} className="flex flex-col gap-3">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-dark-400">{g.col}</span>
              {g.links.map(([label, href]) => (
                <Link key={label} href={href} className="text-xs font-semibold text-dark-400 transition-colors hover:text-primary-500">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col items-center justify-between gap-2 border-t border-dark-100 pt-6 text-[11px] text-dark-400 md:flex-row dark:border-slate-800">
          <span>© 2026 Fi-Plan</span>
          <span>Not investment advice — a simulator, not an advisor.</span>
          <span>Made in India 🇮🇳</span>
        </div>
      </footer>
    </div>
  );
}
