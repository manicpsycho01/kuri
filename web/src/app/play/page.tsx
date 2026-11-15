import type { Metadata } from "next";
import { Play } from "@/components/Play";
import { SiteFooter, SiteHeader } from "@/components/Site";

export const metadata: Metadata = { title: "Play a circle", description: "Join a kuri with simulated neighbours and the real Solidity contracts running in your browser: pay, seal a bid, reveal, settle — then see who borrowed and who saved." };

export default function PlayPage() {
  return (
    <>
      <SiteHeader current="/play" />
      <main id="main" className="mx-auto max-w-[1320px] px-4 pt-8 pb-16 sm:px-8">
        <h1 className="display text-[clamp(2.4rem,5vw,4rem)]">Play a circle</h1>
        <p className="mt-2 max-w-2xl text-[17.5px] text-ice-2">The real contracts, running on a private chain inside this page. Each round: pay, decide whether to bid, then close the round.</p>
        <div className="mt-8"><Play /></div>
      </main>
      <SiteFooter />
    </>
  );
}
