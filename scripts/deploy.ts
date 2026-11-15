/**
 * Deploys Kuri to a chain and plays one complete demo circle on it, so the site can show real on-chain history.
 *   RPC_URL=https://sepolia.base.org EXPLORER=https://sepolia.basescan.org node --experimental-strip-types scripts/deploy.ts
 * Needs DEPLOYER_PRIVATE_KEY in .env with a little test ETH. Writes web/src/content/deployment.ts.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, keccak256, parseEther, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter(Boolean).map((l) => l.split("=") as [string, string]));
const RPC = process.env.RPC_URL ?? "https://sepolia.base.org";
const EXPLORER = process.env.EXPLORER ?? "https://sepolia.basescan.org";
const WINDOW = BigInt(process.env.WINDOW ?? 60); // seconds; the contract's minimum

const art = (n: string) => JSON.parse(readFileSync(`artifacts/contracts/${n}.sol/${n}.json`, "utf8")) as { abi: never; bytecode: Hex };
const Token = art("MockRupee"), Factory = art("KuriFactory"), Circle = art("KuriCircle");

const pub = createPublicClient({ transport: http(RPC) });
const chainId = await pub.getChainId();
const chain = defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const DEPLOYER_KEY = (process.env.DEPLOYER_PRIVATE_KEY ?? env.DEPLOYER_PRIVATE_KEY) as Hex;
const deployer = privateKeyToAccount(DEPLOYER_KEY);
const wallet = (pk: Hex) => createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(RPC) });
const log = (s: string) => console.log(new Date().toISOString().slice(11, 19), s);
const txs: { label: string; hash: Hex }[] = [];

async function send(pk: Hex, to: Address, abi: never, functionName: string, args: unknown[], label?: string) {
  const w = wallet(pk);
  const hash = await w.writeContract({ address: to, abi, functionName, args } as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} failed: ${hash}`);
  if (label) txs.push({ label, hash });
  return r;
}
async function deploy(pk: Hex, a: { abi: never; bytecode: Hex }, label: string) {
  const hash = await wallet(pk).deployContract({ abi: a.abi, bytecode: a.bytecode, args: [] } as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  log(`${label}: ${r.contractAddress}`);
  return r.contractAddress as Address;
}
const read = <T>(address: Address, abi: never, functionName: string, args: unknown[] = []) => pub.readContract({ address, abi, functionName, args } as never) as Promise<T>;
const sleepUntil = async (t: bigint) => {
  if (chainId === 31337) { // local rehearsal: move the node's clock instead of waiting
    await pub.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(t)] as never });
    await pub.request({ method: "evm_mine" as never, params: [] as never });
    return;
  }
  for (;;) { const b = await pub.getBlock(); if (b.timestamp >= t) return; await new Promise((r) => setTimeout(r, 3000)); }
};

log(`chain ${chainId}, deployer ${deployer.address}, balance ${Number(await pub.getBalance({ address: deployer.address })) / 1e18} ETH`);
const dpk = DEPLOYER_KEY;
const token = await deploy(dpk, Token, "MockRupee");
const factory = await deploy(dpk, Factory, "KuriFactory");
const implementation = await read<Address>(factory, Factory.abi, "implementation");

// Four demo members with their own keys (kept in .env.demo, git-ignored), each given a little gas money.
const demoFile = chainId === 31337 ? "/tmp/kuri-demo-local" : ".env.demo";
const keys: Hex[] = existsSync(demoFile) ? (readFileSync(demoFile, "utf8").trim().split("\n") as Hex[]) : Array.from({ length: 4 }, () => generatePrivateKey());
writeFileSync(demoFile, keys.join("\n") + "\n", { mode: 0o600 });
for (const k of keys) {
  const a = privateKeyToAccount(k).address;
  if ((await pub.getBalance({ address: a })) < parseEther("0.002")) {
    const h = await wallet(dpk).sendTransaction({ to: a, value: parseEther(process.env.GAS_EACH ?? "0.003") });
    await pub.waitForTransactionReceipt({ hash: h });
  }
}
const names = ["Meera", "Arjun", "Fatima", "Thomas"];
const C = parseEther("5000");
const r0 = await send(dpk, factory, Factory.abi, "create", [{ token, foreman: deployer.address, size: 4, contribution: C, commitDuration: WINDOW, revealDuration: WINDOW, maxDiscountBps: 3000, commissionBps: 500, escrowPrize: false }], "Foreman creates a 4-member circle");
const circle = ("0x" + r0.logs.find((l) => l.address.toLowerCase() === factory.toLowerCase())!.topics[1]!.slice(26)) as Address;
log(`demo circle: ${circle}`);
for (const [i, k] of keys.entries()) {
  await send(k, token, Token.abi, "faucet", []);
  await send(k, token, Token.abi, "approve", [circle, 2n ** 255n]);
  await send(k, circle, Circle.abi, "join", [], `${names[i]} joins, posting ₹5,000 security`);
}
const bids = [2800, 1800, 1200];
for (let r = 0; r < 4; r++) {
  for (const [i, k] of keys.entries()) await send(k, circle, Circle.abi, "pay", [], `Round ${r + 1}: ${names[i]} pays`);
  if (r < 3) {
    const k = keys[r]!, a = privateKeyToAccount(k).address, salt = keccak256(toHex(`demo-${r}-${Date.now()}`));
    const h = await read<Hex>(circle, Circle.abi, "commitmentFor", [a, r, bids[r], salt]);
    await send(k, circle, Circle.abi, "commit", [h], `Round ${r + 1}: ${names[r]} seals a bid`);
    await sleepUntil(await read<bigint>(circle, Circle.abi, "commitEnd"));
    await send(k, circle, Circle.abi, "reveal", [bids[r], salt], `Round ${r + 1}: ${names[r]} reveals ${bids[r]! / 100}%`);
    await sleepUntil(await read<bigint>(circle, Circle.abi, "revealEnd"));
  }
  await send(dpk, circle, Circle.abi, "settle", [], `Round ${r + 1}: settled`);
  log(`round ${r + 1} settled`);
}
for (const [i, k] of keys.entries()) await send(k, circle, Circle.abi, "withdraw", [], `${names[i]} withdraws everything owed`);
await send(dpk, circle, Circle.abi, "withdraw", [], "Foreman withdraws the commission");
log(`circle balance after: ${await read<bigint>(token, Token.abi, "balanceOf", [circle])}`);

const out = { chainId, explorer: EXPLORER, token, factory, implementation, demoCircle: circle, demoTxs: txs, deployedAt: new Date().toISOString().slice(0, 10) };
if (process.env.WRITE !== "0") {
  writeFileSync("web/src/content/deployment.ts", `/** Written by scripts/deploy.ts. */\nexport const DEPLOYMENT = ${JSON.stringify(out, null, 2)} as const;\n`);
  log("wrote web/src/content/deployment.ts");
}
