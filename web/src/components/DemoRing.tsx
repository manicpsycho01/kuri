"use client";
import { useEffect, useState } from "react";
import { Ring } from "./Ring";

const NAMES = ["Meera", "Arjun", "Fatima", "Priya", "You", "Thomas", "Lakshmi", "Noor"];
const WINNERS = [0, 1, 2, 3, 6, 4, 5, 7];

/** A looping, illustrative circle for the home page (no chain — the real one is on /play). */
export function DemoRing() {
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setRound(3); return; }
    const id = setInterval(() => setRound((r) => (r + 1) % 9), 2200);
    return () => clearInterval(id);
  }, []);
  const winner = round > 0 ? WINNERS[round - 1]! + 1 : null;
  return (
    <Ring
      seats={NAMES.map((n, i) => { const w = WINNERS.indexOf(i); return { seat: i + 1, name: n, you: n === "You", prized: w >= 0 && w < round, wonRound: w, paid: true }; })}
      round={round} total={8} pot="₹40,000" winner={winner} caption="8 friends × ₹5,000"
    />
  );
}
