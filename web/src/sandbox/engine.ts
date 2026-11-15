import { keccak256, toHex, type Address, type Hex } from "viem";
import { KuriCircle, KuriFactory, MockRupee } from "@/chain/artifacts";
import { LocalChain, RevertError } from "@/chain/local";

export type Mode = "trust" | "escrow";
export type Options = { size: number; mode: Mode; contribution: number; unreliable: boolean; seed?: string };

/** A neighbour's motive decides when and how hard they bid. */
export type Persona = { id: string; name: string; story: string; bid: (round: number, size: number, rnd: () => number) => number | null; defaults?: boolean };

export const PERSONAS: Persona[] = [
  { id: "meera", name: "Meera", story: "School fees are due next month — she needs the pot early and will give up a lot for it.", bid: (r) => (r <= 2 ? 2800 + (r === 0 ? 150 : 0) : null) },
  { id: "arjun", name: "Arjun", story: "Wants a second-hand bike for deliveries. Keen, but not desperate.", bid: (r, n, rnd) => (r <= n / 2 ? 1700 + Math.round(rnd() * 600) : null) },
  { id: "fatima", name: "Fatima", story: "Restocks her shop before Onam. Bids steadily once the season nears.", bid: (r, _n, rnd) => (r >= 1 ? 1200 + Math.round(rnd() * 400) : null) },
  { id: "priya", name: "Priya", story: "Her father's surgery is planned for round four — she'll bid hard then.", bid: (r) => (r === 3 ? 3000 : r > 3 ? 1500 : null) },
  { id: "thomas", name: "Thomas", story: "A patient saver. Only bids when the circle is nearly over, and only a little.", bid: (r, n) => (n - r <= 2 ? 600 : null) },
  { id: "lakshmi", name: "Lakshmi", story: "Treats the kuri as a savings jar. Never bids; takes the pot whenever it falls to her.", bid: () => null },
  { id: "noor", name: "Noor", story: "Saving for a wedding later in the year. Starts bidding mid-way.", bid: (r, n, rnd) => (r >= n / 2 ? 1300 + Math.round(rnd() * 500) : null) },
  { id: "ravi", name: "Ravi", story: "Always bids a modest ten per cent, every round, just in case.", bid: () => 1000 },
  { id: "anil", name: "Anil", story: "Bids only when someone he trusts tells him the price is right — about fifteen per cent.", bid: (r) => (r % 2 === 1 ? 1500 : null) },
];
export const JOSEPH: Persona = { id: "joseph", name: "Joseph", story: "Charming, persuasive, and short of money. Bids the maximum straight away — and may stop paying once he's won.", bid: (r) => (r === 0 ? 3000 : null), defaults: true };

export type Seat = { seat: number; address: Address; name: string; you: boolean; persona?: Persona };
export type MemberState = { seat: number; prized: boolean; inDefault: boolean; misses: number; security: bigint; escrow: bigint; dividendCredit: bigint; claimable: bigint; paid: boolean; committed: boolean };
export type RoundResult = { round: number; winner: Address | null; discountBps: number; pot: bigint; prize: bigint; escrowed: bigint; commission: bigint; dividendEach: bigint; payers: number; bids: { seat: number; bps: number }[] };
export type Call = { who: string; fn: string; detail: string; gas: bigint; events: string[]; error?: string; time: number };

const UNIT = 10n ** 18n;
const rupees = (n: number) => BigInt(Math.round(n)) * UNIT;
const addr = (n: number) => `0x${(0x7000 + n).toString(16).padStart(40, "0")}` as Address;
const DAY = 86_400;

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

/** One kuri, played on the in-page chain with the real contracts. You are one seat; the rest follow their personas. */
export class Sandbox {
  calls: Call[] = [];
  rounds: RoundResult[] = [];
  private yourBid: { bps: number; salt: Hex } | null = null;
  private botBids = new Map<number, { bps: number; salt: Hex }>();
  private flows = new Map<number, bigint[]>(); // seat → net cash per round (+ in, − out)
  private prizesPaid = new Map<number, bigint>(); // seat → prize already counted as received

