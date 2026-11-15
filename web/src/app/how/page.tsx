import type { Metadata } from "next";
import Link from "next/link";
import { SealDemo } from "@/components/SealDemo";
import { SiteFooter, SiteHeader } from "@/components/Site";

export const metadata: Metadata = { title: "How it works", description: "How a Kuri round runs on chain: instalments, sealed bids with commit–reveal, settlement, dividends, and the two credit modes — with a Solidity glossary for beginners." };

const TIMELINE = [
  ["Pay", "Bidding window opens", "Every member calls pay(). Any dividend credit you earned last round is used first; the rest comes from your wallet."],
  ["Seal", "Same window", "Members who haven't won yet may call commit(hash) with a small bond. Only the hash of the bid is stored."],
  ["Reveal", "After bidding closes", "Bidders call reveal(discount, salt). The contract recomputes the hash and checks it matches. The largest discount wins; on a tie, the lower seat."],
  ["Settle", "After reveals close", "Anyone calls settle(). It collects missed instalments (escrow, then credit, then security), picks the winner, pays the prize and the commission, and credits dividends."],
];

const GLOSSARY = [
  ["Smart contract", "A program stored on the blockchain. Its code and its money are public, and nobody — including the person who deployed it — can change it afterwards."],
  ["Function", "Something the contract can do when called: pay(), commit(), reveal(), settle(), withdraw()."],
  ["msg.sender", "Who called the function. The contract trusts this completely: it's proven by the caller's signature."],
  ["mapping", "A lookup table, like members[address] → that member's record."],
  ["revert", "Undo everything and stop. If any rule fails — wrong window, not a member, bid doesn't match — the whole transaction is cancelled."],
  ["event", "A log line the contract writes, like Settled(round, winner, prize…). Websites read these to show history."],
  ["block.timestamp", "The time of the block. Kuri uses it for coarse windows (a day to bid, a day to reveal) — never for randomness."],
  ["Gas", "The fee for running code on chain. Every step costs gas, so loops and storage are kept small."],
  ["ERC-20", "The standard interface for tokens. Kuri works with any well-behaved ERC-20; the demo uses test rupees (tINR)."],
];

export default function How() {
  return (
    <>
      <SiteHeader current="/how" />
      <main id="main" className="mx-auto max-w-[1100px] px-4 py-12 sm:px-8 sm:py-16">
        <p className="label text-aurora">How it works</p>
        <h1 className="display mt-3 text-[clamp(2.6rem,6vw,4.6rem)]">One round, on chain</h1>
        <p className="mt-4 max-w-2xl text-[18px] text-ice-2">Every month of a kuri is four steps. Nobody runs them by hand: each is a function anyone can call, and the contract refuses anything out of turn.</p>

        <ol className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-4">
          {TIMELINE.map(([t, when, d], i) => (
            <li key={t} className="bg-night p-6"><span className="label text-muted">{String(i + 1).padStart(2, "0")} · {when}</span><h2 className="display mt-3 text-[1.7rem] text-aurora">{t}</h2><p className="mt-2 text-[16px] text-ice-2">{d}</p></li>
          ))}
        </ol>

        <section className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" aria-labelledby="seal-h">
          <div>
            <h2 id="seal-h" className="display text-[clamp(1.9rem,3.5vw,2.8rem)]">Why bids are sealed</h2>
            <p className="mt-3 text-[17.5px] text-ice-2">On a blockchain everything is public — including a bid the moment you send it. If bids were open, the last bidder could always outbid everyone by a hair. So bidding happens in two steps: first you publish only a <b className="text-ice">hash</b> of your bid (commit), and after bidding closes you show the bid itself (reveal).</p>
            <p className="mt-3 text-[17.5px] text-ice-2">Commit and don&apos;t reveal? You lose a small bond — 5% of an instalment — which is shared out as dividend. That makes spoiling an auction cost something.</p>
          </div>
          <SealDemo />
        </section>

        <section className="mt-16" aria-labelledby="math-h">
          <h2 id="math-h" className="display text-[clamp(1.9rem,3.5vw,2.8rem)]">The numbers, for one round</h2>
          <p className="mt-3 max-w-2xl text-[17.5px] text-ice-2">Eight members at ₹5,000. Meera wins with a 29.5% discount; the foreman&apos;s commission is 5% of the pot.</p>
          <div className="mt-6 overflow-x-auto rounded-3xl border border-line">
            <table className="w-full min-w-[520px] text-[16px]">
              <tbody>
                {[["Pot", "8 × ₹5,000", "₹40,000"], ["Discount Meera gives up", "29.5% of ₹40,000", "₹11,800"], ["Meera's prize", "₹40,000 − ₹11,800", "₹28,200"], ["Foreman's commission", "5% of ₹40,000", "₹2,000"], ["Dividend pool", "₹11,800 − ₹2,000", "₹9,800"], ["Each member's dividend", "₹9,800 ÷ 8 (Meera included)", "₹1,225 off next month"]].map(([a, b, c]) => (
                  <tr key={a} className="border-t border-line-2 first:border-t-0"><th className="px-4 py-3 text-left font-semibold">{a}</th><td className="num px-4 py-3 text-ice-2">{b}</td><td className="num px-4 py-3 text-right text-aurora">{c}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[15px] text-muted">The discount is capped at 30% and the commission at 5% in these circles — conservative choices under the Chit Funds Act, 1982 (the 2019 amendment raised the commission ceiling to 7%). Both are configurable per circle, within hard limits in the code.</p>
        </section>

        <section className="mt-16" aria-labelledby="gl-h">
          <h2 id="gl-h" className="display text-[clamp(1.9rem,3.5vw,2.8rem)]">Solidity words, in plain English</h2>
          <dl className="mt-6 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
            {GLOSSARY.map(([k, v]) => <div key={k} className="bg-night p-5"><dt className="num text-aurora">{k}</dt><dd className="mt-2 text-[15.5px] text-ice-2">{v}</dd></div>)}
          </dl>
        </section>
        <div className="mt-12 flex flex-wrap gap-3"><Link href="/play" className="btn btn-aurora">Play a circle</Link><Link href="/code" className="btn">Read the contract</Link></div>
      </main>
      <SiteFooter />
    </>
  );
}
