import { createBlock } from "@ethereumjs/block";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { createVM, type VM } from "@ethereumjs/vm";
import { decodeErrorResult, decodeEventLog, decodeFunctionResult, encodeDeployData, encodeFunctionData, type Abi, type Address, type Hex } from "viem";

export type Log = { address: Address; eventName: string; args: Record<string, unknown>; block: number; time: number };

/**
 * A private Ethereum chain inside the page: the real EVM (EthereumJS) running the real compiled Kuri bytecode.
 * Calls are executed directly as the given account (no wallet, no gas money, no signatures) — a sandbox, labelled as such.
 * Time is ours to move, so a whole year of chit rounds can be played in a minute.
 */
export class LocalChain {
  private constructor(private vm: VM, private common: Common) {}
  now = 1_800_000_000;
  height = 1;
  logs: Log[] = [];
  private abis = new Map<string, Abi>();
  /** Every operation runs one at a time, like transactions in a block — reads checkpoint and roll back the state. */
  private queue: Promise<unknown> = Promise.resolve();
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  static async create() {
    const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
    return new LocalChain(await createVM({ common }), common);
  }

  private block() {
    return createBlock({ header: { number: BigInt(this.height), timestamp: BigInt(this.now), gasLimit: 30_000_000n, baseFeePerGas: 0n } }, { common: this.common });
  }

  /** Remembers which ABI belongs to which address so logs can be decoded. */
  register(address: Address, abi: Abi) { this.abis.set(address.toLowerCase(), abi); }

  deploy(from: Address, abi: Abi, bytecode: Hex, args: unknown[] = []): Promise<Address> { return this.serial(() => this.deployNow(from, abi, bytecode, args)); }
  send(from: Address, to: Address, abi: Abi, functionName: string, args: unknown[] = []) { return this.serial(() => this.sendNow(from, to, abi, functionName, args)); }
  read<T = unknown>(to: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> { return this.serial(() => this.readNow<T>(to, abi, functionName, args)); }

  private async deployNow(from: Address, abi: Abi, bytecode: Hex, args: unknown[]): Promise<Address> {
    const data = encodeDeployData({ abi, bytecode, args } as never);
    const r = await this.vm.evm.runCall({ caller: createAddressFromString(from), data: hexToBytes(data), gasLimit: 30_000_000n, block: this.block() });
    if (r.execResult.exceptionError || !r.createdAddress) throw new Error("deploy failed: " + r.execResult.exceptionError?.error);
    const address = r.createdAddress.toString() as Address;
    this.register(address, abi);
    this.collect(r.execResult.logs);
    this.height++;
    return address;
  }

  /** Executes a state-changing call as `from`. Throws a readable error if the contract reverts. */
  private async sendNow(from: Address, to: Address, abi: Abi, functionName: string, args: unknown[]) {
    const data = encodeFunctionData({ abi, functionName, args } as never);
    const r = await this.vm.evm.runCall({ caller: createAddressFromString(from), to: createAddressFromString(to), data: hexToBytes(data), gasLimit: 30_000_000n, block: this.block() });
    if (r.execResult.exceptionError) throw new RevertError(this.describeRevert(abi, bytesToHex(r.execResult.returnValue) as Hex));
    this.collect(r.execResult.logs);
    this.height++;
    return { gasUsed: r.execResult.executionGasUsed };
  }

  /** Reads without changing state (the call's changes are thrown away). */
  private async readNow<T>(to: Address, abi: Abi, functionName: string, args: unknown[]): Promise<T> {
    const data = encodeFunctionData({ abi, functionName, args } as never);
    await this.vm.stateManager.checkpoint();
    try {
      const r = await this.vm.evm.runCall({ caller: createAddressFromString("0x0000000000000000000000000000000000000001"), to: createAddressFromString(to), data: hexToBytes(data), gasLimit: 30_000_000n, block: this.block() });
      if (r.execResult.exceptionError) throw new RevertError(this.describeRevert(abi, bytesToHex(r.execResult.returnValue) as Hex));
      return decodeFunctionResult({ abi, functionName, data: bytesToHex(r.execResult.returnValue) as Hex } as never) as T;
    } finally {
      await this.vm.stateManager.revert();
    }
  }

  warp(seconds: number) { this.now += Math.max(0, Math.floor(seconds)); this.height++; }

  private collect(raw: [Uint8Array, Uint8Array[], Uint8Array][] | undefined) {
    for (const [addr, topics, data] of raw ?? []) {
      const address = bytesToHex(addr) as Address;
      const abi = this.abis.get(address.toLowerCase());
      if (!abi) continue;
      try {
        const ev = decodeEventLog({ abi, topics: topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]], data: bytesToHex(data) as Hex }) as unknown as { eventName: string; args: Record<string, unknown> };
        this.logs.push({ address, eventName: ev.eventName, args: ev.args, block: this.height, time: this.now });
      } catch { /* not ours */ }
    }
  }

  private describeRevert(abi: Abi, data: Hex) {
    if (!data || data === "0x") return "Reverted";
    try {
      const e = decodeErrorResult({ abi, data });
      return e.args?.length ? `${e.errorName}(${e.args.map(String).join(", ")})` : e.errorName;
    } catch { return "Reverted"; }
  }
}

export class RevertError extends Error {}
