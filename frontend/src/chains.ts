export const chains = [
  { id: 31337, name: "Hardhat Local", explorer: "", currency: "ETH", rpcUrl: "http://127.0.0.1:8545", lockAddress: "0xFFB47560895504EBab4ca9763e9B24333A1d1CC7" },
  { id: 97, name: "BNB Testnet", explorer: "https://testnet.bscscan.com", currency: "tBNB", rpcUrl: "https://bsc-testnet-rpc.publicnode.com", lockAddress: "0xd26ED11E8b180b3Bd5E3DBb511E7edB3256d0e32" },
  { id: 56, name: "BNB Smart Chain", explorer: "https://bscscan.com", currency: "BNB", rpcUrl: "https://bsc-rpc.publicnode.com", lockAddress: "" },
] as const;

export const defaultChainId = 97;