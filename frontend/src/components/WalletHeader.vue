<script setup lang="ts">
import { Check, LockKeyhole, Copy, LoaderCircle, Unplug, Wallet } from "lucide-vue-next";

defineProps<{
  account: string;
  chains: readonly { id: number; name: string }[];
  selectedChainId: number;
  networkDisabled: boolean;
  connecting: boolean;
  addressCopied: boolean;
  shortAddress: (value: string) => string;
}>();

const emit = defineEmits<{
  connect: [];
  copy: [];
  disconnect: [];
  selectChain: [id: number];
}>();
</script>

<template>
  <header class="topbar">
    <a class="brand" href="#"><span class="brand-mark"><LockKeyhole :size="18" /></span><span>DEF / LOCK DESK</span></a>
    <div class="network"><span class="live-dot"></span><select aria-label="Select chain" :value="selectedChainId" :disabled="networkDisabled" @change="emit('selectChain', Number(($event.target as HTMLSelectElement).value))"><option v-for="chain in chains" :key="chain.id" :value="chain.id">{{ chain.name }}</option></select></div>
    <button v-if="!account" class="button button-dark" :disabled="connecting" @click="emit('connect')">
      <LoaderCircle v-if="connecting" class="spin" :size="17" /><Wallet v-else :size="17" />Connect wallet
    </button>
    <div v-else class="wallet-pill">
      <span>{{ shortAddress(account) }}</span>
      <button :title="addressCopied ? 'Address copied' : 'Copy wallet address'" :aria-label="addressCopied ? 'Address copied' : 'Copy wallet address'" @click="emit('copy')">
        <Check v-if="addressCopied" :size="16" />
        <Copy v-else :size="16" />
      </button>
      <button title="Disconnect wallet" aria-label="Disconnect wallet" @click="emit('disconnect')"><Unplug :size="16" /></button>
    </div>
  </header>
</template>

<style scoped>
.network select { max-width: 180px; padding: 8px 4px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.network select:disabled { cursor: wait; opacity: 0.6; }
</style>
