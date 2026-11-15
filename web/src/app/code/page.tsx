import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/Site";

export const metadata: Metadata = { title: "The contract", description: "Kuri's Solidity, annotated: the round's state machine, sealed bids, settlement maths, security choices, the test suite, design decisions and the threat model." };

const SNIPPETS: { title: string; why: string; code: string }[] = [
  {
    title: "Sealed bids: commit a hash",
    why: "Only a hash goes on chain. It binds the chain, this circle, the round and the bidder, so nobody can copy someone else's sealed bid and reveal it as their own. A bond (5% of an instalment) makes committing-and-vanishing cost something.",
    code: `function commitmentFor(address bidder, uint8 r, uint16 discountBps, bytes32 salt)
    public view returns (bytes32)
{
    return keccak256(abi.encode(block.chainid, address(this), r, bidder, discountBps, salt));
}

function commit(bytes32 hash) external nonReentrant {
    if (block.timestamp >= commitEnd()) revert WindowClosed();
    if (m.prized) revert NotEligible("already won");
    if (!paid[round][msg.sender]) revert NotEligible("pay this round first");
    commitment[round][msg.sender] = hash;
    bondsHeld += bond();
    _pull(bond());
}`,
  },
  {
    title: "Reveal: the hash must match",
    why: "The contract recomputes the hash from what you reveal. Change your bid after seeing others' and it won't match. Out-of-range bids get their bond back but don't count. Ties go to the lower seat — deterministic, so transaction ordering can't decide an auction.",
    code: `if (commitmentFor(msg.sender, round, discountBps, salt) != h)
    revert BadReveal("does not match commitment");
revealed[round][msg.sender] = true;
members[msg.sender].claimable += bond();          // bond back either way
if (discountBps < config.commissionBps || discountBps > config.maxDiscountBps) return;
if (bestSeat == 0 || discountBps > bestDiscountBps
    || (discountBps == bestDiscountBps && seat < bestSeat)) {
    bestDiscountBps = discountBps;
    bestSeat = seat;
}`,
  },
  {
    title: "Settle: split the pot exactly",
    why: "Anyone can call settle() once reveals close — there's no keeper and no admin. The pot splits into prize, commission and dividend pool with nothing created or lost; indivisible remainders (dust) carry forward and go to the foreman at the end, so the contract finishes empty.",
    code: `o.commission = (o.pot * config.commissionBps) / 10_000;
uint256 discount = (o.pot * o.discountBps) / 10_000;
o.prize = o.pot - discount;
pool += discount - o.commission;                   // discount ≥ commission, always
if (config.escrowPrize) {                          // escrow mode: hold back own future dues
    uint256 owedLater = uint256(config.size - 1 - r) * config.contribution;
    o.escrowed = o.prize < owedLater ? o.prize : owedLater;
    w.escrow += o.escrowed;
}
w.claimable += o.prize - o.escrowed;
o.dividendEach = pool / o.payers;
dust = pool - o.dividendEach * o.payers;`,
  },
  {
    title: "Missed payments",
    why: "If someone hasn't paid when the round settles, the contract takes the instalment from their escrow, then their dividend credit, then — once — their security. If none of that covers it, they're marked in default: no more bids, no more dividends. The circle never pays out money it doesn't hold.",
    code: `uint256 fromEscrow = m.escrow >= need ? need : m.escrow;            need -= fromEscrow;
uint256 fromCredit = m.dividendCredit >= need ? need : m.dividendCredit; need -= fromCredit;
if (need > 0 && m.security >= need) fromSecurity = need;
if (fromEscrow + fromCredit + fromSecurity < c) {
    m.inDefault = true;                            // take nothing; flag the member
    emit Defaulted(r, who);
    return;
}`,
  },
];

const SECURITY = [
  ["No admin powers", "After the circle starts, the foreman can't withdraw, pause, change fees or edit members. There is no owner and no upgrade path."],
  ["Pull payments", "Money owed is credited to claimable and withdrawn by its owner. The contract never pushes tokens to a list of people in a loop."],
  ["Reentrancy guard", "Every state-changing function is nonReentrant, and a test uses a hostile token that calls back mid-transfer."],
  ["Fee-on-transfer tokens rejected", "Every deposit checks the balance actually rose by the amount, so a token that skims fees can't break the books."],
  ["Clones initialised once", "Each circle is an EIP-1167 clone; the implementation disables its own initialiser, and each clone can be initialised exactly once."],
  ["Solvency, checked", "liabilities() adds up everything owed to everyone; tests assert it always equals the token balance."],
];

const TESTS = [
  ["34", "contract tests in Solidity", "Unit tests for every rule and revert, a fuzz test over random sizes and bids (512 runs), and invariant tests."],
  ["6", "invariants × 512 random runs", "Thousands of random calls in random orders — pay, bid, reveal, wait, settle, withdraw, members going broke. After every call: books balance, no money from nowhere, one prize per round."],
  ["9", "browser-side tests", "The same compiled bytecode in the page's EVM: whole circles in both modes, Joseph defaulting, sealed bids, the interest-rate maths."],
];

