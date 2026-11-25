<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import MiniPlayer from '@/components/MiniPlayer.vue'
import BottomNav from '@/components/BottomNav.vue'
import { useBookmarkStore } from '@/stores/bookmarks'
import { useCollectionsStore } from '@/stores/collections'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'

const route = useRoute()
const settingsStore = useSettingsStore()
const libraryStore = useLibraryStore()
const collectionsStore = useCollectionsStore()
const bookmarkStore = useBookmarkStore()
const statsStore = useStatsStore()
const player = usePlayerStore()

const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
const bootError = ref('')

provide('bootError', bootError)

const isPlayer = computed(() => route.name === 'player')
const showMini = computed(() => player.bookId != null && !isPlayer.value)

function applyTheme() {
  const preference = settingsStore.settings.theme
  let resolved: 'light' | 'dark'
  if (preference === 'light') resolved = 'light'
  else if (preference === 'dark') resolved = 'dark'
  else resolved = colorScheme.matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#16161c' : '#f3eee6')
}

function onSchemeChange() {
  if (settingsStore.settings.theme === 'system') applyTheme()
}

watch(() => settingsStore.settings.theme, applyTheme, { immediate: true })

onMounted(() => {
  colorScheme.addEventListener('change', onSchemeChange)
  void Promise.all([
    settingsStore.hydrate(),
    libraryStore.hydrate(),
    collectionsStore.hydrate(),
    statsStore.hydrate(),
    bookmarkStore.hydrate(),
  ])
    .then(() => {
      bootError.value = ''
    })
    .catch((error: unknown) => {
      bootError.value =
        error instanceof Error && error.message ? error.message : 'Не удалось открыть библиотеку'
    })
    .finally(applyTheme)
})

onUnmounted(() => {
  colorScheme.removeEventListener('change', onSchemeChange)
})
</script>

<template>
  <div class="shell" :class="{ 'shell--mini': showMini, 'shell--player': isPlayer }">
    <p v-if="bootError" class="boot-error" role="alert">{{ bootError }}</p>
    <RouterView />
    <MiniPlayer />
    <BottomNav v-if="!isPlayer" />
  </div>
</template>

<style scoped>
.shell {
  min-width: 0;
  min-height: 100dvh;
  overflow-x: clip;
  padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
}

.shell--mini {
  padding-bottom: calc(var(--nav-h) + var(--mini-h) + env(safe-area-inset-bottom));
}

.shell--player {
  padding-bottom: 0;
}

.boot-error {
  width: min(100%, 960px);
  margin: 0 auto;
  padding: 12px var(--space) 0;
  color: var(--danger);
}
</style>
