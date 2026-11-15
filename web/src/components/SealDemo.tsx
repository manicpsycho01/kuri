"use client";
import { useMemo, useState } from "react";
import { encodeAbiParameters, keccak256, toHex } from "viem";

/** The same hash the contract checks: keccak256(abi.encode(chainId, circle, round, bidder, discountBps, salt)). */
export function SealDemo() {
  const [bps, setBps] = useState(1800);
  const [salt, setSalt] = useState("my secret words");
  const hash = useMemo(() => keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "address" }, { type: "uint16" }, { type: "bytes32" }],
    [84532n, "0x00000000000000000000000000000000000c1c1e", 2, "0x000000000000000000000000000000000000a5a5", bps, keccak256(toHex(salt))],
  )), [bps, salt]);
  return (
    <div className="rounded-3xl border border-line bg-night-2 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="flex justify-between"><span className="label text-muted">Your bid</span><span className="num">{(bps / 100).toFixed(1)}%</span></span>
          <input type="range" min={500} max={3000} step={50} value={bps} onChange={(e) => setBps(+e.target.value)} aria-label="Your bid, percent discount" /></label>
        <label><span className="label text-muted">Your secret salt</span><input className="field mt-1" value={salt} onChange={(e) => setSalt(e.target.value)} /></label>
      </div>
      <p className="label mt-5 text-muted">What everyone sees on chain until you reveal</p>
      <p className="hash mt-1 text-[14px] text-aurora" data-testid="seal">{hash}</p>
      <p className="mt-3 text-[15.5px] text-ice-2">Move the slider one step and the hash changes completely — so nobody can tell your bid from it. Without the salt, someone could just try all 51 possible bids and match the hash; the salt makes that impossible. The hash also includes the chain, the circle, the round and your address, so a copy of your hash is useless to anyone else.</p>
    </div>
  );
}
