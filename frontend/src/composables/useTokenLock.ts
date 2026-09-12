import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
} from "ethers";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { Allocation, AllocationForm } from "../types";
import { chains, defaultChainId } from "../chains";

const lockAbi = [
  "function allocationCount() view returns (uint256)",
  "function totalReserved() view returns (uint256)",
  "function token() view returns (address)",
  "function owner() view returns (address)",
  "function allocations(uint256) view returns (address beneficiary, uint8 tag, uint128 amount, uint128 released, uint64 start, uint64 cliff, uint64 end, uint64 revokedAt)",
  "function vestedAmount(uint256,uint64) view returns (uint256)",
  "function releasableAmount(uint256) view returns (uint256)",
  "function createAllocation(address,uint8,uint128,uint64,uint64,uint64) returns (uint256)",
  "function release(uint256)",
  "function revoke(uint256)",
] as const;

const tokenAbi = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
] as const;


const emptyForm = (): AllocationForm => ({ beneficiary: "", tag: 0, amount: "", start: "", cliff: "", end: "" });

export function useTokenLock() {
  const selectedChainId = ref<number>(defaultChainId);
  const chain = computed(() => chains.find((item) => item.id === selectedChainId.value) ?? chains[0]);
  const lockAddress = computed(() => chain.value.lockAddress);
  let loadVersion = 0;
  const account = ref("");
  const walletChainId = ref<number>();
  const owner = ref("");
  const tokenAddress = ref("");
  const symbol = ref("DEF");
  const decimals = ref(18);
  const totalReserved = ref(0n);
  const allocations = ref<Allocation[]>([]);
  const loading = ref(true);
  const connecting = ref(false);
  const addressCopied = ref(false);
  const txPending = ref("");
  const error = ref("");
  const notice = ref("");
  const createOpen = ref(false);
  const form = ref<AllocationForm>(emptyForm());
  let walletProvider: BrowserProvider | undefined;
  let ethereum: NonNullable<Window["ethereum"]> | undefined;

  const configured = computed(() => isAddress(lockAddress.value) && lockAddress.value !== ZeroAddress);
  const isOwner = computed(() => !!account.value && account.value.toLowerCase() === owner.value.toLowerCase());
  const wrongNetwork = computed(() => walletChainId.value !== undefined && walletChainId.value !== selectedChainId.value);
  const totalReleased = computed(() => allocations.value.reduce((sum, item) => sum + item.released, 0n));
  const totalAllocated = computed(() => allocations.value.reduce((sum, item) => sum + item.amount, 0n));

  function shortAddress(value: string) { return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ""; }
  function formatToken(value: bigint, compact = false) {
    const numeric = Number(formatUnits(value, decimals.value));
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: compact ? 0 : 4, notation: compact ? "compact" : "standard" }).format(numeric);
  }
  function formatDate(timestamp: number) {
    if (!timestamp) return "Not set";
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(timestamp * 1000);
  }
  function progress(item: Allocation) {
    if (item.amount === 0n) return 0;
    return Math.min(100, Number((item.vested * 10_000n) / item.amount) / 100);
  }
  function status(item: Allocation) {
    const now = Math.floor(Date.now() / 1000);
    if (item.revokedAt) return "Revoked";
    if (now < item.cliff) return "Cliff";
    if (now >= item.end) return "Vested";
    return "Vesting";
  }
  function hasErrorCode(cause: unknown, expectedCode: number): boolean {
    if (!cause || typeof cause !== "object") return false;
    const causeRecord = cause as Record<string, unknown>;
    return Number(causeRecord.code) === expectedCode || hasErrorCode(causeRecord.error, expectedCode) || hasErrorCode(causeRecord.info, expectedCode) || hasErrorCode(causeRecord.cause, expectedCode);
  }
  function errorMessage(cause: unknown, fallback: string): string {
    if (!cause || typeof cause !== "object") return fallback;
    const causeRecord = cause as Record<string, unknown>;
    const messages = [causeRecord.message, causeRecord.shortMessage].filter((value): value is string => typeof value === "string").join(" ");
    if (hasErrorCode(cause, 4001) || causeRecord.code === "ACTION_REJECTED" || messages.toLowerCase().includes("user rejected")) return "Transaction cancelled in the wallet.";
    if (messages.includes("Keyring not found")) return selectedChainId.value === 31337 ? "The wallet cannot sign for this Hardhat account. Import the account's private key shown by `npx hardhat node`, select that imported account, and reconnect." : "The wallet cannot sign for the selected account. Select an account owned by this wallet and reconnect.";
    return messages || errorMessage(causeRecord.error, "") || errorMessage(causeRecord.info, "") || errorMessage(causeRecord.cause, "") || fallback;
  }

  async function loadAllocations() {
    const version = ++loadVersion;
    const selected = chain.value;
    error.value = "";
    if (!configured.value) { loading.value = false; return; }
    loading.value = true;
    const readProvider = new JsonRpcProvider(selected.rpcUrl, selected.id, { staticNetwork: true });
    try {
      const lock = new Contract(selected.lockAddress, lockAbi, readProvider);
      const [countValue, reservedValue, tokenValue, ownerValue] = await Promise.all([lock.allocationCount(), lock.totalReserved(), lock.token(), lock.owner()]);
      if (version !== loadVersion) return;
      tokenAddress.value = tokenValue; owner.value = ownerValue; totalReserved.value = reservedValue;
      const token = new Contract(tokenValue, tokenAbi, readProvider);
      const [tokenSymbol, tokenDecimals] = await Promise.all([token.symbol(), token.decimals()]);
      if (version !== loadVersion) return;
      symbol.value = tokenSymbol; decimals.value = Number(tokenDecimals);
      const now = BigInt(Math.floor(Date.now() / 1000));
      const result = await Promise.all(Array.from({ length: Number(countValue) }, async (_, id) => {
        const [raw, vested, releasable] = await Promise.all([lock.allocations(id), lock.vestedAmount(id, now), lock.releasableAmount(id)]);
        return { id, beneficiary: raw.beneficiary, tag: Number(raw.tag), amount: raw.amount, released: raw.released, vested, releasable, start: Number(raw.start), cliff: Number(raw.cliff), end: Number(raw.end), revokedAt: Number(raw.revokedAt) };
      }));
      if (version === loadVersion) allocations.value = result;
    } catch (cause) { if (version === loadVersion) error.value = cause instanceof Error ? cause.message : "Unable to read the lock contract."; }
    finally { readProvider.destroy(); if (version === loadVersion) loading.value = false; }
  }
  async function selectChain(id: number) {
    if (txPending.value || connecting.value || id === selectedChainId.value || !chains.some((item) => item.id === id)) return;
    selectedChainId.value = id;
    owner.value = ""; tokenAddress.value = ""; totalReserved.value = 0n; allocations.value = [];
    symbol.value = "DEF"; decimals.value = 18; notice.value = ""; createOpen.value = false; form.value = emptyForm();
    await loadAllocations();
  }
  async function connectWallet() {
    if (!window.ethereum) { error.value = "No injected wallet was found. Install a browser wallet to continue."; return; }
    connecting.value = true; error.value = "";
    try {
      ethereum = window.ethereum; walletProvider = new BrowserProvider(ethereum);
      await walletProvider.send("eth_requestAccounts", []);
      const signer = await walletProvider.getSigner(); account.value = await signer.getAddress(); walletChainId.value = Number((await walletProvider.getNetwork()).chainId);
      ethereum.on?.("accountsChanged", handleAccountsChanged); ethereum.on?.("chainChanged", handleChainChanged);
    } catch (cause) { error.value = cause instanceof Error ? cause.message : "Wallet connection was cancelled."; }
    finally { connecting.value = false; }
  }
  function disconnectWallet() {
    account.value = ""; walletChainId.value = undefined;
    ethereum?.removeListener?.("accountsChanged", handleAccountsChanged); ethereum?.removeListener?.("chainChanged", handleChainChanged);
  }
  function handleAccountsChanged(accounts: unknown) { account.value = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : ""; }
  function handleChainChanged(chainId: unknown) { walletChainId.value = Number(BigInt(String(chainId))); if (ethereum) walletProvider = new BrowserProvider(ethereum); }
  async function copyAccount() {
    try { await navigator.clipboard.writeText(account.value); addressCopied.value = true; window.setTimeout(() => (addressCopied.value = false), 1800); }
    catch { error.value = "Unable to copy the wallet address. Check browser clipboard permissions."; }
  }
  async function switchNetwork() {
    if (!walletProvider) return;
    const selected = chain.value;
    const chainId = `0x${selected.id.toString(16)}`;
    error.value = "";
    try { await walletProvider.send("wallet_switchEthereumChain", [{ chainId }]); }
    catch (cause) {
      if (!hasErrorCode(cause, 4902)) { error.value = cause instanceof Error ? cause.message : "Network switch failed."; return; }
      try {
        await walletProvider.send("wallet_addEthereumChain", [{ chainId, chainName: selected.name, nativeCurrency: { name: selected.currency, symbol: selected.currency, decimals: 18 }, rpcUrls: [selected.rpcUrl], ...(selected.explorer ? { blockExplorerUrls: [selected.explorer] } : {}) }]);
        await walletProvider.send("wallet_switchEthereumChain", [{ chainId }]);
      }
      catch (addCause) { error.value = selected.id === 31337 ? `Unable to add Hardhat Local. Add chain 31337 with ${selected.rpcUrl} manually in a wallet that supports local RPCs.` : errorMessage(addCause, "Adding the network failed."); }
    }
  }
  async function write(action: string, operation: (lock: Contract) => Promise<unknown>) {
    if (!walletProvider || wrongNetwork.value || !configured.value || loading.value || txPending.value) return;
    txPending.value = action; error.value = ""; notice.value = "Confirm the transaction in your wallet.";
    try {
      const lock = new Contract(lockAddress.value, lockAbi, await walletProvider.getSigner());
      const transaction = (await operation(lock)) as { wait: () => Promise<unknown> };
      notice.value = "Transaction submitted. Waiting for confirmation."; await transaction.wait(); notice.value = "Transaction confirmed."; await loadAllocations();
    } catch (cause) { notice.value = ""; error.value = errorMessage(cause, "Transaction failed."); }
    finally { txPending.value = ""; }
  }
  function release(id: number) { return write(`release-${id}`, (lock) => lock.release(id)); }
  function revoke(id: number) { return write(`revoke-${id}`, (lock) => lock.revoke(id)); }
  function toTimestamp(value: string) { const result = Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000); if (!Number.isFinite(result)) throw new Error("Enter all schedule dates."); return result; }
  async function createAllocation() {
    if (!walletProvider || wrongNetwork.value || !configured.value || loading.value || txPending.value || !isOwner.value) return;
    try {
      if (!isAddress(form.value.beneficiary)) throw new Error("Enter a valid beneficiary address.");
      const amount = parseUnits(form.value.amount, decimals.value); const start = toTimestamp(form.value.start); const cliff = toTimestamp(form.value.cliff); const end = toTimestamp(form.value.end);
      if (amount <= 0n) throw new Error("Amount must be greater than zero.");
      if (cliff < start || end <= start || cliff > end) throw new Error("The vesting schedule is invalid.");
      txPending.value = "create"; error.value = "";
      const signer = await walletProvider.getSigner(); const token = new Contract(tokenAddress.value, tokenAbi, signer); const allowance: bigint = await token.allowance(account.value, lockAddress.value);
      if (allowance < amount) { notice.value = `Approve ${symbol.value} funding in your wallet.`; const approval = await token.approve(lockAddress.value, amount); await approval.wait(); }
      notice.value = "Create the funded allocation in your wallet.";
      const lock = new Contract(lockAddress.value, lockAbi, signer); const transaction = await lock.createAllocation(getAddress(form.value.beneficiary), form.value.tag, amount, start, cliff, end);
      notice.value = "Allocation submitted. Waiting for confirmation."; await transaction.wait(); notice.value = "Allocation created and funded.";
      createOpen.value = false; form.value = emptyForm(); await loadAllocations();
    } catch (cause) { notice.value = ""; error.value = errorMessage(cause, "Allocation creation failed."); }
    finally { txPending.value = ""; }
  }
  onMounted(loadAllocations);
  onBeforeUnmount(disconnectWallet);
  return { chains, selectedChainId, selectChain, lockAddress, account, owner, symbol, totalReserved, allocations, loading, connecting, addressCopied, txPending, error, notice, createOpen, form, configured, isOwner, wrongNetwork, chain, totalReleased, totalAllocated, loadAllocations, connectWallet, disconnectWallet, copyAccount, switchNetwork, release, revoke, createAllocation, shortAddress, formatToken, formatDate, progress, status };
}
