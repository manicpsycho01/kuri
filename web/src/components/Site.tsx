import Link from "next/link";

const NAV = [{ href: "/play", label: "Play a circle" }, { href: "/how", label: "How it works" }, { href: "/code", label: "The contract" }, { href: "/live", label: "Live" }];

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
      {Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4 - Math.PI / 2; return <circle key={i} cx={16 + 12 * Math.cos(a)} cy={16 + 12 * Math.sin(a)} r={i === 0 ? 3.4 : 2.2} fill={i === 0 ? "var(--color-aurora)" : "currentColor"} />; })}
    </svg>
  );
}

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="relative z-20 border-b border-line">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-8">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-ice hover:text-aurora" aria-label="Kuri home">
          <Logo /><span className="display text-[24px] tracking-[0.02em]">Kuri</span>
        </Link>
        <nav aria-label="Main" className="-mx-2 flex flex-wrap">
          {NAV.map((n, i) => (
            <Link key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined}
              className={`min-h-11 items-center px-2.5 text-[15px] font-medium hover:text-aurora ${i >= 2 ? "hidden sm:flex" : "flex"} ${current === n.href ? "text-aurora" : "text-ice-2"}`}>{n.label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-4 py-8 text-[15px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>Kuri is a learning project on a testnet. Test rupees only — not a registered chit fund.</p>
        <p className="flex gap-5">
          <a className="flex min-h-11 items-center hover:text-aurora" href="https://github.com/manicpsycho01/kuri">Source</a>
          <Link className="flex min-h-11 items-center hover:text-aurora" href="/code">The contract</Link>
          <Link className="flex min-h-11 items-center hover:text-aurora" href="/live">Live</Link>
        </p>
      </div>
    </footer>
  );
}

export const inr = (wei: bigint | number, opts: { sign?: boolean } = {}) => {
  const n = typeof wei === "bigint" ? Number(wei / 10n ** 16n) / 100 : wei;
  const s = Math.abs(Math.round(n)).toLocaleString("en-IN");
  return `${opts.sign ? (n > 0 ? "+" : n < 0 ? "−" : "") : n < 0 ? "−" : ""}₹${s}`;
};