const DECISIONS = [
  ["Commission from the pot, not the discount", "That's how the Chit Funds Act frames it. It also means the minimum bid equals the commission, so the foreman's fee is always covered."],
  ["Two credit modes instead of one", "A deposit of a few instalments can't cover a winner who walks away; full collateral kills early credit. Rather than hide the trade-off, each circle chooses it."],
  ["Ties to the lower seat, not the earliest commit", "Earliest-commit would let transaction ordering decide auctions. Seat order is fixed and public."],
  ["No randomness", "With no bids, the lowest eligible seat takes the pot. Fair on-chain randomness needs an oracle; v1 doesn't pretend."],
  ["One contract per circle", "Clones keep each circle's money separate, and its history is just that contract's events."],
];

const NOT_SOLVED = [
  "Someone joining several seats under different addresses (Sybil seats).",
  "Members colluding to keep the discount high or low.",
  "Base's sequencer can nudge timestamps slightly or delay transactions; the windows are a day long for that reason.",
  "Legal registration: a real chit fund must be registered under the Chit Funds Act, 1982. Kuri is a testnet learning project.",
  "The contracts are tested, not professionally audited.",
];

export default function Code() {
  return (
    <>
      <SiteHeader current="/code" />
      <main id="main" className="mx-auto max-w-[1100px] px-4 py-12 sm:px-8 sm:py-16">
        <p className="label text-aurora">The contract</p>
        <h1 className="display mt-3 text-[clamp(2.6rem,6vw,4.6rem)]">Read the rules that hold the money</h1>
        <p className="mt-4 max-w-2xl text-[18px] text-ice-2">Three contracts: <code className="num text-ice">KuriCircle</code> (one chit fund), <code className="num text-ice">KuriFactory</code> (starts new ones) and <code className="num text-ice">MockRupee</code> (test rupees with a faucet). Here are the parts that matter, trimmed for reading — the full source is <a className="text-aurora underline underline-offset-4" href="https://github.com/manicpsycho01/kuri">on GitHub</a>.</p>

        <div className="mt-12 space-y-12">
          {SNIPPETS.map((s) => (
            <section key={s.title} className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-label={s.title}>
              <div><h2 className="display text-[1.7rem] leading-tight">{s.title}</h2><p className="mt-3 text-[16.5px] text-ice-2">{s.why}</p></div>
              <pre className="overflow-x-auto rounded-3xl border border-line bg-night-2 p-5 text-[13.5px] leading-relaxed text-ice-2" tabIndex={0}><code className="font-mono">{s.code}</code></pre>
            </section>
          ))}
        </div>

        <section className="mt-16" aria-labelledby="sec-h">
          <h2 id="sec-h" className="display text-[clamp(1.9rem,3.5vw,2.8rem)]">Security choices</h2>
          <dl className="mt-6 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map(([k, v]) => <div key={k} className="bg-night p-5"><dt className="font-semibold text-aurora">{k}</dt><dd className="mt-2 text-[15.5px] text-ice-2">{v}</dd></div>)}
          </dl>
        </section>

        <section className="mt-16" aria-labelledby="tests-h">
          <h2 id="tests-h" className="display text-[clamp(1.9rem,3.5vw,2.8rem)]">How it&apos;s tested</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {TESTS.map(([n, t, d]) => <div key={t} className="rounded-3xl border border-line p-6"><p className="display text-[3rem] text-aurora">{n}</p><p className="font-semibold">{t}</p><p className="mt-2 text-[15.5px] text-ice-2">{d}</p></div>)}
          </div>
        </section>

        <section className="mt-16 grid gap-10 lg:grid-cols-2" aria-label="Decisions and limits">
          <div>
            <h2 className="display text-[clamp(1.7rem,3vw,2.4rem)]">Decisions, and what was rejected</h2>
            <dl className="mt-5 space-y-4">{DECISIONS.map(([k, v]) => <div key={k} className="border-t border-line pt-3"><dt className="font-semibold">{k}</dt><dd className="mt-1 text-[15.5px] text-ice-2">{v}</dd></div>)}</dl>
          </div>
          <div>
            <h2 className="display text-[clamp(1.7rem,3vw,2.4rem)]">What it doesn&apos;t solve</h2>
            <ul className="mt-5 space-y-3">{NOT_SOLVED.map((x) => <li key={x} className="border-t border-line pt-3 text-[15.5px] text-ice-2">{x}</li>)}</ul>
          </div>
        </section>
        <div className="mt-12 flex flex-wrap gap-3"><Link href="/play" className="btn btn-aurora">Play a circle</Link><Link href="/live" className="btn">See it live</Link></div>
      </main>
      <SiteFooter />
    </>
  );
}
