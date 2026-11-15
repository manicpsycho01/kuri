import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/Site";
import { DEPLOYMENT } from "@/content/deployment";

export const metadata: Metadata = { title: "Live", description: "Kuri's contracts on the Base Sepolia testnet, verified, with a whole circle played out on chain." };

export default function Live() {
  const d = DEPLOYMENT;
  return (
    <>
      <SiteHeader current="/live" />
      <main id="main" className="mx-auto max-w-[1100px] px-4 py-12 sm:px-8 sm:py-16">
        <p className="label text-aurora">Live on Base Sepolia</p>
        <h1 className="display mt-3 text-[clamp(2.6rem,6vw,4.6rem)]">On a public chain</h1>
        <p className="mt-4 max-w-2xl text-[18px] text-ice-2">The sandbox runs the contracts inside your browser. These are the same contracts deployed to Base Sepolia — Coinbase&apos;s public Ethereum test network — where anyone can read them and every transaction is permanent.</p>
        {!d ? (
          <div className="mt-10 rounded-3xl border border-line bg-night-2 p-6" data-testid="not-deployed">
            <h2 className="display text-[1.6rem]">Deployment on its way</h2>
            <p className="mt-2 text-ice-2">The contracts are written and tested; the testnet deployment is being prepared. Until then, <Link href="/play" className="text-aurora underline underline-offset-4">play a circle</Link> — it runs the identical bytecode.</p>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            <dl className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
              {([["Test rupee (tINR)", d.token], ["Factory", d.factory], ["Circle implementation", d.implementation]] as const).map(([k, v]) => (
                <div key={k} className="bg-night p-5"><dt className="label text-muted">{k}</dt><dd className="mt-2"><a className="hash text-aurora underline-offset-4 hover:underline" href={`${d.explorer}/address/${v}#code`}>{v}</a></dd></div>
              ))}
            </dl>
            {d.demoCircle && (
              <section aria-labelledby="demo-h">
                <h2 id="demo-h" className="display text-[clamp(1.7rem,3vw,2.4rem)]">A whole circle, played on chain</h2>
                <p className="mt-2 text-ice-2">Five test wallets ran a full kuri on Base Sepolia: <a className="hash text-aurora underline underline-offset-4" href={`${d.explorer}/address/${d.demoCircle}`}>{d.demoCircle}</a>. Every step is a public transaction:</p>
                <ol className="mt-4 space-y-1.5">
                  {d.demoTxs?.map((t) => <li key={t.hash} className="flex flex-wrap justify-between gap-x-4 border-t border-line-2 py-2 text-[15.5px]"><span>{t.label}</span><a className="hash text-ice-2 hover:text-aurora" href={`${d.explorer}/tx/${t.hash}`}>{t.hash.slice(0, 18)}…</a></li>)}
                </ol>
              </section>
            )}
            <p className="text-[15px] text-muted">Deployed {d.deployedAt}. Contracts verified on the block explorer, so the source shown there is exactly what runs.</p>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
