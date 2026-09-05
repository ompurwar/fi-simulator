"use client";

/** Demo net-worth projection with a funding-gap band — the product's core idea shown, not described. */

// cumulative ₹ (Lakh) at ~monthly intervals; a stall/dip around the gap, then recovery + compounding.
const PTS: [number, number][] = [
  [0, 300], [58, 296], [116, 289], [174, 280], [232, 271],
  [300, 286], [360, 258], [420, 238], [480, 212], [540, 176], [590, 134], [632, 94],
];

/** Catmull-Rom → cubic bézier, so the line reads as a smooth projection rather than a jagged polyline. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  const d = [`M ${pts[0][0]},${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`);
  }
  return d.join(" ");
}

export default function HeroChart() {
  const line = smoothPath(PTS);
  const area = `${line} L${PTS[PTS.length - 1][0]},345 L0,345 Z`;
  const [ex, ey] = PTS[PTS.length - 1];

  return (
    <div className="relative w-full rounded-2xl border border-dark-700 bg-dark-800 p-5 shadow-card-lg">
      <div className="flex items-center justify-between pb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-dark-300">Net worth — 50 years, month by month</span>
        <span className="rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-300">
          Simulation
        </span>
      </div>

      <svg viewBox="0 0 640 380" className="w-full" role="img" aria-label="Simulated net worth growth with an unfunded funding gap in the mid-term">
        <defs>
          <linearGradient id="hc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity="0" />
          </linearGradient>
          <filter id="hc-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* grid */}
        {[60, 120, 180, 240, 300].map((y) => (
          <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="var(--color-dark-600)" strokeOpacity="0.22" strokeWidth="1" />
        ))}
        {/* y labels */}
        <text x="6" y="308" fill="var(--color-dark-400)" fontSize="11">₹1Cr</text>
        <text x="6" y="248" fill="var(--color-dark-400)" fontSize="11">₹3Cr</text>
        <text x="6" y="188" fill="var(--color-dark-400)" fontSize="11">₹5Cr</text>
        <text x="6" y="128" fill="var(--color-dark-400)" fontSize="11">₹7Cr</text>

        {/* funding-gap band (behind the line) */}
        <g style={{ animation: "fade-up 0.5s ease-out 1.1s both" }}>
          <rect x="286" y="52" width="62" height="293" fill="var(--color-warning-500)" fillOpacity="0.13" />
          <line x1="317" y1="52" x2="317" y2="345" stroke="var(--color-warning-500)" strokeDasharray="4 5" strokeOpacity="0.5" strokeWidth="1" />
        </g>

        {/* area + line */}
        <path d={area} fill="url(#hc-area)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-primary-400)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1,
            animation: "draw-line 1.3s ease-out forwards",
          }}
        />

        {/* gap trough marker — the tightest month */}
        <g style={{ animation: "fade-up 0.5s ease-out 1.35s both" }}>
          <circle cx="300" cy="286" r="6" fill="none" stroke="var(--color-danger-500)" strokeOpacity="0.4" strokeWidth="1.5" />
          <circle cx="300" cy="286" r="3.5" fill="var(--color-danger-500)" />
        </g>

        {/* endpoint marker — where the plan lands */}
        <g style={{ animation: "fade-up 0.5s ease-out 1.25s both" }}>
          <circle cx={ex} cy={ey} r="5" fill="var(--color-primary-400)" filter="url(#hc-glow)" />
          <circle cx={ex} cy={ey} r="2" fill="#fff" />
        </g>

        {/* x labels */}
        <text x="8" y="368" fill="var(--color-dark-400)" fontSize="11">now</text>
        <text x="250" y="368" fill="var(--color-dark-400)" fontSize="11">15y</text>
        <text x="462" y="368" fill="var(--color-dark-400)" fontSize="11">30y</text>
        <text x="600" y="368" fill="var(--color-dark-400)" fontSize="11">50y</text>
      </svg>

      {/* annotation chip */}
      <div
        className="pointer-events-none absolute left-[48%] top-[25%] -translate-x-1/2 rounded-lg border border-warning-500/50 bg-dark-900/95 px-2.5 py-1.5 text-[11px] font-bold text-warning-300 shadow-lg"
        style={{ animation: "fade-up 0.5s ease-out 1.5s both" }}
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
