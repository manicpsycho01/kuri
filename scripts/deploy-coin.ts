/**
 * Deploys Kaudi (KDI), makes the first claim (so the explorer shows the coin working), and verifies the source on
 * Sourcify so anyone can read it on Blockscout.
 *   RPC_URL=https://sepolia.base.org node --experimental-strip-types scripts/deploy-coin.ts
 * Needs DEPLOYER_PRIVATE_KEY in .env with a little test ETH. Writes deployments/kaudi-coin.json.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const RPC = process.env.RPC_URL ?? "https://sepolia.base.org";
const art = JSON.parse(readFileSync("artifacts/contracts/KaudiCoin.sol/KaudiCoin.json", "utf8")) as { abi: never; bytecode: Hex };

const pub = createPublicClient({ transport: http(RPC) });
const chainId = await pub.getChainId();
const chain = defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount((process.env.DEPLOYER_PRIVATE_KEY ?? env.DEPLOYER_PRIVATE_KEY) as Hex);
const wallet = createWalletClient({ account, chain, transport: http(RPC) });
if (chainId === 31337) await pub.request({ method: "hardhat_setBalance" as never, params: [account.address, "0x8AC7230489E80000"] as never }); // local rehearsal: 10 ETH

const balance = await pub.getBalance({ address: account.address });
console.log(`chain ${chainId} · deployer ${account.address} · ${Number(balance) / 1e18} ETH`);
if (balance === 0n) throw new Error("The deployer has no ETH yet. Claim some from a Base Sepolia faucet first.");

const deployHash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [] } as never);
const deployed = await pub.waitForTransactionReceipt({ hash: deployHash });
const address = deployed.contractAddress!;
console.log(`Kaudi (KDI) deployed at ${address} (block ${deployed.blockNumber})`);

const claimHash = await wallet.writeContract({ address, abi: art.abi, functionName: "claim", args: [] } as never);
const claimed = await pub.waitForTransactionReceipt({ hash: claimHash });
if (claimed.status !== "success") throw new Error("first claim failed");
console.log(`first claim: ${claimHash}`);

// Verify on Sourcify (no API key needed): the exact compiler input from Hardhat's build info.
let verified = "skipped (local chain)";
if (chainId !== 31337) {
  const dir = "artifacts/build-info";
  const info = readdirSync(dir).filter((f) => f.endsWith(".output.json") === false).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")))
    .find((b) => b.input?.sources?.["project/contracts/KaudiCoin.sol"] || Object.keys(b.input?.sources ?? {}).some((k: string) => k.endsWith("contracts/KaudiCoin.sol")));
  const source = Object.keys(info.input.sources).find((k: string) => k.endsWith("contracts/KaudiCoin.sol"))!;
  const res = await fetch(`https://sourcify.dev/server/v2/verify/${chainId}/${address}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stdJsonInput: info.input, compilerVersion: info.solcLongVersion, contractIdentifier: `${source}:KaudiCoin`, creationTransactionHash: deployHash }),
  });
  verified = `${res.status} ${(await res.text()).slice(0, 200)}`;
  console.log(`Sourcify: ${verified}`);
}

writeFileSync("deployments/kaudi-coin.json", JSON.stringify({
  chainId, address, deployBlock: Number(deployed.blockNumber), deployTx: deployHash, firstClaimTx: claimHash, deployer: account.address,
  deployedAt: new Date().toISOString(), abi: art.abi,
}, null, 2) + "\n");
console.log("wrote deployments/kaudi-coin.json");
