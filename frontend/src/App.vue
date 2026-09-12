<script setup lang="ts">
import { Check, CircleAlert, ExternalLink, Plus, X } from "lucide-vue-next";
import AllocationLedger from "./components/AllocationLedger.vue";
import AllocationMetrics from "./components/AllocationMetrics.vue";
import AllocationModal from "./components/AllocationModal.vue";
import WalletHeader from "./components/WalletHeader.vue";
import { useTokenLock } from "./composables/useTokenLock";
import { ref } from "vue";

const filter = ref<"all" | "mine" | "active" | "complete">("all");
const allocationTags = ["Genesis Nodes", "Investors", "Team", "Airdrop (Locked)", "Ecosystem", "Marketing", "Liquidity Provider", "CEX Allocation", "Staking Rewards"] as const;
const tokenLock = useTokenLock();
const { chains, selectedChainId, selectChain } = tokenLock;
const { lockAddress, account, owner, symbol, totalReserved, allocations, loading, connecting, addressCopied, txPending, error, notice, createOpen, form, configured, isOwner, wrongNetwork, chain, totalReleased, totalAllocated, loadAllocations, connectWallet, disconnectWallet, copyAccount, switchNetwork, release, revoke, createAllocation, shortAddress, formatToken, formatDate, progress, status } = tokenLock;
</script>

<template>
  <div class="shell">
    <WalletHeader :account="account" :chains="chains" :selected-chain-id="selectedChainId" :network-disabled="!!txPending || connecting" :connecting="connecting" :address-copied="addressCopied" :short-address="shortAddress" @select-chain="selectChain" @connect="connectWallet" @copy="copyAccount" @disconnect="disconnectWallet" />
    <main>
      <section v-if="!configured" class="config-state"><CircleAlert :size="28" /><div><strong>No deployment configured</strong><p>{{ chain.name }} has no configured lock contract.</p></div></section>
      <template v-else>
        <section class="hero"><div><p class="hero-copy">A direct view into funded DEF obligations, vesting progress, and beneficiary claims.</p></div><div class="hero-actions"><button v-if="isOwner" class="button button-accent" @click="createOpen = true"><Plus :size="18" />New allocation</button><a v-if="chain.explorer" class="text-link" :href="`${chain.explorer}/address/${lockAddress}`" target="_blank">View contract <ExternalLink :size="14" /></a></div></section>
        <section v-if="wrongNetwork" class="network-warning"><CircleAlert :size="18" /><span>Your wallet is on a different network.</span><button @click="switchNetwork">Switch to {{ chain.name }}</button></section>
        <section v-if="error || notice" class="messages"><div v-if="error" class="message error"><CircleAlert :size="17" /><span>{{ error }}</span><button title="Dismiss" aria-label="Dismiss error" @click="error = ''"><X :size="17" /></button></div><div v-if="notice" class="message notice"><Check :size="17" /><span>{{ notice }}</span><button title="Dismiss" aria-label="Dismiss notification" @click="notice = ''"><X :size="17" /></button></div></section>
        <AllocationMetrics :reserved="formatToken(totalReserved, true)" :allocated="formatToken(totalAllocated, true)" :released="formatToken(totalReleased, true)" :count="allocations.length" :symbol="symbol" />
        <AllocationLedger v-model="filter" :allocations="allocations" :account="account" :chain-explorer="chain.explorer" :symbol="symbol" :loading="loading" :tx-pending="txPending" :wrong-network="wrongNetwork" :is-owner="isOwner" :format-token="formatToken" :format-date="formatDate" :short-address="shortAddress" :progress="progress" :status="status" @refresh="loadAllocations" @release="release" @revoke="revoke" />
        <footer><span>Contract {{ shortAddress(lockAddress) }}</span><span>Owner {{ shortAddress(owner) }}</span><span>Data read directly from {{ chain.name }}</span></footer>
      </template>
    </main>
    <AllocationModal v-if="createOpen" v-model="form" :symbol="symbol" :pending="txPending === 'create'" :wrong-network="wrongNetwork" :tag-options="allocationTags" @close="createOpen = false" @submit="createAllocation" />
  </div>
</template>
