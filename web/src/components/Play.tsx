"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import type { MemberState, Mode, RoundResult, Sandbox } from "@/sandbox/engine";
import { Ring } from "./Ring";
import { inr } from "./Site";

type Snap = { round: number; finished: boolean; members: MemberState[]; due: bigint; wallet: bigint; rounds: RoundResult[]; calls: Sandbox["calls"]; solvent: boolean };

export function Play() {
  const [opts, setOpts] = useState({ size: 8, mode: "trust" as Mode, contribution: 5000, unreliable: false });
  const box = useRef<Sandbox | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bps, setBps] = useState(1500);
  const [sealed, setSealed] = useState<Hex | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** After each step the button pressed disappears; send focus to the next step's heading instead of losing it. */
  const focusNext = () => requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }));

  const refresh = useCallback(async () => {
    const s = box.current;
    if (!s) return;
    const [round, finished, members, due, wallet, solvent] = await Promise.all([s.round(), s.finished(), s.members(), s.dueNow(), s.yourWallet(), s.solvent()]);
    setSnap({ round: finished ? s.opts.size : round, finished, members, due, wallet, rounds: [...s.rounds], calls: [...s.calls], solvent });
  }, []);

  const start = async () => {
    setBusy("Deploying the contracts to your in-browser chain…");
    setError(null);
    const { Sandbox } = await import("@/sandbox/engine");
    box.current = await Sandbox.start({ ...opts, seed: String(Date.now()) });
    setLastResult(null); setSealed(null); setSkipped(false);
    await refresh();
    setBusy(null);
  };
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError(null);
    try { await fn(); } catch (e) { setError(String(e)); }
    await refresh();
    setBusy(null);
    focusNext();
  };

  const s = box.current;
  if (!s || !snap) return <Setup opts={opts} setOpts={setOpts} start={start} busy={busy} />;

  const you = snap.members[s.you.seat - 1]!;
  const last = snap.round === s.opts.size - 1;
  const C = s.C, size = s.opts.size;
  const potNow = C * BigInt(size);
  const discount = (potNow * BigInt(bps)) / 10_000n;
  const commission = (potNow * 500n) / 10_000n;
  const prize = potNow - discount;
  const escrowHeld = s.opts.mode === "escrow" ? (prize < BigInt(size - 1 - snap.round) * C ? prize : BigInt(size - 1 - snap.round) * C) : 0n;
  const step = snap.finished ? "done" : !you.paid ? "pay" : !you.prized && !last && !sealed && !skipped ? "bid" : "close";
  const winnerSeat = lastResult?.winner ? s.seats.find((x) => x.address.toLowerCase() === lastResult.winner!.toLowerCase())?.seat ?? null : null;
  const wonRound = (addr: string) => snap.rounds.find((r) => r.winner?.toLowerCase() === addr.toLowerCase())?.round ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
      <section aria-label="The circle" className="min-w-0">
        <div className="mx-auto max-w-[540px]">
          <Ring
            seats={s.seats.map((x, i) => ({ seat: x.seat, name: x.name, you: x.you, prized: snap.members[i]!.prized, paid: snap.members[i]!.paid, sealed: snap.members[i]!.committed, inDefault: snap.members[i]!.inDefault, wonRound: wonRound(x.address) }))}
            round={snap.round} total={size} pot={inr(potNow)} winner={winnerSeat}
            caption={s.opts.mode === "escrow" ? "pot · escrow mode" : "pot · trust mode"}
          />
        </div>
        <p className="label mt-2 text-center text-muted" data-testid="solvency">
          {snap.solvent ? "✓ contract holds exactly what it owes" : "✗ books don't balance"} · {snap.calls.length} transactions on your in-browser chain
        </p>
        {snap.rounds.length > 0 && <Ledger rounds={snap.rounds} seats={s.seats} />}
      </section>

      <section aria-label="Your turn" className="min-w-0">
        {step !== "done" ? (
          <div ref={panel} className="rounded-3xl border border-line bg-night-2 p-5 sm:p-7">
            <p className="label text-aurora">Round {snap.round + 1} of {size} · your seat: {s.you.seat}</p>
            <p className="mt-1 text-ice-2">In your wallet: <span className="num text-ice">{inr(snap.wallet)}</span>{you.dividendCredit > 0n && <> · dividend credit <span className="num text-aurora">{inr(you.dividendCredit)}</span></>}</p>

            {lastResult && <RoundCard r={lastResult} seats={s.seats} youAddr={s.you.address} mode={s.opts.mode} />}

            {step === "pay" && (
              <div className="mt-6">
                <h2 tabIndex={-1} className="display text-[1.9rem] outline-none">Pay your instalment</h2>
                <p className="mt-2 text-ice-2">Everyone puts in {inr(C)} this round.{you.dividendCredit > 0n ? ` Your dividend credit covers ${inr(C - snap.due)} of it.` : ""}</p>
                <button type="button" className="btn btn-aurora mt-5" disabled={!!busy} onClick={() => act("Paying…", () => s.payYou())}>Pay {inr(snap.due)}</button>
              </div>
            )}

            {step === "bid" && (
              <div className="mt-6">
                <h2 tabIndex={-1} className="display text-[1.9rem] outline-none">Bid for the pot?</h2>
                <p className="mt-2 text-ice-2">You bid a <b className="text-ice">discount</b> — the share of the pot you&apos;re willing to give up to take it now. The biggest discount wins. Your bid is <b className="text-ice">sealed</b>: only its hash goes on chain until everyone reveals.</p>
                <label className="mt-5 block">
                  <span className="flex items-baseline justify-between"><span className="label text-muted">Discount you&apos;ll give up</span><span className="num text-[1.4rem] text-ice">{(bps / 100).toFixed(1)}%</span></span>
                  <input type="range" min={500} max={3000} step={50} value={bps} onChange={(e) => setBps(+e.target.value)} aria-label="Discount in percent of the pot" />
                </label>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-[15px]">
                  <div className="rounded-2xl border border-line p-3"><dt className="text-muted">If you win, you get</dt><dd className="num mt-1 text-[1.3rem] text-aurora">{inr(prize - escrowHeld)}</dd>{escrowHeld > 0n && <dd className="text-[13.5px] text-muted">+{inr(escrowHeld)} held to pay your own future instalments</dd>}</div>
                  <div className="rounded-2xl border border-line p-3"><dt className="text-muted">Everyone else gets back</dt><dd className="num mt-1 text-[1.3rem]">{inr((discount - commission) / BigInt(size))}</dd><dd className="text-[13.5px] text-muted">each, as dividend, after the 5% commission</dd></div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" className="btn btn-aurora" disabled={!!busy} onClick={() => act("Sealing your bid…", async () => setSealed(await s.bidYou(bps)))}>Seal my bid</button>
                  <button type="button" className="btn" disabled={!!busy} onClick={() => { setSkipped(true); focusNext(); }}>Don&apos;t bid this round</button>
                </div>
              </div>
            )}

            {step === "close" && (
              <div className="mt-6">
                <h2 tabIndex={-1} className="display text-[1.9rem] outline-none">{last ? "The last pot" : "Close the round"}</h2>
                {sealed && <p className="mt-2 text-ice-2">Your bid is sealed as <span className="hash text-ice">{sealed.slice(0, 18)}…</span> Nobody — not even the foreman — can see it until you reveal.</p>}
                {you.prized && !last && <p className="mt-2 text-ice-2">You&apos;ve already won a pot, so you keep paying but can&apos;t bid again.</p>}
                {last && <p className="mt-2 text-ice-2">No auction: the one member who hasn&apos;t won takes the pot, less the commission.</p>}
                {!sealed && !you.prized && !last && <p className="mt-2 text-ice-2">You&apos;re sitting this one out.</p>}
                <p className="mt-2 text-ice-2">Closing runs the rest of the round on chain: your neighbours pay and seal their bids, everyone reveals, and anyone can call <code className="hash text-ice">settle()</code>.</p>
                <button type="button" className="btn btn-aurora mt-5" disabled={!!busy} onClick={() => act("Neighbours are bidding…", async () => { setLastResult(await s.closeRound()); setSealed(null); setSkipped(false); })}>
                  {last ? "Settle the last round" : "Reveal bids and settle"}
                </button>
              </div>
            )}
            <p role="status" aria-live="polite" className="mt-4 min-h-6 text-[15px] text-muted">{busy ?? ""}</p>
            {error && <p role="alert" className="mt-2 text-ember">{error}</p>}
          </div>
        ) : (
          <Results s={s} snap={snap} onAgain={(mode) => { setOpts((o) => ({ ...o, mode })); box.current = null; setSnap(null); }} />
        )}
        <Neighbours s={s} snap={snap} />
        <UnderTheHood calls={snap.calls} />
      </section>
    </div>
  );
}

