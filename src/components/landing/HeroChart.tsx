"use client";

/** Demo net-worth projection with a funding-gap band — the product's core idea shown, not described. */
export default function HeroChart() {
  // cumulative ₹ (Lakh) at ~monthly intervals; dip at year ~12-14 (the gap)
  const P = "0,300 60,296 120,290 180,281 240,272 300,286 360,258 420,240 480,215 540,180 600,138 640,96";
  const area = `M0,300 L${P} L640,340 L640,380 L0,380 Z`;

  return (
    <div className="relative w-full rounded-2xl border border-dark-700 bg-dark-800 p-5 shadow-card-lg">
      <div className="flex items-center justify-between pb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-dark-300">Net worth — 50 years, month by month</span>
        <span className="rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-300">
          Simulation
        </span>
      </div>

      <svg viewBox="0 0 640 380" className="w-full" role="img" aria-label="Simulated net worth growth with an unfunded gap in year 12">
        {/* grid */}
        {[60, 120, 180, 240, 300].map((y) => (
          <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="var(--color-dark-600)" strokeOpacity="0.25" strokeWidth="1" />
        ))}
        {/* y labels */}
        <text x="6" y="308" fill="var(--color-dark-400)" fontSize="11">₹1Cr</text>
        <text x="6" y="248" fill="var(--color-dark-400)" fontSize="11">₹3Cr</text>
        <text x="6" y="188" fill="var(--color-dark-400)" fontSize="11">₹5Cr</text>
        <text x="6" y="128" fill="var(--color-dark-400)" fontSize="11">₹7Cr</text>

        {/* area + line */}
        <path d={area} fill="var(--color-primary-500)" fillOpacity="0.08" />
        <path
          d={`M${P}`}
          fill="none"
          stroke="var(--color-primary-400)"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1,
            animation: "draw-line 1.2s ease-out forwards",
          }}
        />

        {/* funding gap band */}
        <g style={{ animation: "fade-up 0.5s ease-out 1.1s both" }}>
          <rect x="330" y="180" width="38" height="150" fill="var(--color-warning-500)" fillOpacity="0.18" stroke="var(--color-warning-500)" strokeDasharray="4 4" strokeOpacity="0.7" strokeWidth="1" />
          <rect x="330" y="330" width="38" height="12" fill="var(--color-danger-500)" fillOpacity="0.35" />
        </g>

        {/* x labels */}
        <text x="8" y="368" fill="var(--color-dark-400)" fontSize="11">now</text>
        <text x="252" y="368" fill="var(--color-dark-400)" fontSize="11">15y</text>
        <text x="468" y="368" fill="var(--color-dark-400)" fontSize="11">30y</text>
        <text x="618" y="368" fill="var(--color-dark-400)" fontSize="11">50y</text>
      </svg>

      {/* annotation chip */}
      <div
        className="pointer-events-none absolute left-[53%] top-[24%] -translate-x-1/2 rounded-lg border border-warning-500/50 bg-dark-900/95 px-2.5 py-1.5 text-[11px] font-bold text-warning-300 shadow-lg"
        style={{ animation: "fade-up 0.5s ease-out 1.4s both" }}
      >
        Gap: ₹4.2L short · Mar-2038
      </div>

      {/* stat tiles */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-dark-700 pt-4 text-center">
        {[
          { label: "Net worth @ 60", value: "₹8.4Cr" },
          { label: "FI date", value: "54y 2m" },
          { label: "Runway", value: "4.6 yrs" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-dark-900/70 px-2 py-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-dark-300">{s.label}</div>
            <div className="font-mono text-sm font-extrabold tabular-nums text-primary-300">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
