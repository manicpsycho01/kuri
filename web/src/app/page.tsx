import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import { DemoRing } from "@/components/DemoRing";
import { SiteFooter, SiteHeader } from "@/components/Site";

const STEPS = [
  ["Everyone chips in", "Eight friends each put ₹5,000 into the pot every month. That's ₹40,000 a month, for eight months."],
  ["Someone takes the pot", "Each month, whoever needs money most bids for the pot. The bid is a discount: “I'll take ₹31,000 instead of ₹40,000, now.”"],
  ["Everyone else gets a share", "The ₹9,000 given up pays the organiser's small commission, and the rest comes back to everyone as a dividend off next month's payment."],
  ["Until everyone has won once", "Each person wins exactly once. The last one waits longest — and pays least, because they collected every month's dividend."],
];

export default function Home() {
  return (
    <>
      <SiteHeader current="/" />
      <main id="main">
        <section className="relative overflow-hidden" aria-labelledby="hero-h">
          <Aurora className="h-[640px]" />
          <div className="relative mx-auto grid max-w-[1320px] items-center gap-8 px-4 pt-10 pb-14 sm:px-8 lg:min-h-[calc(100svh-70px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pt-4">
            <div className="flex min-w-0 flex-col">
              <p data-rise className="label text-aurora">A chit fund, rebuilt as smart contracts</p>
              <h1 id="hero-h" data-rise style={{ "--d": 1 } as React.CSSProperties} className="display mt-4 text-[clamp(4.2rem,12vw,10rem)]">Kuri</h1>
              <p data-rise style={{ "--d": 2 } as React.CSSProperties} className="display mt-5 max-w-[22ch] text-[clamp(1.5rem,2.6vw,2.3rem)] leading-[1.05]">The chit fund nobody can run away with.</p>
              <p data-rise style={{ "--d": 3 } as React.CSSProperties} className="order-last mt-6 max-w-[38rem] text-[clamp(1.05rem,1.3vw,1.2rem)] leading-relaxed text-ice-2 sm:order-none sm:mt-5">
                Kerala calls it a <i>kuri</i>; elsewhere it&apos;s a chitty, a bhishi or a committee. Friends pool money every month and take turns taking the pot. Kuri keeps the money in Solidity contracts instead of with an organiser — sealed bids, automatic dividends, and nobody who can disappear with the pot.
              </p>
              <div data-rise style={{ "--d": 4 } as React.CSSProperties} className="mt-7 flex flex-wrap gap-3">
                <Link href="/play" className="btn btn-aurora">Play a circle</Link>
                <Link href="/how" className="btn">How it works</Link>
              </div>
            </div>
            <div data-rise style={{ "--d": 2 } as React.CSSProperties} className="mx-auto w-full max-w-[540px] min-w-0"><DemoRing /></div>
          </div>
        </section>

        <section className="border-t border-line" aria-labelledby="what-h">
          <div className="mx-auto max-w-[1320px] px-4 py-16 sm:px-8 sm:py-24">
            <h2 id="what-h" className="display text-[clamp(2.2rem,4.5vw,3.6rem)]">What&apos;s a kuri?</h2>
            <p className="mt-3 max-w-2xl text-[18px] text-ice-2">Families across India use them to save, borrow and buy — gold, a bike, a wedding, a shop&apos;s stock — without a bank.</p>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-4">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="bg-night p-6">
                  <span className="display text-[2.6rem] text-aurora">{i + 1}</span>
                  <h3 className="display mt-3 text-[1.35rem] leading-tight">{t}</h3>
                  <p className="mt-2 text-[16px] text-ice-2">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-line bg-night-2" aria-labelledby="problem-h">
          <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-2">
            <div>
              <h2 id="problem-h" className="display text-[clamp(2.2rem,4.5vw,3.6rem)]">The weak point is the person holding the money</h2>
            </div>
            <div className="space-y-4 text-[18px] leading-relaxed text-ice-2">
              <p>In a traditional chit, an organiser — the <i>foreman</i> — collects everyone&apos;s instalments, runs the auction and pays out. The scheme only works as long as that person stays honest and solvent. When an organiser vanishes, the pot vanishes with them.</p>
              <p className="text-ice">In Kuri, the money sits in a contract whose rules anyone can read. The foreman takes a fixed commission and has <b>no other powers</b>: no withdrawals, no changing the rules, no seeing anyone&apos;s bid.</p>
            </div>
          </div>
        </section>

        <section className="border-t border-line" aria-labelledby="trust-h">
          <div className="mx-auto max-w-[1320px] px-4 py-16 sm:px-8 sm:py-24">
            <p className="label text-aurora">The honest part</p>
            <h2 id="trust-h" className="display mt-3 max-w-[20ch] text-[clamp(2.2rem,4.5vw,3.6rem)]">Code can hold the money. It can&apos;t make people pay.</h2>
            <p className="mt-4 max-w-3xl text-[18px] text-ice-2">A kuri is credit: the early winner gets money they haven&apos;t paid in yet. If they stop paying, no smart contract can force them. So every circle chooses its trade-off up front:</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-line p-6">
                <h3 className="display text-[1.6rem]">Trust mode</h3>
                <p className="mt-2 text-ice-2">Winners get the whole pot, like a real kuri. Every member posts one instalment as security, which covers one missed payment. Miss again and you&apos;re in default: no more bids, no more dividends — and the rest of the circle absorbs a smaller pot.</p>
              </div>
              <div className="rounded-3xl border border-aurora/40 bg-aurora-soft p-6">
                <h3 className="display text-[1.6rem]">Escrow mode</h3>
                <p className="mt-2 text-ice-2">Nobody can default: a winner&apos;s own future instalments are held back from their prize and paid automatically. The catch — early winners get much less cash up front. Without trust, credit shrinks.</p>
              </div>
            </div>
            <Link href="/play" className="btn btn-aurora mt-8">Try both — invite Joseph</Link>
          </div>
        </section>

        <section className="border-t border-line bg-night-2" aria-labelledby="why-h">
          <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div>
              <p className="label text-aurora">Why this exists</p>
              <h2 id="why-h" className="display mt-3 text-[clamp(2rem,4vw,3.2rem)]">Learning to build on a blockchain</h2>
            </div>
            <div className="max-w-2xl space-y-4 text-[18px] leading-relaxed text-ice-2">
              <p>My first project, <a className="text-aurora underline underline-offset-4" href="https://kaudi-eta.vercel.app">Kaudi</a>, was a blockchain built from scratch to understand how chains work. Kuri is the next step: learning to build <i>on</i> one, in Solidity — the language most smart contracts are written in.</p>
              <p>I wanted a problem from home, not another token. The chit fund is Indian, it&apos;s about money people actually depend on, and it&apos;s hard to get right on chain: sealed bids, defaults, rounding, and an organiser who must not be able to cheat.</p>
              <p className="text-ice">— Aravind</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
