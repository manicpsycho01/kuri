import { describe, expect, test } from "vitest";
import { annualRate, Sandbox } from "@/sandbox/engine";

async function play(mode: "trust" | "escrow", unreliable: boolean, youBid?: (r: number) => number | null) {
  const s = await Sandbox.start({ size: 8, mode, contribution: 5000, unreliable, seed: "t" });
  for (let r = 0; r < 8; r++) {
    expect(await s.payYou()).toBe(true);
    const b = youBid?.(r);
    if (b && !(await s.member(s.you)).prized && r < 7) await s.bidYou(b);
    await s.closeRound();
    expect(await s.solvent()).toBe(true);
  }
  return s;
}

describe("sandbox", () => {
  test("a full trust-mode circle: everyone wins once, the books balance, and cash in = cash out", async () => {
    const s = await play("trust", false);
    expect(await s.finished()).toBe(true);
    expect(s.rounds).toHaveLength(8);
    const winners = new Set(s.rounds.map((r) => r.winner));
    expect(winners.size).toBe(8);
    // Every rupee paid in comes back out to someone (members + foreman commission).
    const net = s.seats.reduce((sum, seat) => sum + s.cashflows(seat.seat).reduce((a, b) => a + b, 0n), 0n);
    const commission = s.rounds.reduce((a, r) => a + r.commission, 0n);
    expect(net + commission).toBe(0n);
  });

  test("early winners pay for credit, late winners are paid to wait", async () => {
    const s = await play("trust", false);
    const meera = s.seats.find((x) => x.name === "Meera")!, lakshmi = s.seats.find((x) => x.name === "Lakshmi")!;
    const first = s.rounds[0]!;
    expect(first.winner?.toLowerCase()).toBe(meera.address.toLowerCase());
    const cf = s.cashflows(meera.seat);
    expect(cf[0]! > 0n).toBe(true); // she received the pot at the start: she borrowed
    expect(s.rate(meera.seat)!).toBeGreaterThan(0.1); // the cost of her early credit
    expect(s.rate(s.seats.find((x) => x.name === "Arjun")!.seat)).not.toBeNull();
    expect(s.rate(lakshmi.seat)!).toBeGreaterThan(0); // the saver earned a return
  });

  test("your sealed bid can win", async () => {
    const s = await play("escrow", false, (r) => (r === 0 ? 3000 : null));
    expect(s.rounds[0]!.winner?.toLowerCase()).toBe(s.you.address.toLowerCase());
    expect(s.rounds[0]!.escrowed > 0n).toBe(true); // escrow mode held back his own future instalments
    expect(s.calls.some((c) => c.who === "You" && c.fn === "commit")).toBe(true);
  });

  test("trust mode: Joseph wins, stops paying, and ends in default — escrow mode pays his dues from his own prize", async () => {
    const t = await play("trust", true);
    const jt = t.seats.find((x) => x.name === "Joseph")!;
    expect((await t.member(jt)).inDefault).toBe(true);
    const e = await play("escrow", true);
    const je = e.seats.find((x) => x.name === "Joseph")!;
    expect((await e.member(je)).inDefault).toBe(false);
    expect((await e.member(je)).misses).toBeGreaterThan(0);
  });

  test("annualRate: a saver who gets 1,100 back after 12 months of 1,000 earned about 10% a year", () => {
    expect(annualRate([-1000n * 10n ** 18n, ...Array(11).fill(0n), 1100n * 10n ** 18n])).toBeCloseTo(0.1, 2);
    expect(annualRate([5n, 5n])).toBeNull();
  });
});
