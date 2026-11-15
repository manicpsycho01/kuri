/** A slow curtain of northern light. Purely decorative; static when motion is reduced. */
export function Aurora({ className = "" }: { className?: string }) {
  const bands = [
    { left: "4%", w: "34%", h: "78%", d: 0, dur: 19, c: "var(--color-aurora)" },
    { left: "24%", w: "28%", h: "92%", d: -6, dur: 23, c: "var(--color-aurora-2)" },
    { left: "46%", w: "38%", h: "70%", d: -11, dur: 27, c: "var(--color-aurora)" },
    { left: "70%", w: "26%", h: "86%", d: -3, dur: 21, c: "var(--color-aurora-2)" },
  ];
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden ${className}`}>
      {bands.map((b, i) => (
        <div key={i} className="absolute top-[-10%] origin-top rounded-[50%] blur-3xl"
          style={{ left: b.left, width: b.w, height: b.h, opacity: 0.55, background: `linear-gradient(180deg, transparent 0%, ${b.c} 35%, transparent 100%)`, mixBlendMode: "screen", animation: `curtain ${b.dur}s ease-in-out ${b.d}s infinite` }} />
      ))}
      {/* fine vertical rays, like the folds of a real aurora */}
      <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 7px, rgb(233 245 247 / 0.5) 7px 8px)", maskImage: "linear-gradient(180deg, black, transparent 70%)" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-night" />
    </div>
  );
}
