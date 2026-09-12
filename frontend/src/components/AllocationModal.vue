<script setup lang="ts">
import { Clock3, LoaderCircle, Plus, X } from "lucide-vue-next";
import type { AllocationForm } from "../types";

const props = defineProps<{
  modelValue: AllocationForm;
  symbol: string;
  pending: boolean;
  wrongNetwork: boolean;
  tagOptions: readonly string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: AllocationForm];
  close: [];
  submit: [];
}>();

function updateField(field: keyof AllocationForm, value: string | number) {
  emit("update:modelValue", { ...props.modelValue, [field]: value });
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="allocation-title">
      <div class="modal-head"><div><p class="eyebrow">OWNER ACTION</p><h2 id="allocation-title">Fund a new allocation</h2></div><button class="icon-button" title="Close" @click="emit('close')"><X :size="18" /></button></div>
      <form @submit.prevent="emit('submit')">
        <label class="full"><span>Beneficiary address</span><input :value="modelValue.beneficiary" @input="updateField('beneficiary', ($event.target as HTMLInputElement).value.trim())" required placeholder="0x..." /></label>
        <label class="full"><span>Allocation tag</span><select :value="modelValue.tag" @change="updateField('tag', Number(($event.target as HTMLSelectElement).value))" required><option v-for="(tag, index) in tagOptions" :key="tag" :value="index">{{ tag }}</option></select></label>
        <label class="full"><span>Amount ({{ symbol }})</span><input :value="modelValue.amount" @input="updateField('amount', ($event.target as HTMLInputElement).value.trim())" required inputmode="decimal" placeholder="100,000" /></label>
        <label><span>Vesting starts</span><input :value="modelValue.start" @input="updateField('start', ($event.target as HTMLInputElement).value)" required type="date" /></label>
        <label><span>Cliff date</span><input :value="modelValue.cliff" @input="updateField('cliff', ($event.target as HTMLInputElement).value)" required type="date" /></label>
        <label class="full"><span>Vesting ends</span><input :value="modelValue.end" @input="updateField('end', ($event.target as HTMLInputElement).value)" required type="date" /></label>
        <div class="funding-note"><Clock3 :size="17" /><span>The wallet will approve the exact funding amount first when allowance is insufficient.</span></div>
        <button class="button button-accent submit" :disabled="pending || wrongNetwork"><LoaderCircle v-if="pending" class="spin" :size="18" /><Plus v-else :size="18" />Approve & create allocation</button>
      </form>
    </section>
  </div>
</template>
