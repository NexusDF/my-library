<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useId, watch } from 'vue'
import { bookProgress, bookStatus, bookStatusLabel, type Book, type LibraryViewMode } from '@/types/library'
import { formatClock } from '@/utils/format'

const props = defineProps<{
  book: Book
  coverUrl: string | null
  layout: LibraryViewMode
}>()

const emit = defineEmits<{
  open: []
  edit: []
  delete: []
  reset: []
  collect: []
}>()

const menuOpen = ref(false)
const broken = ref(false)
const menuRoot = ref<HTMLElement | null>(null)
const menuButton = ref<HTMLButtonElement | null>(null)
const editButton = ref<HTMLButtonElement | null>(null)
const menuId = useId()

watch(
  () => props.coverUrl,
  () => {
    broken.value = false
  },
)

const authorLabel = computed(() => props.book.author.trim() || 'Автор не указан')

const letter = computed(() => {
  const char = props.book.title.trim().charAt(0)
  return char ? char.toLocaleUpperCase('ru') : '•'
})

const percent = computed(() => {
  const value = bookProgress(props.book)
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(100, Math.max(0, value)))
})

const statusLabel = computed(() => bookStatusLabel(bookStatus(props.book)))

const canReset = computed(() => props.book.position > 0 || props.book.lastPlayedAt != null)

const actionsLabel = computed(() =>
  props.book.title.trim() ? `Действия с книгой «${props.book.title.trim()}»` : 'Действия с книгой',
)

function onPointerDown(event: PointerEvent) {
  const root = menuRoot.value
  if (!root) return
  if (event.target instanceof Node && root.contains(event.target)) return
  menuOpen.value = false
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  menuOpen.value = false
  menuButton.value?.focus()
}

watch(menuOpen, async (open) => {
  if (open) {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    await nextTick()
    if (menuOpen.value) editButton.value?.focus()
    return
  }
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onEscape)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onEscape)
})

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (!(next instanceof Node)) return
  if (menuRoot.value?.contains(next)) return
  menuOpen.value = false
}

function choose(action: 'edit' | 'delete' | 'reset' | 'collect') {
  menuOpen.value = false
  if (action === 'edit') emit('edit')
  else if (action === 'delete') emit('delete')
  else if (action === 'reset') emit('reset')
  else emit('collect')
}
</script>

<template>
  <article class="card" :class="layout === 'list' ? 'card--list' : 'card--grid'">
    <button type="button" class="card__open" @click="emit('open')">
      <span class="cover">
        <img v-if="coverUrl && !broken" :src="coverUrl" alt="" @error="broken = true" />
        <span v-else class="monogram" aria-hidden="true">
          <span class="monogram__mark">{{ letter }}</span>
        </span>
        <span v-if="percent > 0" class="cover__progress" aria-hidden="true">
          <span class="cover__progress-fill" :style="{ width: `${percent}%` }" />
        </span>
      </span>
      <span class="card__text">
        <span class="card__title">{{ book.title }}</span>
        <span class="card__author">{{ authorLabel }}</span>
        <span class="card__meta">{{ statusLabel }} · {{ percent }}%</span>
        <span v-if="layout === 'list'" class="card__meta">{{ formatClock(book.duration) }}</span>
      </span>
    </button>

    <div ref="menuRoot" class="menu" @focusout="onFocusOut">
      <button
        ref="menuButton"
        type="button"
        class="menu__toggle"
        :aria-expanded="menuOpen"
        aria-haspopup="true"
        :aria-controls="menuId"
        :aria-label="actionsLabel"
        @click="menuOpen = !menuOpen"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="18" cy="12" r="1.4" />
        </svg>
      </button>
      <div v-if="menuOpen" :id="menuId" class="menu__panel">
        <button ref="editButton" type="button" @click="choose('edit')">Изменить</button>
        <button type="button" @click="choose('collect')">Добавить в коллекцию</button>
        <button type="button" :disabled="!canReset" @click="choose('reset')">Сбросить прогресс</button>
        <button type="button" class="menu__delete" @click="choose('delete')">Удалить</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  min-width: 0;
}

.card:has(.menu__panel) {
  z-index: 3;
}

.card__open {
  display: block;
  width: 100%;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}

.cover {
  position: relative;
  display: block;
  overflow: hidden;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-soft));
  border: 1px solid var(--line);
}

.cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.monogram {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 58%),
    color-mix(in srgb, var(--accent) 10%, var(--bg-soft));
}

.monogram__mark {
  display: grid;
  place-items: center;
  width: 42%;
  aspect-ratio: 1;
  font-weight: 650;
  letter-spacing: -0.03em;
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
  border: 1px solid var(--line);
  border-radius: 50%;
}

.cover__progress {
  position: absolute;
  right: 8px;
  bottom: 8px;
  left: 8px;
  height: 3px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  border-radius: 999px;
}

.cover__progress-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
}

.card__title,
.card__author,
.card__meta {
  display: block;
  overflow: hidden;
}

.card__title {
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.card__author,
.card__meta {
  color: var(--text-muted);
}

.card--grid .cover {
  aspect-ratio: 2 / 3;
  border-radius: 16px;
}

.card--grid .monogram__mark {
  font-size: 1.15rem;
}

.card--grid .card__text {
  display: block;
  padding-right: 4px;
}

.card--grid .card__title {
  display: -webkit-box;
  margin-top: 8px;
  font-size: 0.82rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card--grid .card__author {
  margin-top: 2px;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card--list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px;
  align-items: center;
  border-bottom: 1px solid var(--line);
}

.card--list .card__open {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 84px;
  padding: 10px 0;
}

.card--list .cover {
  width: 52px;
  height: 78px;
  border-radius: 8px;
}

.card--list .monogram__mark {
  width: 58%;
  font-size: 0.85rem;
}

.card--list .card__title {
  font-size: 0.98rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card--list .card__author,
.card--list .card__meta {
  margin-top: 2px;
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card--list .card__meta {
  font-variant-numeric: tabular-nums;
}

.menu {
  position: relative;
}

.card--grid .menu {
  position: absolute;
  top: 6px;
  right: 6px;
}

.menu__toggle {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  color: var(--text-muted);
  background: transparent;
  border: 0;
  border-radius: 50%;
}

.card--grid .menu__toggle {
  color: var(--text);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  border: 1px solid var(--line);
  backdrop-filter: blur(8px);
}

.card--list .menu__toggle {
  width: 44px;
  height: 44px;
}

.menu__panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  min-width: 220px;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.menu__panel button:disabled {
  opacity: 0.45;
}

.menu__panel button {
  min-height: 44px;
  padding: 0 12px;
  font: inherit;
  color: var(--text);
  text-align: left;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: 8px;
}

@media (hover: hover) {
  .menu__panel button:hover {
    background: var(--bg-soft);
  }
}

.menu__delete {
  color: var(--danger);
}
</style>
