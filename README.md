# Kuri — a chit fund nobody can run away with

India's auction chit fund (kuri / chitty / bhishi / committee) as Solidity smart contracts: monthly instalments,
a sealed-bid auction for the pot, the discount shared out as dividends, a capped organiser commission — and no
organiser who can touch the money.

- `contracts/` — `KuriCircle` (one circle), `KuriFactory` (EIP-1167 clones), `MockRupee` (test rupees with a faucet)
- `test/` — Solidity unit, fuzz and invariant tests (Hardhat 3 + forge-std)
- `web/` — the site: a sandbox that runs the compiled bytecode in an in-browser EVM (EthereumJS), plus explainers
- `scripts/deploy.ts` — deploys to Base Sepolia and plays a full demo circle on chain

## Design in one paragraph

Each round, members `pay()`; members who haven't won `commit()` a hash of their bid (with a small bond); after
bidding closes they `reveal()`; then anyone calls `settle()`. The highest discount wins (ties → lower seat); the
winner gets pot − discount; the foreman gets a commission (a % of the pot, so the minimum bid equals it); the rest
of the discount is credited to everyone who paid as a dividend. Circles choose **trust** mode (full prize; one
instalment of security; second miss = default) or **escrow** mode (a winner's own future instalments are held back
from the prize, so prized members cannot default). Code can hold money; it can't make people pay — so the trade-off
is explicit.

## Run

```bash
pnpm install && pnpm compile
pnpm test:sol                      # 34 tests incl. fuzz and invariants
node tools/export-abi.mjs          # copy ABIs/bytecode into the web app
cd web && pnpm install && pnpm test && pnpm build && pnpm start   # then: BASE_URL=http://localhost:3600 pnpm e2e
```

A learning project on a testnet. Test rupees only — not a registered chit fund under the Chit Funds Act, 1982,
and not professionally audited.