  private constructor(readonly chain: LocalChain, readonly opts: Options, readonly token: Address, readonly circle: Address, readonly seats: Seat[], readonly foreman: Address, private rnd: () => number) {}

  static async start(opts: Options) {
    const chain = await LocalChain.create();
    const deployer = addr(900), foreman = addr(901);
    const token = await chain.deploy(deployer, MockRupee.abi, MockRupee.bytecode);
    const factory = await chain.deploy(deployer, KuriFactory.abi, KuriFactory.bytecode);
    const size = Math.max(4, Math.min(10, opts.size));
    const C = rupees(opts.contribution);
    await chain.send(foreman, factory, KuriFactory.abi, "create", [{ token, foreman, size, contribution: C, commitDuration: BigInt(DAY), revealDuration: BigInt(DAY), maxDiscountBps: 3000, commissionBps: 500, escrowPrize: opts.mode === "escrow" }]);
    const circle = chain.logs.find((l) => l.eventName === "CircleCreated")!.args.circle as Address;
    chain.register(circle, KuriCircle.abi);

    const people = PERSONAS.slice(0, size - 1);
    if (opts.unreliable) people[people.length - 1] = JOSEPH;
    const youAt = Math.floor(size / 2); // you sit mid-table: ties go to lower seats
    const seats: Seat[] = [];
    let p = 0;
    for (let i = 0; i < size; i++) {
      if (i === youAt) seats.push({ seat: i + 1, address: addr(i), name: "You", you: true });
      else { const persona = people[p++]!; seats.push({ seat: i + 1, address: addr(i), name: persona.name, you: false, persona }); }
    }
    const s = new Sandbox(chain, { ...opts, size }, token, circle, seats, foreman, rng(opts.seed ?? "kuri"));
    for (const seat of seats) {
      await s.tx(seat, token, MockRupee.abi, "faucet", [], "draws ₹1,00,000 of test rupees");
      await s.tx(seat, token, MockRupee.abi, "approve", [circle, 2n ** 255n], "lets the circle collect instalments");
      await s.tx(seat, circle, KuriCircle.abi, "join", [], `takes seat ${seat.seat}, posting one instalment as security`);
      s.flow(seat.seat, 0, -C);
    }
    return s;
  }

  get you() { return this.seats.find((x) => x.you)!; }
  get C() { return rupees(this.opts.contribution); }

  private flow(seat: number, round: number, amount: bigint) {
    const f = this.flows.get(seat) ?? Array.from({ length: this.opts.size + 1 }, () => 0n);
    f[round] = (f[round] ?? 0n) + amount;
    this.flows.set(seat, f);
  }

  /** Sends a transaction and records it for the "under the hood" log. */
  private async tx(seat: Seat | { name: string; address: Address }, to: Address, abi: typeof KuriCircle.abi | typeof MockRupee.abi | typeof KuriFactory.abi, fn: string, args: unknown[], detail: string) {
    const before = this.chain.logs.length;
    try {
      const { gasUsed } = await this.chain.send(seat.address, to, abi as never, fn, args);
      this.calls.push({ who: seat.name, fn, detail, gas: gasUsed, events: this.chain.logs.slice(before).map((l) => l.eventName), time: this.chain.now });
      return true;
    } catch (e) {
      this.calls.push({ who: seat.name, fn, detail, gas: 0n, events: [], error: e instanceof RevertError ? e.message : String(e), time: this.chain.now });
      return false;
    }
  }

  private read<T>(fn: string, args: unknown[] = []) { return this.chain.read<T>(this.circle, KuriCircle.abi as never, fn, args); }

  async round() { return Number(await this.read<number>("round")); }
  async phase() { return Number(await this.read<number>("phase")); }
  async finished() { return (await this.phase()) === 2; }