function Setup({ opts, setOpts, start, busy }: { opts: { size: number; mode: Mode; contribution: number; unreliable: boolean }; setOpts: (f: (o: typeof opts) => typeof opts) => void; start: () => void; busy: string | null }) {
  return (
    <div className="mx-auto max-w-[760px] rounded-3xl border border-line bg-night-2 p-5 sm:p-8">
      <h2 className="display text-[2rem]">Start a circle</h2>
      <p className="mt-2 text-ice-2">You and your neighbours, each paying a monthly instalment. The contracts are the real ones — compiled Solidity, running in an Ethereum virtual machine inside this page. No wallet, no sign-up, no real money.</p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <label className="block"><span className="flex justify-between"><span className="label text-muted">Members (and months)</span><span className="num">{opts.size}</span></span>
          <input type="range" min={4} max={10} value={opts.size} onChange={(e) => setOpts((o) => ({ ...o, size: +e.target.value }))} /></label>
        <label className="block"><span className="label text-muted">Monthly instalment</span>
          <select className="field mt-1" value={opts.contribution} onChange={(e) => setOpts((o) => ({ ...o, contribution: +e.target.value }))}>
            {[1000, 5000, 10000].map((v) => <option key={v} value={v}>{inr(v)}</option>)}
          </select></label>
      </div>
      <fieldset className="mt-6">
        <legend className="label text-muted">If someone wins early and stops paying…</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {([["trust", "Trust mode", "Like a real kuri: winners get the whole pot now. Each member's one-instalment security covers one miss; after that the circle absorbs the loss."], ["escrow", "Escrow mode", "Nobody can default: a winner's own future instalments are held back from their prize. Safer — but early winners get less cash."]] as const).map(([v, t, d]) => (
            <label key={v} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${opts.mode === v ? "border-aurora bg-aurora-soft" : "border-line"}`}>
              <input type="radio" name="mode" className="mt-1.5 h-5 w-5 accent-[var(--color-aurora)]" checked={opts.mode === v} onChange={() => setOpts((o) => ({ ...o, mode: v }))} />
              <span><span className="block font-semibold">{t}</span><span className="mt-1 block text-[15px] text-ice-2">{d}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" className="h-5 w-5 accent-[var(--color-aurora)]" checked={opts.unreliable} onChange={(e) => setOpts((o) => ({ ...o, unreliable: e.target.checked }))} />
        <span>Invite Joseph — persuasive, short of money, and likely to stop paying once he wins</span>
      </label>
      <button type="button" className="btn btn-aurora mt-6" disabled={!!busy} onClick={start}>{busy ?? "Start the circle"}</button>
    </div>
  );
}

function RoundCard({ r, seats, youAddr, mode }: { r: RoundResult; seats: Sandbox["seats"]; youAddr: string; mode: Mode }) {
  const w = r.winner ? seats.find((x) => x.address.toLowerCase() === r.winner!.toLowerCase()) : null;
  const youWon = r.winner?.toLowerCase() === youAddr.toLowerCase();
  return (
    <div className={`mt-5 rounded-2xl border p-4 ${youWon ? "border-aurora bg-aurora-soft" : "border-line"}`} data-testid="round-result">
      <p className="label text-muted">Round {r.round + 1} result</p>
      <p className="mt-1 text-[17px]">
        {w ? <><b>{youWon ? "You" : w.name}</b> {youWon ? "won" : "won"} the pot with a {(r.discountBps / 100).toFixed(1)}% discount{r.bids.length ? "" : " — nobody bid, so it went to the lowest seat at the minimum"}.</> : "Nobody eligible was left to win; the pot went back as dividends."}
      </p>
      <p className="mt-1 text-[15px] text-ice-2">
        Prize {inr(r.prize)}{r.escrowed > 0n && mode === "escrow" ? ` (${inr(r.escrowed)} held in escrow)` : ""} · commission {inr(r.commission)} · everyone who paid gets {inr(r.dividendEach)} off next month.
      </p>
      {r.bids.length > 0 && <p className="label mt-2 text-muted">Revealed bids: {r.bids.map((b) => `${seats[b.seat - 1]!.name} ${(b.bps / 100).toFixed(1)}%`).join(" · ")}</p>}
    </div>
  );
}

function Ledger({ rounds, seats }: { rounds: RoundResult[]; seats: Sandbox["seats"] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-[15px]">
        <caption className="sr-only">Every round so far</caption>
        <thead><tr className="label text-left text-muted"><th className="px-3 py-2 font-normal">Round</th><th className="px-3 py-2 font-normal">Winner</th><th className="px-3 py-2 text-right font-normal">Discount</th><th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Prize</th><th className="px-3 py-2 text-right font-normal">Dividend</th></tr></thead>
        <tbody>
          {rounds.map((r) => (
            <tr key={r.round} className="border-t border-line-2">
              <td className="num px-3 py-2">{r.round + 1}</td>
              <td className="px-3 py-2">{r.winner ? seats.find((x) => x.address.toLowerCase() === r.winner!.toLowerCase())?.name : "—"}</td>
              <td className="num px-3 py-2 text-right">{(r.discountBps / 100).toFixed(1)}%</td>
              <td className="num hidden px-3 py-2 text-right sm:table-cell">{inr(r.prize)}</td>
              <td className="num px-3 py-2 text-right text-aurora">{inr(r.dividendEach)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Results({ s, snap, onAgain }: { s: Sandbox; snap: Snap; onAgain: (m: Mode) => void }) {
  const rows = s.seats.map((x) => {
    const flows = s.cashflows(x.seat);
    const net = flows.reduce((a, b) => a + b, 0n);
    const won = snap.rounds.find((r) => r.winner?.toLowerCase() === x.address.toLowerCase());
    return { x, net, won, m: snap.members[x.seat - 1]! };
  });
  return (
    <div className="rounded-3xl border border-aurora/40 bg-night-2 p-5 sm:p-7" data-testid="results">
      <p className="label text-aurora">Circle complete</p>
      <h2 className="display mt-2 text-[2rem]">Who borrowed, who saved</h2>
      <p className="mt-2 text-ice-2">A kuri is really two things at once. Whoever wins early gets a lump sum before they&apos;ve paid it in — a loan, and the discount is the interest. Whoever waits is lending to them, and the dividends are their return.</p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[460px] text-[15px]">
          <thead><tr className="label text-left text-muted"><th className="py-2 font-normal">Member</th><th className="py-2 font-normal">Got the pot</th><th className="py-2 text-right font-normal">Net</th><th className="py-2 pl-4 text-left font-normal">What that means</th></tr></thead>
          <tbody>
            {rows.map(({ x, net, won, m }) => (
              <tr key={x.seat} className={`border-t border-line-2 ${x.you ? "text-ice" : "text-ice-2"}`}>
                <td className="py-2 font-semibold">{x.name}{m.inDefault ? <span className="ml-2 text-ember">defaulted</span> : null}</td>
                <td className="num py-2">{won ? `month ${won.round + 1}` : "—"}</td>
                <td className={`num py-2 text-right ${net >= 0n ? "text-aurora" : "text-ice-2"}`}>{inr(net, { sign: true })}</td>
                <td className="py-2 pl-4 text-[14.5px]" data-testid="meaning">
                  {!won ? "never received the pot" : net < 0n
                    ? `paid ${inr(-net)} to get ${inr(won.prize - won.escrowed)} in month ${won.round + 1}`
                    : `earned ${inr(net)} by waiting until month ${won.round + 1}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[15px] text-muted">Net is everything received minus everything paid in, including security returned at the end. One round = one month. Commission paid to the foreman: {inr(snap.rounds.reduce((a, r) => a + r.commission, 0n))}.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn btn-aurora" onClick={() => onAgain(s.opts.mode === "trust" ? "escrow" : "trust")}>Play again in {s.opts.mode === "trust" ? "escrow" : "trust"} mode</button>
        <Link href="/how" className="btn">How the contract works</Link>
      </div>
    </div>
  );
}

function Neighbours({ s, snap }: { s: Sandbox; snap: Snap }) {
  return (
    <details className="group mt-6 rounded-2xl border border-line">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 font-semibold">Your neighbours <span className="label text-muted group-open:hidden">show</span><span className="label hidden text-muted group-open:inline">hide</span></summary>
      <ul className="divide-y divide-line-2 px-4 pb-2">
        {s.seats.filter((x) => !x.you).map((x) => (
          <li key={x.seat} className="py-3"><p className="flex items-baseline justify-between gap-3"><span className="font-semibold">{x.seat} · {x.name}</span><span className="label text-muted">{snap.members[x.seat - 1]!.prized ? "won" : "waiting"}</span></p><p className="text-[15px] text-ice-2">{x.persona!.story}</p></li>
        ))}
      </ul>
    </details>
  );
}

function UnderTheHood({ calls }: { calls: Sandbox["calls"] }) {
  return (
    <details className="group mt-3 rounded-2xl border border-line">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 font-semibold">Under the hood: every transaction <span className="label text-muted">{calls.length}</span></summary>
      <ol className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-contain px-4 pb-4" data-lenis-prevent>
        {[...calls].reverse().slice(0, 80).map((c, i) => (
          <li key={i} className="text-[14px]">
            <span className="text-ice">{c.who}</span> → <code className="hash text-aurora">{c.fn}()</code> <span className="text-ice-2">{c.detail}</span>
            <span className="label block text-muted">{c.error ? `reverted: ${c.error}` : `${c.gas.toLocaleString("en-US")} gas${c.events.length ? " · emits " + c.events.join(", ") : ""}`}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
