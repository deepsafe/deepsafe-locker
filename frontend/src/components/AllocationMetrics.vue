<script setup lang="ts">
defineProps<{
  reserved: string;
  allocated: string;
  released: string;
  count: number;
  symbol: string;
}>();
</script>

<template>
  <section class="metrics">
    <article><span>Reserved obligation</span><strong>{{ reserved }}</strong><small>{{ symbol }}</small></article>
    <article><span>Total allocated</span><strong>{{ allocated }}</strong><small>{{ symbol }}</small></article>
    <article><span>Released to date</span><strong>{{ released }}</strong><small>{{ symbol }}</small></article>
    <article><span>Lock records</span><strong>{{ count }}</strong><small>allocations</small></article>
  </section>
</template>
