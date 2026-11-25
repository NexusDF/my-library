<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCollectionsStore } from '@/stores/collections'
import { useLibraryStore } from '@/stores/library'

const props = defineProps<{
  open: boolean
  collectionBookIds: readonly string[]
}>()

const emit = defineEmits<{
  close: []
}>()

const route = useRoute()
const collectionsStore = useCollectionsStore()
const libraryStore = useLibraryStore()

const panelRef = ref<HTMLElement | null>(null)
const selected = ref<string[]>([])
const saving = ref(false)
const error = ref('')
const broken = ref<Record<string, boolean>>({})

let previousOverflow = ''

const collectionId = computed(() => {
  const raw = route.params.id
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
})

const available = computed(() => {
  const taken = new Set(props.collectionBookIds)
  return libraryStore.books
    .filter((book) => !taken.has(book.id))
    .map((book) => {
      const cover = book.coverId ? libraryStore.coverUrl(book.coverId) : null
      const author = book.author?.trim()
      return {
        id: book.id,
        title: book.title,
        author: author ? author : 'Автор не указан',
        letter: initial(book.title),
        cover: cover || null,
      }
    })
    .sort((left, right) => left.title.localeCompare(right.title, 'ru'))
})

watch(
  () => props.open,
  async (isOpen, wasOpen) => {
    if (isOpen) {
      selected.value = []
      error.value = ''
      broken.value = {}
      if (!wasOpen) {
        previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
      }
      await nextTick()
      panelRef.value?.focus()
      return
    }
    if (wasOpen) document.body.style.overflow = previousOverflow
  },
)

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab' || !panelRef.value) return
  const focusable = panelRef.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
  )
  const items = [...focusable]
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

window.addEventListener('keydown', onKeydown)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (props.open) document.body.style.overflow = previousOverflow
})

function isBroken(id: string): boolean {
  return broken.value[id] === true
}

function hideCover(id: string) {
  broken.value = { ...broken.value, [id]: true }
}

function close() {
  if (saving.value) return
  emit('close')
}

async function submit() {
  if (saving.value || selected.value.length === 0) return
  const id = collectionId.value
  if (!id) {
    error.value = 'Коллекция не найдена'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await collectionsStore.addBooks(id, selected.value.slice())
    emit('close')
  } catch (caught) {
    error.value = messageOf(caught, 'Не удалось добавить книги')
  } finally {
    saving.value = false
  }
}

function initial(value: string | null | undefined): string {
  const first = Array.from(value?.trim() ?? '')[0]
  return first ? first.toLocaleUpperCase('ru') : '?'
}

