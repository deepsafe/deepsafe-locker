/// <reference types="vite/client" />

type InjectedProvider = import("ethers").Eip1193Provider & {
  on?(event: string, listener: (value: unknown) => void): void;
  removeListener?(event: string, listener: (value: unknown) => void): void;
};

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

export {};