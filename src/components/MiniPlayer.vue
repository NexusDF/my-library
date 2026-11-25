<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const player = usePlayerStore()

const coverFailed = ref(false)

const visible = computed(() => player.bookId !== null && route.name !== 'player')

const book = computed(() => {
  const id = player.bookId
  if (!id) return undefined
  return library.books.find((item) => item.id === id) ?? library.getBook(id)
})

const title = computed(() => book.value?.title.trim() || 'Аудиокнига')

const cover = computed(() => (book.value ? library.coverUrl(book.value.coverId) : null))

const initial = computed(() => {
  const text = book.value?.title.trim() ?? ''
  return text ? text.slice(0, 1).toLocaleUpperCase('ru') : '•'
})

const progress = computed(() => {
  if (player.duration <= 0) return 0
  return Math.min(100, Math.max(0, (player.position / player.duration) * 100))
})

const toggleLabel = computed(() =>
  player.status === 'playing' ? 'Пауза' : 'Воспроизвести',
)

watch(cover, () => {
  coverFailed.value = false
})

function openPlayer() {
  const id = player.bookId
  if (!id) return
  void router.push({ name: 'player', params: { id } })
}
</script>

<template>
  <div v-if="visible" class="mini">
    <div class="bar">
    <button type="button" class="open" @click="openPlayer">
      <span class="cover">
        <img
          v-if="cover && !coverFailed"
          :src="cover"
          alt=""
          @error="coverFailed = true"
        />
        <span v-else class="mark" aria-hidden="true">{{ initial }}</span>
      </span>
      <span class="meta">
        <span class="title">{{ title }}</span>
        <span class="track" aria-hidden="true">
          <span class="fill" :style="{ width: `${progress}%` }"></span>
        </span>
      </span>
    </button>
    <button
      type="button"
      class="toggle"
      :aria-label="toggleLabel"
      @click="player.toggle()"
    >
      <svg v-if="player.status === 'playing'" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 5h3.2v14H6.5V5zm7.8 0H17.5v14h-3.2V5z" fill="currentColor" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.2 5.4v13.2L18.4 12 8.2 5.4z" fill="currentColor" />
      </svg>
    </button>
    </div>
  </div>
</template>

<style scoped>
.mini {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--nav-h, 64px) + env(safe-area-inset-bottom, 0px));
  z-index: 35;
  display: flex;
  justify-content: center;
  box-sizing: border-box;
  height: var(--mini-h, 72px);
  background: var(--bg-elevated, #1e1e26);
  border-top: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  color: var(--text, #f3efe7);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(100%, 960px);
  height: 100%;
  padding: 0 max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left));
}

.open {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.cover {
  display: grid;
  flex: none;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg, #14141a);
  color: var(--text-muted, #a39e96);
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mark {
  font-size: 1.05rem;
  font-weight: 600;
}

.meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  gap: 8px;
}

.title {
  overflow: hidden;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track {
  display: block;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--line, rgba(255, 255, 255, 0.08));
}

.fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent, #c4b5fd);
}

.toggle {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--accent, #c4b5fd);
  color: var(--accent-ink, var(--bg, #14141a));
  cursor: pointer;
}

.toggle svg {
  width: 22px;
  height: 22px;
}

.open:focus-visible,
.toggle:focus-visible {
  outline: 2px solid var(--accent, #c4b5fd);
  outline-offset: 2px;
}
</style>
