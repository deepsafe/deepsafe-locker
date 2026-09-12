import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ETHERSCAN_API_KEY =
  process.env.ETHERSCAN_API_KEY ?? process.env.BSCSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: { 
      chainId: 31337,
      accounts: [
        {
          privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa80",
          balance: "10000000000000000000000",
        },
        {
          privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa81",
          balance: "10000000000000000000000",
        },
        {
          privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa82",
          balance: "10000000000000000000000",
        },
      ],
     },
    bscTestnet: {
      url:
        process.env.BSC_TESTNET_RPC_URL ??
        "https://bsc-testnet-rpc.publicnode.com",
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    bsc: {
      url: process.env.BSC_RPC_URL ?? "https://bsc-mainnet.public.blastapi.io",
      chainId: 56,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=97",
          browserURL: "https://testnet.bscscan.com",
        },
      },
      {
        network: "bsc",
        chainId: 56,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=56",
          browserURL: "https://bscscan.com",
        },
      },
    ],
  },
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
};

export default config;