  async member(seat: Seat): Promise<MemberState> {
    const r = await this.round();
    const m = await this.read<readonly [number, boolean, boolean, number, bigint, bigint, bigint, bigint]>("members", [seat.address]);
    const commitment = await this.read<Hex>("commitment", [BigInt(r), seat.address]);
    return { seat: m[0], prized: m[1], inDefault: m[2], misses: m[3], security: m[4], escrow: m[5], dividendCredit: m[6], claimable: m[7], paid: await this.read<boolean>("paid", [BigInt(r), seat.address]), committed: commitment !== `0x${"0".repeat(64)}` };
  }
  async members() { return Promise.all(this.seats.map((s) => this.member(s))); }
  async dueNow(seat = this.you) { return this.read<bigint>("dueNow", [seat.address]); }
  async solvent() { return (await this.chain.read<bigint>(this.token, MockRupee.abi as never, "balanceOf", [this.circle])) === (await this.read<bigint>("liabilities")); }
  async yourWallet() { return this.chain.read<bigint>(this.token, MockRupee.abi as never, "balanceOf", [this.you.address]); }

  /** You pay this round's instalment (dividend credit first). */
  async payYou() {
    const r = await this.round(), due = await this.dueNow();
    const ok = await this.tx(this.you, this.circle, KuriCircle.abi, "pay", [], `pays round ${r + 1}`);
    if (ok) this.flow(this.you.seat, r, -due);
    return ok;
  }

  /** You place a sealed bid: only its hash goes on chain until the reveal. */
  async bidYou(bps: number) {
    const r = await this.round();
    const salt = keccak256(toHex(`you:${r}:${this.rnd()}`));
    const h = await this.read<Hex>("commitmentFor", [this.you.address, r, bps, salt]);
    const ok = await this.tx(this.you, this.circle, KuriCircle.abi, "commit", [h], `seals a bid — only the hash ${h.slice(0, 10)}… is public`);
    if (ok) { this.yourBid = { bps, salt }; this.flow(this.you.seat, r, -this.C / 20n); }
    return ok ? h : null;
  }

