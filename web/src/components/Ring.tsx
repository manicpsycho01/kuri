"use client";
import { useEffect, useRef, useState } from "react";

export type RingSeat = { seat: number; name: string; you?: boolean; prized?: boolean; paid?: boolean; sealed?: boolean; inDefault?: boolean; wonRound?: number | null };

/**
 * The circle itself: members around a table, the pot in the middle. When a round settles, a line of light
 * runs from the pot to the winner.
 */
export function Ring({ seats, round, total, pot, winner, caption, size = 520 }: { seats: RingSeat[]; round: number; total: number; pot: string; winner?: number | null; caption?: string; size?: number }) {
  const n = seats.length, cx = 260, cy = 260, R = 190;
  // Text is sized in screen pixels, not chart units, so names stay readable when the ring is small.
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(700);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width || 700));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = Math.max(0.3, Math.min(width, size) / 700);
  // On narrow screens names move out of the drawing into a list below, so both stay readable.
  const compact = width < 460;
  const px = (screen: number, natural: number) => Math.max(natural, screen / k);
  // Leave room for the longest name on either side, and for a label above the top seat.
  const longest = Math.max(...seats.map((x) => x.name.length));
  const padX = compact ? 30 : Math.max(90, px(15, 15) * 0.6 * longest + px(15, 15) + 10);
  const padY = compact ? 30 : Math.max(10, px(15, 15) * 2.2 - 20);
  const pos = (i: number) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + R * Math.cos(a), cy + R * Math.sin(a), a] as const; };
  const w = seats.findIndex((s) => s.seat === winner);
  const status = (s: RingSeat) => (s.inDefault ? "in default" : s.prized ? `won round ${(s.wonRound ?? 0) + 1}` : s.sealed ? "bid sealed" : s.paid ? "paid" : "waiting");
  return (
    <div>
    <svg ref={ref} viewBox={`${-padX} ${-padY} ${520 + 2 * padX} ${540 + 2 * padY}`} className="h-auto w-full" style={{ maxWidth: size }} role="img" aria-label={`The circle: ${n} members, round ${Math.min(round + 1, total)} of ${total}, pot ${pot}`}>
      <defs>
        <radialGradient id="pot-glow"><stop offset="0" stopColor="var(--color-aurora)" stopOpacity=".28" /><stop offset="1" stopColor="var(--color-aurora)" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--color-line)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={R - 34} fill="none" stroke="var(--color-line-2)" strokeWidth="1" strokeDasharray="2 6" />
      {/* round progress around the table */}
      <circle cx={cx} cy={cy} r={R + 22} fill="none" stroke="var(--color-aurora)" strokeOpacity=".75" strokeWidth="2"
        strokeDasharray={`${(2 * Math.PI * (R + 22) * Math.min(round, total)) / total} 9999`} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={110} fill="url(#pot-glow)" />
      {w >= 0 && (() => {
        const [x, y] = pos(w);
        // userSpaceOnUse: a gradient on a perfectly vertical line would otherwise have zero width and vanish.
        return (
          <g data-beam>
            <defs><linearGradient id={`beam-${w}`} gradientUnits="userSpaceOnUse" x1={cx} y1={cy} x2={x} y2={y}><stop offset="0" stopColor="var(--color-aurora)" stopOpacity=".05" /><stop offset="1" stopColor="var(--color-aurora)" /></linearGradient></defs>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={`url(#beam-${w})`} strokeWidth="3" strokeLinecap="round" />
          </g>
        );
      })()}
      <text x={cx} y={cy - 26} textAnchor="middle" fill="var(--color-muted)" fontSize={px(13.5, 13)} fontFamily="var(--font-mono)" letterSpacing=".1em">{round >= total ? "CIRCLE COMPLETE" : `ROUND ${round + 1} OF ${total}`}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--color-ice)" fontSize="38" fontWeight="700" fontFamily="var(--font-display)" style={{ fontVariationSettings: '"wdth" 125' }}>{pot}</text>
      <text x={cx} y={cy + 26 + px(13, 13)} textAnchor="middle" fill="var(--color-ice-2)" fontSize={px(13.5, 13)} fontFamily="var(--font-mono)">{caption ?? "in the pot"}</text>
      {seats.map((s, i) => {
        const [x, y, a] = pos(i);
        const out = Math.cos(a) >= -0.01 ? 1 : -1;
        const gap = 30 + px(14, 14);
        const lx = cx + (R + gap) * Math.cos(a), ly = cy + (R + gap) * Math.sin(a) - (Math.sin(a) < -0.5 ? px(10, 6) : 0);
        const anchor = Math.abs(Math.cos(a)) < 0.25 ? "middle" : out > 0 ? "start" : "end";
        const fill = s.inDefault ? "var(--color-ember)" : s.prized ? "var(--color-aurora)" : "var(--color-night)";
        return (
          <g key={s.seat} data-seat={s.seat}>
            {s.seat === winner && <circle cx={x} cy={y} r="20" fill="none" stroke="var(--color-aurora)" style={{ animation: "pulse-ring 1.6s var(--ease-out-expo) infinite" }} />}
            <circle cx={x} cy={y} r={(s.you ? 17 : 14) * (compact ? 1.45 : 1)} fill={fill} stroke={s.you ? "var(--color-ice)" : s.prized ? "var(--color-aurora)" : "var(--color-ice-2)"} strokeWidth={s.you ? 2.5 : 1.4} />
            <text x={x} y={y + (compact ? 6 : 4.5)} textAnchor="middle" fontSize={compact ? 17 : Math.min(px(11, 12), 15)} fontFamily="var(--font-mono)" fill={s.prized || s.inDefault ? "var(--color-night)" : "var(--color-ice)"}>{s.seat}</text>
            {!compact && <text x={lx} y={ly + 2} textAnchor={anchor} fill={s.you ? "var(--color-ice)" : "var(--color-ice-2)"} fontSize={px(15, 15)} fontWeight={s.you ? 700 : 500} fontFamily="var(--font-display)">{s.name}</text>}
            {!compact && <text x={lx} y={ly + 2 + px(14, 17)} textAnchor={anchor} fill={s.inDefault ? "var(--color-ember)" : s.prized ? "var(--color-aurora)" : "var(--color-muted)"} fontSize={px(13.5, 11.5)} fontFamily="var(--font-mono)">
              {status(s)}
            </text>}
          </g>
        );
      })}
    </svg>
    {compact && (
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[15px]" aria-label="Members">
        {seats.map((s) => (
          <li key={s.seat} className="flex items-baseline gap-2">
            <span className={`num inline-grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[12px] ${s.inDefault ? "border-ember bg-ember text-night" : s.prized ? "border-aurora bg-aurora text-night" : "border-ice-2"}`}>{s.seat}</span>
            <span className="min-w-0"><span className={s.you ? "font-bold" : ""}>{s.name}</span> <span className={`text-[13px] ${s.inDefault ? "text-ember" : s.prized ? "text-aurora" : "text-muted"}`}>{status(s)}</span></span>
          </li>
        ))}
      </ul>
    )}
    </div>
  );
}
