<script setup lang="ts">
defineProps<{
  title: string
  text?: string
}>()
</script>

<template>
  <div class="empty">
    <h2 class="empty__title">{{ title }}</h2>
    <p v-if="text" class="empty__text">{{ text }}</p>
    <div v-if="$slots.default" class="empty__action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  padding: 36px 8px 12px;
  text-align: center;
}

.empty__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.empty__text {
  max-width: 28rem;
  margin: 8px auto 0;
  color: var(--text-muted);
}

.empty__action {
  margin-top: 16px;
}
</style>