  /** Everyone else acts, bids are revealed, and the round is settled. Returns the round's result. */
  async closeRound(): Promise<RoundResult> {
    const r = await this.round();
    const last = r === this.opts.size - 1;
    // 1. Neighbours pay — except an unreliable member who has already won (in either mode he simply stops paying).
    for (const seat of this.seats.filter((s) => !s.you)) {
      const m = await this.member(seat);
      if (m.paid || m.inDefault) continue;
      if (seat.persona?.defaults && m.prized) continue;
      const due = await this.dueNow(seat);
      if (await this.tx(seat, this.circle, KuriCircle.abi, "pay", [], `pays round ${r + 1}`)) this.flow(seat.seat, r, -due);
    }
    // 2. Neighbours seal their bids.
    this.botBids.clear();
    if (!last) {
      for (const seat of this.seats.filter((s) => !s.you)) {
        const m = await this.member(seat);
        if (m.prized || m.inDefault || !m.paid) continue;
        const bps = seat.persona!.bid(r, this.opts.size, this.rnd);
        if (bps === null) continue;
        const salt = keccak256(toHex(`${seat.name}:${r}:${this.rnd()}`));
        const h = await this.read<Hex>("commitmentFor", [seat.address, r, bps, salt]);
        if (await this.tx(seat, this.circle, KuriCircle.abi, "commit", [h], "seals a bid")) { this.botBids.set(seat.seat, { bps, salt }); this.flow(seat.seat, r, -this.C / 20n); }
      }
    }
    // 3. Bidding closes; everyone reveals.
    const bids: { seat: number; bps: number }[] = [];
    if (!last) {
      const commitEnd = Number(await this.read<bigint>("commitEnd"));
      this.chain.warp(commitEnd - this.chain.now);
      if (this.yourBid && (await this.tx(this.you, this.circle, KuriCircle.abi, "reveal", [this.yourBid.bps, this.yourBid.salt], `reveals ${this.yourBid.bps / 100}%`))) {
        bids.push({ seat: this.you.seat, bps: this.yourBid.bps });
        this.flow(this.you.seat, r, this.C / 20n);
      }
      for (const [seatNo, b] of this.botBids) {
        const seat = this.seats[seatNo - 1]!;
        if (await this.tx(seat, this.circle, KuriCircle.abi, "reveal", [b.bps, b.salt], `reveals ${b.bps / 100}%`)) { bids.push({ seat: seatNo, bps: b.bps }); this.flow(seatNo, r, this.C / 20n); }
      }
      this.yourBid = null;
      const revealEnd = Number(await this.read<bigint>("revealEnd"));
      this.chain.warp(revealEnd - this.chain.now);
    } else {
      this.chain.warp(2 * DAY);
    }
    // 4. Anyone may settle — here, the foreman's clerk.
    const before = this.chain.logs.length;
    await this.tx({ name: "Clerk", address: addr(902) }, this.circle, KuriCircle.abi, "settle", [], `settles round ${r + 1}`);
    const ev = this.chain.logs.slice(before).find((l) => l.eventName === "Settled")!.args;
    const result: RoundResult = {
      round: r, winner: (ev.winner as Address) === "0x0000000000000000000000000000000000000000" ? null : (ev.winner as Address),
      discountBps: Number(ev.discountBps), pot: ev.pot as bigint, prize: ev.prize as bigint, escrowed: ev.escrowed as bigint,
      commission: ev.commission as bigint, dividendEach: ev.dividendEach as bigint, payers: Number(ev.payers), bids: bids.sort((a, b) => b.bps - a.bps || a.seat - b.seat),
    };
    if (result.winner) {
      const w = this.seats.find((s) => s.address.toLowerCase() === result.winner!.toLowerCase())!;
      this.flow(w.seat, r, result.prize - result.escrowed);
      this.prizesPaid.set(w.seat, (this.prizesPaid.get(w.seat) ?? 0n) + result.prize - result.escrowed);
    }
    this.rounds.push(result);
    if (await this.finished()) {
      // Whatever is left (security, unused escrow, dividend credit, returned bonds) comes back at the end.
      for (const seat of this.seats) {
        const m = await this.member(seat);
        this.flow(seat.seat, this.opts.size, m.claimable - (this.prizesPaid.get(seat.seat) ?? 0n) - this.returnedBonds(seat.seat));
      }
    }
    return result;
  }

  /** Bonds already counted as returned at reveal time, so they aren't counted twice at the end. */
  private returnedBonds(seat: number) {
    return BigInt(this.rounds.filter((r) => r.bids.some((b) => b.seat === seat)).length) * (this.C / 20n);
  }

  /** Net cash per round for a seat (negative = paid in). */
  cashflows(seat: number) { return this.flows.get(seat) ?? []; }

  /** Effective annual rate if each round is a month: positive for savers who were paid to wait, the cost of credit for early winners. */
  rate(seat: number) { return annualRate(this.cashflows(seat)); }
}

/**
 * Internal rate of return of monthly flows, annualised. Cash flows that change sign several times (save, then
 * borrow) can have several roots; the meaningful one is the root nearest zero, so search outward from zero.
 */
export function annualRate(flows: bigint[]): number | null {
  const f = flows.map((x) => Number(x) / 1e18);
  if (!f.some((x) => x > 0) || !f.some((x) => x < 0)) return null;
  const npv = (r: number) => f.reduce((s, x, t) => s + x / Math.pow(1 + r, t), 0);
  const bisect = (a: number, b: number) => { for (let i = 0; i < 100; i++) { const m = (a + b) / 2; if (npv(a) * npv(m) <= 0) b = m; else a = m; } return (a + b) / 2; };
  const step = 0.0025;
  for (let k = 0; k < 400; k++) {
    for (const [a, b] of [[k * step, (k + 1) * step], [-(k + 1) * step, -k * step]] as const) {
      if (b > -0.5 && npv(a) * npv(b) <= 0) return Math.pow(1 + bisect(a, b), 12) - 1;
    }
  }
  return null;
}

/** Total received minus total paid in, in rupees. */
export const netResult = (flows: bigint[]) => flows.reduce((a, b) => a + b, 0n);
