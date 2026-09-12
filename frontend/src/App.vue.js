import { ArrowDownToLine, Check, ChevronRight, CircleAlert, Clock3, ExternalLink, LoaderCircle, LockKeyhole, Plus, RefreshCw, ShieldCheck, Unplug, Wallet, X, } from "lucide-vue-next";
import { BrowserProvider, Contract, JsonRpcProvider, ZeroAddress, formatUnits, getAddress, isAddress, parseUnits, } from "ethers";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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
];
const tokenAbi = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
];
const allocationTags = [
    "Genesis Nodes",
    "Investors",
    "Team",
    "Airdrop (Locked)",
    "Ecosystem",
    "Marketing",
    "Liquidity Provider",
    "CEX Allocation",
    "Staking Rewards",
];
const lockAddress = import.meta.env.VITE_LOCK_ADDRESS?.trim() ?? "";
const expectedChainId = Number(import.meta.env.VITE_CHAIN_ID || 97);
const rpcUrl = import.meta.env.VITE_RPC_URL || "https://bsc-testnet-rpc.publicnode.com";
const chainInfo = {
    56: { name: "BNB Smart Chain", explorer: "https://bscscan.com" },
    97: { name: "BNB Testnet", explorer: "https://testnet.bscscan.com" },
    31337: { name: "Hardhat", explorer: "" },
};
const account = ref("");
const walletChainId = ref();
const owner = ref("");
const tokenAddress = ref("");
const symbol = ref("DEF");
const decimals = ref(18);
const totalReserved = ref(0n);
const allocations = ref([]);
const loading = ref(true);
const connecting = ref(false);
const txPending = ref("");
const error = ref("");
const notice = ref("");
const filter = ref("all");
const createOpen = ref(false);
const form = ref({ beneficiary: "", tag: 0, amount: "", start: "", cliff: "", end: "" });
let readProvider;
let walletProvider;
let ethereum;
const configured = computed(() => isAddress(lockAddress) && lockAddress !== ZeroAddress);
const isOwner = computed(() => !!account.value && account.value.toLowerCase() === owner.value.toLowerCase());
const wrongNetwork = computed(() => walletChainId.value !== undefined && walletChainId.value !== expectedChainId);
const chain = computed(() => chainInfo[expectedChainId] ?? { name: `Chain ${expectedChainId}`, explorer: "" });
const totalReleased = computed(() => allocations.value.reduce((sum, item) => sum + item.released, 0n));
const totalAllocated = computed(() => allocations.value.reduce((sum, item) => sum + item.amount, 0n));
const filteredAllocations = computed(() => {
    const now = Math.floor(Date.now() / 1000);
    return allocations.value.filter((item) => {
        if (filter.value === "mine")
            return item.beneficiary.toLowerCase() === account.value.toLowerCase();
        if (filter.value === "active")
            return !item.revokedAt && now < item.end;
        if (filter.value === "complete")
            return !!item.revokedAt || now >= item.end;
        return true;
    });
});
function shortAddress(value) {
    return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";
}
function formatToken(value, compact = false) {
    const numeric = Number(formatUnits(value, decimals.value));
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: compact ? 0 : 4,
        notation: compact ? "compact" : "standard",
    }).format(numeric);
}
function formatDate(timestamp) {
    if (!timestamp)
        return "Not set";
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(timestamp * 1000);
}
function progress(item) {
    if (item.amount === 0n)
        return 0;
    return Math.min(100, Number((item.vested * 10000n) / item.amount) / 100);
}
function status(item) {
    const now = Math.floor(Date.now() / 1000);
    if (item.revokedAt)
        return "Revoked";
    if (now < item.cliff)
        return "Cliff";
    if (now >= item.end)
        return "Vested";
    return "Vesting";
}
async function loadAllocations() {
    error.value = "";
    if (!configured.value) {
        loading.value = false;
        return;
    }
    loading.value = true;
    try {
        readProvider = new JsonRpcProvider(rpcUrl, expectedChainId, { staticNetwork: true });
        const lock = new Contract(lockAddress, lockAbi, readProvider);
        const [countValue, reservedValue, tokenValue, ownerValue] = await Promise.all([
            lock.allocationCount(),
            lock.totalReserved(),
            lock.token(),
            lock.owner(),
        ]);
        tokenAddress.value = tokenValue;
        owner.value = ownerValue;
        totalReserved.value = reservedValue;
        const token = new Contract(tokenValue, tokenAbi, readProvider);
        const [tokenSymbol, tokenDecimals] = await Promise.all([token.symbol(), token.decimals()]);
        symbol.value = tokenSymbol;
        decimals.value = Number(tokenDecimals);
        const now = BigInt(Math.floor(Date.now() / 1000));
        allocations.value = await Promise.all(Array.from({ length: Number(countValue) }, async (_, id) => {
            const [raw, vested, releasable] = await Promise.all([
                lock.allocations(id),
                lock.vestedAmount(id, now),
                lock.releasableAmount(id),
            ]);
            return {
                id,
                beneficiary: raw.beneficiary,
                tag: Number(raw.tag),
                amount: raw.amount,
                released: raw.released,
                vested,
                releasable,
                start: Number(raw.start),
                cliff: Number(raw.cliff),
                end: Number(raw.end),
                revokedAt: Number(raw.revokedAt),
            };
        }));
    }
    catch (cause) {
        error.value = cause instanceof Error ? cause.message : "Unable to read the lock contract.";
    }
    finally {
        loading.value = false;
    }
}
async function connectWallet() {
    if (!window.ethereum) {
        error.value = "No injected wallet was found. Install a browser wallet to continue.";
        return;
    }
    connecting.value = true;
    error.value = "";
    try {
        ethereum = window.ethereum;
        walletProvider = new BrowserProvider(ethereum);
        await walletProvider.send("eth_requestAccounts", []);
        const signer = await walletProvider.getSigner();
        account.value = await signer.getAddress();
        walletChainId.value = Number((await walletProvider.getNetwork()).chainId);
        ethereum.on?.("accountsChanged", handleAccountsChanged);
        ethereum.on?.("chainChanged", handleChainChanged);
    }
    catch (cause) {
        error.value = cause instanceof Error ? cause.message : "Wallet connection was cancelled.";
    }
    finally {
        connecting.value = false;
    }
}
function disconnectWallet() {
    account.value = "";
    walletChainId.value = undefined;
    ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
    ethereum?.removeListener?.("chainChanged", handleChainChanged);
}
function handleAccountsChanged(accounts) {
    account.value = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : "";
}
function handleChainChanged(chainId) {
    walletChainId.value = Number(BigInt(String(chainId)));
}
async function switchNetwork() {
    if (!walletProvider)
        return;
    try {
        await walletProvider.send("wallet_switchEthereumChain", [
            { chainId: `0x${expectedChainId.toString(16)}` },
        ]);
    }
    catch (cause) {
        error.value = cause instanceof Error ? cause.message : "Network switch failed.";
    }
}
async function write(action, operation) {
    if (!walletProvider || wrongNetwork.value)
        return;
    txPending.value = action;
    error.value = "";
    notice.value = "Confirm the transaction in your wallet.";
    try {
        const lock = new Contract(lockAddress, lockAbi, await walletProvider.getSigner());
        const transaction = (await operation(lock));
        notice.value = "Transaction submitted. Waiting for confirmation.";
        await transaction.wait();
        notice.value = "Transaction confirmed.";
        await loadAllocations();
    }
    catch (cause) {
        notice.value = "";
        error.value = cause instanceof Error ? cause.message : "Transaction failed.";
    }
    finally {
        txPending.value = "";
    }
}
async function release(id) {
    await write(`release-${id}`, (lock) => lock.release(id));
}
async function revoke(id) {
    await write(`revoke-${id}`, (lock) => lock.revoke(id));
}
function toTimestamp(value) {
    const result = Math.floor(new Date(value).getTime() / 1000);
    if (!Number.isFinite(result))
        throw new Error("Enter all schedule dates.");
    return result;
}
async function createAllocation() {
    if (!walletProvider)
        return;
    try {
        if (!isAddress(form.value.beneficiary))
            throw new Error("Enter a valid beneficiary address.");
        const amount = parseUnits(form.value.amount, decimals.value);
        const start = toTimestamp(form.value.start);
        const cliff = toTimestamp(form.value.cliff);
        const end = toTimestamp(form.value.end);
        if (amount <= 0n)
            throw new Error("Amount must be greater than zero.");
        if (cliff < start || end <= start || cliff > end)
            throw new Error("The vesting schedule is invalid.");
        txPending.value = "create";
        error.value = "";
        const signer = await walletProvider.getSigner();
        const token = new Contract(tokenAddress.value, tokenAbi, signer);
        const allowance = await token.allowance(account.value, lockAddress);
        if (allowance < amount) {
            notice.value = `Approve ${symbol.value} funding in your wallet.`;
            const approval = await token.approve(lockAddress, amount);
            await approval.wait();
        }
        notice.value = "Create the funded allocation in your wallet.";
        const lock = new Contract(lockAddress, lockAbi, signer);
        const transaction = await lock.createAllocation(getAddress(form.value.beneficiary), form.value.tag, amount, start, cliff, end);
        notice.value = "Allocation submitted. Waiting for confirmation.";
        await transaction.wait();
        notice.value = "Allocation created and funded.";
        createOpen.value = false;
        form.value = { beneficiary: "", tag: 0, amount: "", start: "", cliff: "", end: "" };
        await loadAllocations();
    }
    catch (cause) {
        notice.value = "";
        error.value = cause instanceof Error ? cause.message : "Allocation creation failed.";
    }
    finally {
        txPending.value = "";
    }
}
onMounted(loadAllocations);
onBeforeUnmount(disconnectWallet);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
    ...{ class: "brand" },
    href: "#",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "brand-mark" },
});
const __VLS_0 = {}.LockKeyhole;
/** @type {[typeof __VLS_components.LockKeyhole, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    size: (18),
}));
const __VLS_2 = __VLS_1({
    size: (18),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "network" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "live-dot" },
});
(__VLS_ctx.chain.name);
if (!__VLS_ctx.account) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.connectWallet) },
        ...{ class: "button button-dark" },
        disabled: (__VLS_ctx.connecting),
    });
    if (__VLS_ctx.connecting) {
        const __VLS_4 = {}.LoaderCircle;
        /** @type {[typeof __VLS_components.LoaderCircle, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            ...{ class: "spin" },
            size: (17),
        }));
        const __VLS_6 = __VLS_5({
            ...{ class: "spin" },
            size: (17),
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    }
    else {
        const __VLS_8 = {}.Wallet;
        /** @type {[typeof __VLS_components.Wallet, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            size: (17),
        }));
        const __VLS_10 = __VLS_9({
            size: (17),
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "wallet-pill" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.shortAddress(__VLS_ctx.account));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.disconnectWallet) },
        title: "Disconnect wallet",
    });
    const __VLS_12 = {}.Unplug;
    /** @type {[typeof __VLS_components.Unplug, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        size: (16),
    }));
    const __VLS_14 = __VLS_13({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({});
if (!__VLS_ctx.configured) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "config-state" },
    });
    const __VLS_16 = {}.CircleAlert;
    /** @type {[typeof __VLS_components.CircleAlert, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        size: (28),
    }));
    const __VLS_18 = __VLS_17({
        size: (28),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "hero" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "hero-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hero-actions" },
    });
    if (__VLS_ctx.isOwner) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.configured))
                        return;
                    if (!(__VLS_ctx.isOwner))
                        return;
                    __VLS_ctx.createOpen = true;
                } },
            ...{ class: "button button-accent" },
        });
        const __VLS_20 = {}.Plus;
        /** @type {[typeof __VLS_components.Plus, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            size: (18),
        }));
        const __VLS_22 = __VLS_21({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    }
    if (__VLS_ctx.chain.explorer) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            ...{ class: "text-link" },
            href: (`${__VLS_ctx.chain.explorer}/address/${__VLS_ctx.lockAddress}`),
            target: "_blank",
        });
        const __VLS_24 = {}.ExternalLink;
        /** @type {[typeof __VLS_components.ExternalLink, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            size: (14),
        }));
        const __VLS_26 = __VLS_25({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    }
    if (__VLS_ctx.wrongNetwork) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "network-warning" },
        });
        const __VLS_28 = {}.CircleAlert;
        /** @type {[typeof __VLS_components.CircleAlert, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            size: (18),
        }));
        const __VLS_30 = __VLS_29({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.switchNetwork) },
        });
        (__VLS_ctx.chain.name);
    }
    if (__VLS_ctx.error || __VLS_ctx.notice) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "messages" },
        });
        if (__VLS_ctx.error) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "message error" },
            });
            const __VLS_32 = {}.CircleAlert;
            /** @type {[typeof __VLS_components.CircleAlert, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
                size: (17),
            }));
            const __VLS_34 = __VLS_33({
                size: (17),
            }, ...__VLS_functionalComponentArgsRest(__VLS_33));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.error);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.configured))
                            return;
                        if (!(__VLS_ctx.error || __VLS_ctx.notice))
                            return;
                        if (!(__VLS_ctx.error))
                            return;
                        __VLS_ctx.error = '';
                    } },
                title: "Dismiss",
            });
            const __VLS_36 = {}.X;
            /** @type {[typeof __VLS_components.X, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                size: (15),
            }));
            const __VLS_38 = __VLS_37({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        }
        if (__VLS_ctx.notice) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "message notice" },
            });
            const __VLS_40 = {}.Check;
            /** @type {[typeof __VLS_components.Check, ]} */ ;
            // @ts-ignore
            const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
                size: (17),
            }));
            const __VLS_42 = __VLS_41({
                size: (17),
            }, ...__VLS_functionalComponentArgsRest(__VLS_41));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.notice);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.configured))
                            return;
                        if (!(__VLS_ctx.error || __VLS_ctx.notice))
                            return;
                        if (!(__VLS_ctx.notice))
                            return;
                        __VLS_ctx.notice = '';
                    } },
                title: "Dismiss",
            });
            const __VLS_44 = {}.X;
            /** @type {[typeof __VLS_components.X, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                size: (15),
            }));
            const __VLS_46 = __VLS_45({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "metrics" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.formatToken(__VLS_ctx.totalReserved, true));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.symbol);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.formatToken(__VLS_ctx.totalAllocated, true));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.symbol);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.formatToken(__VLS_ctx.totalReleased, true));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.symbol);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.allocations.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "ledger" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-tools" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "segments" },
    });
    for (const [option] of __VLS_getVForSourceType(['all', 'mine', 'active', 'complete'])) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.configured))
                        return;
                    __VLS_ctx.filter = option;
                } },
            key: (option),
            ...{ class: ({ active: __VLS_ctx.filter === option }) },
            disabled: (option === 'mine' && !__VLS_ctx.account),
        });
        (option);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadAllocations) },
        ...{ class: "icon-button" },
        title: "Refresh allocations",
        disabled: (__VLS_ctx.loading),
    });
    const __VLS_48 = {}.RefreshCw;
    /** @type {[typeof __VLS_components.RefreshCw, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        ...{ class: ({ spin: __VLS_ctx.loading }) },
        size: (17),
    }));
    const __VLS_50 = __VLS_49({
        ...{ class: ({ spin: __VLS_ctx.loading }) },
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    if (__VLS_ctx.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-state" },
        });
        const __VLS_52 = {}.LoaderCircle;
        /** @type {[typeof __VLS_components.LoaderCircle, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            ...{ class: "spin" },
            size: (24),
        }));
        const __VLS_54 = __VLS_53({
            ...{ class: "spin" },
            size: (24),
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    }
    else if (!__VLS_ctx.filteredAllocations.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-state" },
        });
        const __VLS_56 = {}.ShieldCheck;
        /** @type {[typeof __VLS_components.ShieldCheck, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            size: (25),
        }));
        const __VLS_58 = __VLS_57({
            size: (25),
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "allocation-list" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.filteredAllocations))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (item.id),
                ...{ class: "allocation" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "allocation-id" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (String(item.id).padStart(3, '0'));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "status" },
                'data-status': (__VLS_ctx.status(item)),
            });
            (__VLS_ctx.status(item));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "allocation-tag" },
            });
            (__VLS_ctx.allocationTags[item.tag]);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "beneficiary" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.shortAddress(item.beneficiary));
            if (__VLS_ctx.chain.explorer) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
                    href: (`${__VLS_ctx.chain.explorer}/address/${item.beneficiary}`),
                    target: "_blank",
                });
                const __VLS_60 = {}.ExternalLink;
                /** @type {[typeof __VLS_components.ExternalLink, ]} */ ;
                // @ts-ignore
                const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                    size: (13),
                }));
                const __VLS_62 = __VLS_61({
                    size: (13),
                }, ...__VLS_functionalComponentArgsRest(__VLS_61));
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "amount" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.formatToken(item.amount));
            (__VLS_ctx.symbol);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "timeline" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "progress-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.progress(item).toFixed(1));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.formatToken(item.released));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "progress-track" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: ({ width: `${__VLS_ctx.progress(item)}%` }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dates" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.formatDate(item.start));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.formatDate(item.cliff));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.revokedAt ? `Revoked ${__VLS_ctx.formatDate(item.revokedAt)}` : __VLS_ctx.formatDate(item.end));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "available" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.formatToken(item.releasable));
            (__VLS_ctx.symbol);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "row-actions" },
            });
            if (__VLS_ctx.account.toLowerCase() === item.beneficiary.toLowerCase() && item.releasable > 0n) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.configured))
                                return;
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(!__VLS_ctx.filteredAllocations.length))
                                return;
                            if (!(__VLS_ctx.account.toLowerCase() === item.beneficiary.toLowerCase() && item.releasable > 0n))
                                return;
                            __VLS_ctx.release(item.id);
                        } },
                    ...{ class: "icon-button action" },
                    title: "Release vested tokens",
                    disabled: (!!__VLS_ctx.txPending || __VLS_ctx.wrongNetwork),
                });
                if (__VLS_ctx.txPending === `release-${item.id}`) {
                    const __VLS_64 = {}.LoaderCircle;
                    /** @type {[typeof __VLS_components.LoaderCircle, ]} */ ;
                    // @ts-ignore
                    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
                        ...{ class: "spin" },
                        size: (17),
                    }));
                    const __VLS_66 = __VLS_65({
                        ...{ class: "spin" },
                        size: (17),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
                }
                else {
                    const __VLS_68 = {}.ArrowDownToLine;
                    /** @type {[typeof __VLS_components.ArrowDownToLine, ]} */ ;
                    // @ts-ignore
                    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                        size: (17),
                    }));
                    const __VLS_70 = __VLS_69({
                        size: (17),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
                }
            }
            if (__VLS_ctx.isOwner && !item.revokedAt && __VLS_ctx.progress(item) < 100) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.configured))
                                return;
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(!__VLS_ctx.filteredAllocations.length))
                                return;
                            if (!(__VLS_ctx.isOwner && !item.revokedAt && __VLS_ctx.progress(item) < 100))
                                return;
                            __VLS_ctx.revoke(item.id);
                        } },
                    ...{ class: "revoke" },
                    disabled: (!!__VLS_ctx.txPending || __VLS_ctx.wrongNetwork),
                });
            }
            if (!__VLS_ctx.account) {
                const __VLS_72 = {}.ChevronRight;
                /** @type {[typeof __VLS_components.ChevronRight, ]} */ ;
                // @ts-ignore
                const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                    size: (18),
                }));
                const __VLS_74 = __VLS_73({
                    size: (18),
                }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            }
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.shortAddress(__VLS_ctx.lockAddress));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.shortAddress(__VLS_ctx.owner));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.chain.name);
}
if (__VLS_ctx.createOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.createOpen))
                    return;
                __VLS_ctx.createOpen = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "modal" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "allocation-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "modal-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "allocation-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.createOpen))
                    return;
                __VLS_ctx.createOpen = false;
            } },
        ...{ class: "icon-button" },
        title: "Close",
    });
    const __VLS_76 = {}.X;
    /** @type {[typeof __VLS_components.X, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        size: (18),
    }));
    const __VLS_78 = __VLS_77({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.createAllocation) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "full" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        required: true,
        placeholder: "0x...",
    });
    (__VLS_ctx.form.beneficiary);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "full" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.form.tag),
        required: true,
    });
    for (const [tag, index] of __VLS_getVForSourceType((__VLS_ctx.allocationTags))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (tag),
            value: (index),
        });
        (tag);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "full" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.symbol);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        required: true,
        inputmode: "decimal",
        placeholder: "100,000",
    });
    (__VLS_ctx.form.amount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        required: true,
        type: "datetime-local",
    });
    (__VLS_ctx.form.start);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        required: true,
        type: "datetime-local",
    });
    (__VLS_ctx.form.cliff);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "full" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        required: true,
        type: "datetime-local",
    });
    (__VLS_ctx.form.end);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "funding-note" },
    });
    const __VLS_80 = {}.Clock3;
    /** @type {[typeof __VLS_components.Clock3, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        size: (17),
    }));
    const __VLS_82 = __VLS_81({
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "button button-accent submit" },
        disabled: (!!__VLS_ctx.txPending || __VLS_ctx.wrongNetwork),
    });
    if (__VLS_ctx.txPending === 'create') {
        const __VLS_84 = {}.LoaderCircle;
        /** @type {[typeof __VLS_components.LoaderCircle, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            ...{ class: "spin" },
            size: (18),
        }));
        const __VLS_86 = __VLS_85({
            ...{ class: "spin" },
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    }
    else {
        const __VLS_88 = {}.Plus;
        /** @type {[typeof __VLS_components.Plus, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            size: (18),
        }));
        const __VLS_90 = __VLS_89({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    }
}
/** @type {__VLS_StyleScopedClasses['shell']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['network']} */ ;
/** @type {__VLS_StyleScopedClasses['live-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button-dark']} */ ;
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
/** @type {__VLS_StyleScopedClasses['wallet-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['config-state']} */ ;
/** @type {__VLS_StyleScopedClasses['hero']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['text-link']} */ ;
/** @type {__VLS_StyleScopedClasses['network-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['messages']} */ ;
/** @type {__VLS_StyleScopedClasses['message']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['message']} */ ;
/** @type {__VLS_StyleScopedClasses['notice']} */ ;
/** @type {__VLS_StyleScopedClasses['metrics']} */ ;
/** @type {__VLS_StyleScopedClasses['ledger']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['section-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['segments']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['allocation-list']} */ ;
/** @type {__VLS_StyleScopedClasses['allocation']} */ ;
/** @type {__VLS_StyleScopedClasses['allocation-id']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['allocation-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['beneficiary']} */ ;
/** @type {__VLS_StyleScopedClasses['amount']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-label']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-track']} */ ;
/** @type {__VLS_StyleScopedClasses['dates']} */ ;
/** @type {__VLS_StyleScopedClasses['available']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['action']} */ ;
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
/** @type {__VLS_StyleScopedClasses['revoke']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-head']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['full']} */ ;
/** @type {__VLS_StyleScopedClasses['full']} */ ;
/** @type {__VLS_StyleScopedClasses['full']} */ ;
/** @type {__VLS_StyleScopedClasses['full']} */ ;
/** @type {__VLS_StyleScopedClasses['funding-note']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['submit']} */ ;
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDownToLine: ArrowDownToLine,
            Check: Check,
            ChevronRight: ChevronRight,
            CircleAlert: CircleAlert,
            Clock3: Clock3,
            ExternalLink: ExternalLink,
            LoaderCircle: LoaderCircle,
            LockKeyhole: LockKeyhole,
            Plus: Plus,
            RefreshCw: RefreshCw,
            ShieldCheck: ShieldCheck,
            Unplug: Unplug,
            Wallet: Wallet,
            X: X,
            allocationTags: allocationTags,
            lockAddress: lockAddress,
            account: account,
            owner: owner,
            symbol: symbol,
            totalReserved: totalReserved,
            allocations: allocations,
            loading: loading,
            connecting: connecting,
            txPending: txPending,
            error: error,
            notice: notice,
            filter: filter,
            createOpen: createOpen,
            form: form,
            configured: configured,
            isOwner: isOwner,
            wrongNetwork: wrongNetwork,
            chain: chain,
            totalReleased: totalReleased,
            totalAllocated: totalAllocated,
            filteredAllocations: filteredAllocations,
            shortAddress: shortAddress,
            formatToken: formatToken,
            formatDate: formatDate,
            progress: progress,
            status: status,
            loadAllocations: loadAllocations,
            connectWallet: connectWallet,
            disconnectWallet: disconnectWallet,
            switchNetwork: switchNetwork,
            release: release,
            revoke: revoke,
            createAllocation: createAllocation,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
