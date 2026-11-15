import { defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    profiles: {
      default: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 500 }, evmVersion: "cancun" } },
    },
  },
  paths: { tests: { solidity: "test", nodejs: "test" } },
  test: { solidity: { fuzz: { runs: 512 } } },
});
