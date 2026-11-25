<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <header class="header">
    <div class="header__leading">
      <slot name="leading" />
      <h1 class="header__title">{{ title }}</h1>
    </div>
    <div v-if="$slots.default" class="header__actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: var(--header-h);
  padding: calc(10px + env(safe-area-inset-top)) var(--space) 10px;
  background: var(--bg);
}

.header__leading {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.header__title {
  margin: 0;
  overflow: hidden;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}
</style>
