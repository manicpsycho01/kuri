import { expect, test } from "vitest";
import { keccak256, toHex, type Address } from "viem";
import { KuriCircle, KuriFactory, MockRupee } from "@/chain/artifacts";
import { LocalChain } from "@/chain/local";

const A = (n: number) => `0x${(0x3000 + n).toString(16).padStart(40, "0")}` as Address;

test("the real contracts run in the in-page EVM: a whole circle plays out and the books balance", async () => {
  const c = await LocalChain.create();
  const deployer = A(99), foreman = A(98);
  const token = await c.deploy(deployer, MockRupee.abi, MockRupee.bytecode);
  const factory = await c.deploy(deployer, KuriFactory.abi, KuriFactory.bytecode);
  const C = 1000n * 10n ** 18n;
  await c.send(foreman, factory, KuriFactory.abi, "create", [{ token, foreman, size: 4, contribution: C, commitDuration: 3600n, revealDuration: 3600n, maxDiscountBps: 3000, commissionBps: 500, escrowPrize: false }]);
  const created = c.logs.find((l) => l.eventName === "CircleCreated")!;
  const circle = created.args.circle as Address;
  c.register(circle, KuriCircle.abi);
  for (let i = 0; i < 4; i++) {
    await c.send(A(i), token, MockRupee.abi, "faucet");
    await c.send(A(i), token, MockRupee.abi, "approve", [circle, 2n ** 255n]);
    await c.send(A(i), circle, KuriCircle.abi, "join");
  }
  expect(await c.read<number>(circle, KuriCircle.abi, "phase")).toBe(1);
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 4; i++) await c.send(A(i), circle, KuriCircle.abi, "pay");
    if (r < 3) {
      const bidder = A(r), salt = keccak256(toHex("salt" + r));
      const h = await c.read<`0x${string}`>(circle, KuriCircle.abi, "commitmentFor", [bidder, r, 2000, salt]);
      await c.send(bidder, circle, KuriCircle.abi, "commit", [h]);
      c.warp(3600);
      await c.send(bidder, circle, KuriCircle.abi, "reveal", [2000, salt]);
      c.warp(3600);
    }
    await c.send(A(7), circle, KuriCircle.abi, "settle");
  }
  expect(await c.read<number>(circle, KuriCircle.abi, "phase")).toBe(2);
  expect(c.logs.filter((l) => l.eventName === "Settled").map((l) => l.args.winner)).toEqual([A(0), A(1), A(2), A(3)].map((a) => a.toLowerCase()).map((a) => expect.stringMatching(new RegExp(a, "i"))));
  const bal = await c.read<bigint>(token, MockRupee.abi, "balanceOf", [circle]);
  expect(bal).toBe(await c.read<bigint>(circle, KuriCircle.abi, "liabilities"));
  await expect(c.send(A(0), circle, KuriCircle.abi, "pay")).rejects.toThrow("WrongPhase");
});

test("many reads at once don't corrupt the state (they queue)", async () => {
  const c = await LocalChain.create();
  const token = await c.deploy(A(99), MockRupee.abi, MockRupee.bytecode);
  await c.send(A(1), token, MockRupee.abi, "faucet");
  const all = await Promise.all(Array.from({ length: 30 }, (_, i) => c.read<bigint>(token, MockRupee.abi, "balanceOf", [A(i % 3)])));
  expect(all.filter((b) => b > 0n)).toHaveLength(10);
});
