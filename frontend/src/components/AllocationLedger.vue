<script setup lang="ts">
import {
  ArrowDownToLine,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-vue-next";
import type { Allocation, AllocationFilter } from "../types";
import { computed } from "vue";

const props = defineProps<{
  allocations: Allocation[];
  account: string;
  chainExplorer: string;
  symbol: string;
  loading: boolean;
  txPending: string;
  wrongNetwork: boolean;
  isOwner: boolean;
  formatToken: (value: bigint, compact?: boolean) => string;
  formatDate: (timestamp: number) => string;
  shortAddress: (value: string) => string;
  progress: (item: Allocation) => number;
  status: (item: Allocation) => string;
}>();

const filter = defineModel<AllocationFilter>({ default: "all" });
const emit = defineEmits<{
  refresh: [];
  release: [id: number];
  revoke: [id: number];
}>();

const allocationTags = [
  "Genesis Nodes", "Investors", "Team", "Airdrop (Locked)", "Ecosystem",
  "Marketing", "Liquidity Provider", "CEX Allocation", "Staking Rewards",
] as const;

const visibleAllocations = computed(() => {
  const now = Math.floor(Date.now() / 1000);
  return props.allocations.filter((item) => {
    if (filter.value === "mine") return item.beneficiary.toLowerCase() === props.account.toLowerCase();
    if (filter.value === "active") return !item.revokedAt && now < item.end;
    if (filter.value === "complete") return !!item.revokedAt || now >= item.end;
    return true;
  });
});
</script>

<template>
  <section class="ledger">
    <div class="section-head">
      <div><p class="eyebrow">ALLOCATION LEDGER</p><h2>Lock-up schedule</h2></div>
      <div class="section-tools">
        <div class="segments">
          <button v-for="option in ['all', 'mine', 'active', 'complete'] as const" :key="option" :class="{ active: filter === option }" :disabled="option === 'mine' && !account" @click="filter = option">{{ option }}</button>
        </div>
        <button class="icon-button" title="Refresh allocations" :disabled="loading" @click="emit('refresh')"><RefreshCw :class="{ spin: loading }" :size="17" /></button>
      </div>
    </div>

    <div v-if="loading" class="empty-state"><LoaderCircle class="spin" :size="24" />Reading contract state</div>
    <div v-else-if="!visibleAllocations.length" class="empty-state"><ShieldCheck :size="25" />No allocations in this view</div>
    <div v-else class="allocation-list">
      <article v-for="item in visibleAllocations" :key="item.id" class="allocation">
        <div class="allocation-id"><span>#{{ String(item.id).padStart(3, '0') }}</span><span class="status" :data-status="props.status(item)">{{ props.status(item) }}</span><span class="allocation-tag">{{ allocationTags[item.tag] }}</span></div>
        <div class="beneficiary"><span>Beneficiary</span><strong>{{ props.shortAddress(item.beneficiary) }}</strong><a v-if="chainExplorer" :href="`${chainExplorer}/address/${item.beneficiary}`" target="_blank"><ExternalLink :size="13" /></a></div>
        <div class="amount"><span>Allocation</span><strong>{{ props.formatToken(item.amount) }} {{ symbol }}</strong></div>
        <div class="timeline">
          <div class="progress-label"><span>{{ props.progress(item).toFixed(1) }}% vested</span><span>{{ props.formatToken(item.released) }} released</span></div>
          <div class="progress-track"><span :style="{ width: `${props.progress(item)}%` }"></span></div>
          <div class="dates"><span>{{ props.formatDate(item.start) }}</span><span>Cliff {{ props.formatDate(item.cliff) }}</span><span>{{ item.revokedAt ? `Revoked ${props.formatDate(item.revokedAt)}` : props.formatDate(item.end) }}</span></div>
        </div>
        <div class="available"><span>Available now</span><strong>{{ props.formatToken(item.releasable) }} {{ symbol }}</strong></div>
        <div class="row-actions">
          <button v-if="account.toLowerCase() === item.beneficiary.toLowerCase() && item.releasable > 0n" class="icon-button action" title="Release vested tokens" :disabled="!!txPending || wrongNetwork" @click="emit('release', item.id)"><LoaderCircle v-if="txPending === `release-${item.id}`" class="spin" :size="17" /><ArrowDownToLine v-else :size="17" /></button>
          <button v-if="isOwner && !item.revokedAt && props.progress(item) < 100" class="revoke" :disabled="!!txPending || wrongNetwork" @click="emit('revoke', item.id)">Revoke</button>
          <ChevronRight v-if="!account" :size="18" />
        </div>
      </article>
    </div>
  </section>
</template>