function messageOf(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message.trim()) return caught.message.trim()
  return fallback
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-root">
      <div class="backdrop" @click="close"></div>
      <div
        ref="panelRef"
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-books-title"
        tabindex="-1"
        :aria-busy="saving"
      >
        <div class="handle" aria-hidden="true"></div>
        <header class="sheet-head">
          <h2 id="add-books-title">Добавить книги</h2>
          <button type="button" class="text-btn" :disabled="saving" @click="close">Закрыть</button>
        </header>

        <div class="sheet-body">
          <p v-if="!libraryStore.ready" class="hint" role="status">Загрузка...</p>
          <p v-else-if="libraryStore.books.length === 0" class="hint">В библиотеке пока нет книг.</p>
          <p v-else-if="available.length === 0" class="hint">Все книги уже в коллекции.</p>
          <ul v-else class="options">
            <li v-for="book in available" :key="book.id">
              <label class="option">
                <input v-model="selected" type="checkbox" :value="book.id" :disabled="saving" />
                <span class="thumb">
                  <img
                    v-if="book.cover && !isBroken(book.id)"
                    :src="book.cover"
                    alt=""
                    draggable="false"
                    @error="hideCover(book.id)"
                  />
                  <span v-else class="letter">{{ book.letter }}</span>
                </span>
                <span class="copy">
                  <span class="name">{{ book.title }}</span>
                  <span class="author">{{ book.author }}</span>
                </span>
              </label>
            </li>
          </ul>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        </div>

        <footer class="sheet-foot">
          <button
            type="button"
            class="btn primary"
            :disabled="selected.length === 0 || saving"
            @click="submit"
          >
            Добавить
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-root {
  --c-elevated: var(--bg-elevated, #1c1b22);
  --c-soft: var(--bg-soft, #2a2933);
  --c-text: var(--text, #f3efe6);
  --c-muted: var(--text-muted, #9c978e);
  --c-accent: var(--accent, #c4b4e4);
  --c-ink: var(--accent-ink, #1b1524);
  --c-line: var(--line, rgba(243, 239, 230, 0.12));
  --c-danger: var(--danger, #e39494);
  --c-radius: var(--radius, 12px);

  position: fixed;
  z-index: 80;
  inset: 0;
  color: var(--c-text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.sheet-root *,
.sheet-root *::before,
.sheet-root *::after {
  box-sizing: border-box;
}

.backdrop {
  position: absolute;
  inset: 0;
  background: rgba(8, 8, 12, 0.62);
  animation: fade 160ms ease;
}

.sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  max-height: min(85dvh, 720px);
  flex-direction: column;
  border: 1px solid var(--c-line);
  border-bottom: 0;
  border-radius: 16px 16px 0 0;
  background: var(--c-elevated);
  animation: fade 180ms ease;
}

.sheet:focus {
  outline: none;
}

.handle {
  width: 36px;
  height: 4px;
  margin: 8px auto 0;
  border-radius: 999px;
  background: var(--c-line);
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px 12px;
}

.sheet-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.sheet-body {
  overflow: auto;
  min-height: 0;
  padding: 0 16px 12px;
  overscroll-behavior: contain;
}

.sheet-foot {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--c-line);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.option {
  display: grid;
  grid-template-columns: 22px 40px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
}

.option:has(input:checked) {
  border-color: var(--c-accent);
  background: color-mix(in srgb, var(--c-accent) 16%, transparent);
}

.option input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--c-accent);
}

.thumb {
  width: 40px;
  height: 54px;
  overflow: hidden;
  border-radius: 6px;
  background: var(--c-soft);
  box-shadow: inset 0 0 0 1px var(--c-line);
}

.thumb img,
.letter {
  display: block;
  width: 100%;
  height: 100%;
}

.thumb img {
  object-fit: cover;
}

.letter {
  display: grid;
  place-items: center;
  background: var(--c-soft);
  background: color-mix(in srgb, var(--c-accent) 26%, var(--c-soft));
  font-size: 16px;
  font-weight: 600;
}

.copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.name,
.author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  font-size: 15px;
  font-weight: 600;
}

.author,
.hint {
  color: var(--c-muted);
  font-size: 13px;
}

.hint {
  margin: 8px 0 16px;
  line-height: 1.45;
}

.form-error {
  margin: 12px 0 0;
  color: var(--c-danger);
  font-size: 14px;
}

.text-btn,
.btn {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.text-btn {
  min-height: 44px;
  padding: 0 2px;
  color: var(--c-accent);
  font-size: 15px;
  font-weight: 600;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
}

.btn.primary {
  background: var(--c-accent);
  color: var(--c-ink);
}

.btn:disabled,
.text-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:focus-visible,
.text-btn:focus-visible,
.option input:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}

@media (min-width: 720px) {
  .sheet {
    top: 50%;
    right: auto;
    bottom: auto;
    left: 50%;
    width: min(440px, calc(100vw - 32px));
    transform: translate(-50%, -50%);
    border-bottom: 1px solid var(--c-line);
    border-radius: var(--c-radius);
    max-height: min(720px, calc(100dvh - 48px));
  }

  .handle {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .sheet {
    animation: none;
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
