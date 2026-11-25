<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import BackupPanel from '@/components/BackupPanel.vue'
import BookCard from '@/components/BookCard.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ContinueListening from '@/components/ContinueListening.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useCollectionsStore } from '@/stores/collections'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import {
  bookProgress,
  bookStatus,
  type Book,
  type LibraryFilter,
  type LibrarySort,
  type LibraryViewMode,
  type Settings,
} from '@/types/library'

const router = useRouter()
const library = useLibraryStore()
const collections = useCollectionsStore()
const settingsStore = useSettingsStore()
const player = usePlayerStore()

const bootError = inject<Ref<string>>('bootError', ref(''))
const search = ref('')
const importNotice = ref('')
const actionError = ref('')
const deleteId = ref<string | null>(null)
const resetId = ref<string | null>(null)
const collectId = ref<string | null>(null)
const collectPick = ref<string[]>([])
const collecting = ref(false)
const deleting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const filters: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'unread', label: 'Не начатые' },
  { value: 'inProgress', label: 'В процессе' },
  { value: 'finished', label: 'Готовые' },
]

const sorts: { value: LibrarySort; label: string }[] = [
  { value: 'title', label: 'По названию' },
  { value: 'author', label: 'По автору' },
  { value: 'added', label: 'По дате добавления' },
  { value: 'lastPlayed', label: 'По последнему прослушиванию' },
]

const layout = computed(() => settingsStore.settings.libraryView)
const sort = computed(() => settingsStore.settings.librarySort)
const filter = computed(() => settingsStore.settings.libraryFilter)

const importLabel = computed(() => {
  const progress = library.importProgress
  if (!library.importing || !progress) return ''
  return `Добавляем «${progress.fileName}» — ${progress.current} из ${progress.total}`
})

const coverUrls = computed(() => {
  const map = new Map<string, string | null>()
  for (const book of library.books) {
    map.set(book.id, book.coverId ? library.coverUrl(book.coverId) || null : null)
  }
  return map
})

const continueBook = computed((): Book | null => {
  const started = library.books.filter((book) => book.position > 0 && book.lastPlayedAt != null)
  const unfinished = started.filter((book) => bookStatus(book) !== 'finished')
  const pool = unfinished.length > 0 ? unfinished : started
  let best: Book | null = null
  let bestAt = -Infinity
  for (const book of pool) {
    if (book.lastPlayedAt != null && book.lastPlayedAt > bestAt) {
      best = book
      bestAt = book.lastPlayedAt
    }
  }
  return best
})

const continueHeading = computed(() =>
  continueBook.value && bookStatus(continueBook.value) === 'finished'
    ? 'Недавно прослушивали'
    : 'Продолжить прослушивание',
)

const continueAgain = computed(() =>
  continueBook.value ? bookStatus(continueBook.value) === 'finished' : false,
)

const visibleBooks = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('ru')
  const currentFilter = filter.value
  const filtered = library.books.filter((book) => {
    if (query) {
      const title = book.title.toLocaleLowerCase('ru')
      const author = book.author.toLocaleLowerCase('ru')
      if (!title.includes(query) && !author.includes(query)) return false
    }
    if (currentFilter !== 'all' && bookStatus(book) !== currentFilter) return false
    return true
  })

  const currentSort = sort.value
  return filtered.slice().sort((a, b) => compareBooks(a, b, currentSort))
})

const layoutLabel = computed(() => (layout.value === 'grid' ? 'Показать списком' : 'Показать сеткой'))

function compareBooks(a: Book, b: Book, currentSort: LibrarySort) {
  if (currentSort === 'title') return a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' })
  if (currentSort === 'author') return a.author.localeCompare(b.author, 'ru', { sensitivity: 'base' })
  if (currentSort === 'added') return b.addedAt - a.addedAt
  if (a.lastPlayedAt == null && b.lastPlayedAt == null) return 0
  if (a.lastPlayedAt == null) return 1
  if (b.lastPlayedAt == null) return -1
  return b.lastPlayedAt - a.lastPlayedAt
}

function authorOf(book: Book) {
  return book.author.trim() || 'Автор не указан'
}

function progressOf(book: Book) {
  const value = bookProgress(book)
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function openFilePicker() {
  fileInput.value?.click()
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!files.length) return
  importNotice.value = ''
  try {
    const created = await library.importFiles(files)
    if (created.length === 1) {
      const book = created[0]
      if (book) await router.push({ name: 'book-edit', params: { id: book.id } })
      return
    }
    if (created.length > 1) importNotice.value = `Добавлено книг: ${created.length}`
  } catch {
    importNotice.value = ''
  }
}

function openPlayer(id: string) {
  void router.push({ name: 'player', params: { id } })
}

function playAndOpen(id: string) {
  void player.open(id, true).catch(() => {})
  void router.push({ name: 'player', params: { id } })
}

function editBook(id: string) {
  void router.push({ name: 'book-edit', params: { id } })
}

async function persist(partial: Partial<Settings>) {
  try {
    await settingsStore.patch(partial)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Не удалось сохранить настройки'
  }
}

function setFilter(value: LibraryFilter) {
  void persist({ libraryFilter: value })
}

function isLibrarySort(value: string): value is LibrarySort {
  return value === 'title' || value === 'author' || value === 'added' || value === 'lastPlayed'
}

function onSortChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!isLibrarySort(value)) return
  void persist({ librarySort: value })
}

function toggleLayout() {
  const next: LibraryViewMode = layout.value === 'list' ? 'grid' : 'list'
  void persist({ libraryView: next })
}

function openCollect(id: string) {
  collectId.value = id
  collectPick.value = []
  actionError.value = ''
}

function toggleCollect(id: string) {
  collectPick.value = collectPick.value.includes(id)
    ? collectPick.value.filter((item) => item !== id)
    : [...collectPick.value, id]
}

function collectionHasBook(collectionId: string): boolean {
  const bookId = collectId.value
  if (!bookId) return false
  return collections.getById(collectionId)?.bookIds.includes(bookId) ?? false
}

async function confirmCollect() {
  const bookId = collectId.value
  if (!bookId || collecting.value) return
  collecting.value = true
  actionError.value = ''
  try {
    for (const collectionId of collectPick.value) {
      await collections.addBooks(collectionId, [bookId])
    }
    collectId.value = null
    collectPick.value = []
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Не удалось добавить книгу в коллекцию'
  } finally {
    collecting.value = false
  }
}

async function confirmReset() {
  const id = resetId.value
  if (!id) return
  resetId.value = null
  try {
    await library.resetProgress(id)
    player.place(id, 0)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Не удалось сбросить прогресс'
  }
}

async function confirmDelete() {
  if (!deleteId.value || deleting.value) return
  deleting.value = true
  const id = deleteId.value
  try {
    await library.deleteBook(id)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Не удалось удалить книгу'
  } finally {
    deleting.value = false
    deleteId.value = null
  }
}
</script>

<template>
  <div class="page">
    <AppHeader title="Моя библиотека">
      <button
        type="button"
        class="icon-btn"
        aria-label="Добавить аудиокнигу"
        :disabled="!library.ready || library.importing"
        @click="openFilePicker"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </AppHeader>

    <input
      ref="fileInput"
      class="file-input"
      type="file"
      multiple
      accept=".mp3,.m4a,.m4b,.aac,.ogg,.wav,audio/*"
      tabindex="-1"
      aria-hidden="true"
      @change="onFiles"
    />

    <main class="body" :aria-busy="library.importing">
      <p v-if="importLabel" class="status" role="status">{{ importLabel }}</p>
      <p v-if="importNotice" class="status" role="status">{{ importNotice }}</p>
      <p v-if="library.importError" class="status status--error" role="alert">{{ library.importError }}</p>
      <p v-if="actionError" class="status status--error" role="alert">{{ actionError }}</p>

      <p v-if="!library.ready && !bootError" class="loading" role="status">Загрузка...</p>

      <template v-else-if="library.ready">
        <div class="search">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            v-model="search"
            type="search"
            placeholder="Поиск книг..."
            aria-label="Поиск книг"
            autocomplete="off"
          />
        </div>

        <section v-if="continueBook" class="block" aria-labelledby="continue-heading">
          <h2 id="continue-heading">{{ continueHeading }}</h2>
          <ContinueListening
            :title="continueBook.title"
            :author="authorOf(continueBook)"
            :cover-url="coverUrls.get(continueBook.id) ?? null"
            :progress="progressOf(continueBook)"
            :again="continueAgain"
            @open="openPlayer(continueBook.id)"
            @play="playAndOpen(continueBook.id)"
          />
        </section>

        <section class="block books" aria-labelledby="books-heading">
          <h2 id="books-heading">Мои книги</h2>

          <div v-if="library.books.length > 0" class="controls">
            <div class="chips" role="group" aria-label="Фильтр книг">
              <button
                v-for="item in filters"
                :key="item.value"
                type="button"
                class="chip"
                :aria-pressed="filter === item.value"
                @click="setFilter(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
            <div class="toolbar">
              <select class="sort" aria-label="Сортировка" :value="sort" @change="onSortChange">
                <option v-for="item in sorts" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
              <button type="button" class="layout-btn" :aria-label="layoutLabel" @click="toggleLayout">
                <svg
                  v-if="layout === 'grid'"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  aria-hidden="true"
                >
                  <path d="M9 7h11M9 12h11M9 17h11" stroke-linecap="round" />
                  <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke-linecap="round" stroke-width="3" />
                </svg>
                <svg
                  v-else
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
                  <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
                  <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
                  <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
                </svg>
              </button>
            </div>
          </div>

          <EmptyState
            v-if="library.books.length === 0"
            title="Библиотека пока пуста"
            text="Загрузите файл, чтобы начать."
          >
            <button
              type="button"
              class="btn btn--primary"
              :disabled="library.importing"
              @click="openFilePicker"
            >
              Добавить аудиокнигу
            </button>
          </EmptyState>
          <EmptyState
            v-else-if="visibleBooks.length === 0"
            title="Ничего не найдено"
            text="Попробуйте другой запрос или фильтр."
          />
          <div v-else :class="layout === 'list' ? 'list' : 'grid'">
            <BookCard
              v-for="book in visibleBooks"
              :key="book.id"
              :book="book"
              :cover-url="coverUrls.get(book.id) ?? null"
              :layout="layout"
              @open="openPlayer(book.id)"
              @edit="editBook(book.id)"
              @delete="deleteId = book.id"
              @reset="resetId = book.id"
              @collect="openCollect(book.id)"
            />
          </div>
        </section>

        <BackupPanel />

        <p class="note">
          Книги хранятся только на этом устройстве и могут пропасть, если очистить данные браузера.
        </p>
      </template>
    </main>

    <ConfirmDialog
      :open="resetId !== null"
      title="Сбросить прогресс?"
      message="Позиция прослушивания вернётся в начало. Статистика сохранится."
      confirm-label="Сбросить"
      @confirm="confirmReset"
      @cancel="resetId = null"
    />

    <div v-if="collectId" class="sheet" role="dialog" aria-modal="true" aria-labelledby="collect-title">
      <div class="sheet__panel">
        <h2 id="collect-title">Добавить в коллекцию</h2>
        <p v-if="collections.collections.length === 0" class="sheet__empty">
          Сначала создайте коллекцию в разделе «Коллекции».
        </p>
        <ul v-else class="sheet__list">
          <li v-for="collection in collections.collections" :key="collection.id">
            <label>
              <input
                type="checkbox"
                :checked="collectionHasBook(collection.id) || collectPick.includes(collection.id)"
                :disabled="collectionHasBook(collection.id) || collecting"
                @change="toggleCollect(collection.id)"
              />
              <span>{{ collection.title }}</span>
            </label>
          </li>
        </ul>
        <div class="sheet__actions">
          <button type="button" class="btn" :disabled="collecting" @click="collectId = null">Отмена</button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="collecting || collectPick.length === 0"
            @click="confirmCollect"
          >
            Добавить
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="deleteId !== null"
      title="Удалить книгу?"
      message="Файл будет удалён с устройства. Статистика прослушивания сохранится."
      confirm-label="Удалить"
      danger
      @confirm="confirmDelete"
      @cancel="deleteId = null"
    />
  </div>
</template>

<style scoped>
.page {
  position: relative;
  width: min(100%, 960px);
  margin-inline: auto;
}

.body {
  padding: 0 var(--space) 8px;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip-path: inset(50%);
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 50%;
}

.icon-btn:disabled {
  opacity: 0.45;
}

@media (hover: hover) {
  .icon-btn:hover:not(:disabled) {
    background: var(--bg-soft);
  }
}

.status {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.status--error {
  color: var(--danger);
}

.loading {
  margin: 48px 0;
  color: var(--text-muted);
  text-align: center;
}

.search {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  margin-top: 4px;
  padding: 0 12px;
  background: var(--bg-soft);
  border: 1px solid transparent;
  border-radius: var(--radius);
}

.search:focus-within {
  border-color: var(--accent);
}

.search svg {
  flex: 0 0 auto;
  color: var(--text-muted);
}

.search input {
  flex: 1;
  min-width: 0;
  min-height: 42px;
  padding: 0;
  background: transparent;
  border: 0;
}

.search input:focus-visible {
  outline: none;
}

.block {
  margin-top: 28px;
}

.block h2 {
  margin: 0 0 12px;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.books {
  padding-top: 20px;
  border-top: 1px solid var(--line);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
  margin-bottom: 14px;
}

.chips {
  display: flex;
  flex: 1 1 100%;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 2px 2px 6px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 12px;
  color: var(--text-muted);
  font-size: 0.82rem;
  white-space: nowrap;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 999px;
}

.chip[aria-pressed='true'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
}

.toolbar {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  width: auto;
}

.sort {
  width: 8.6rem;
  max-width: 38vw;
  min-height: 36px;
  padding: 0 8px;
  color: var(--text);
  font-size: 0.82rem;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 999px;
}

.layout-btn {
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 999px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 168px));
  justify-content: start;
  gap: 16px 12px;
}

.list {
  display: flex;
  flex-direction: column;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  font: inherit;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.btn--primary {
  font-weight: 600;
  color: var(--accent-ink);
  background: var(--accent);
  border-color: transparent;
}

.sheet {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  align-items: end;
  padding: 16px;
  background: color-mix(in srgb, #1f1c18 35%, transparent);
}

.sheet__panel {
  width: min(100%, 480px);
  margin: 0 auto;
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 16px;
}

.sheet__panel h2 {
  margin: 0 0 12px;
  font-size: 1.05rem;
}

.sheet__empty {
  margin: 0 0 12px;
  color: var(--text-muted);
}

.sheet__list {
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
  max-height: 40vh;
  overflow: auto;
}

.sheet__list label {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 44px;
}

.sheet__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn:disabled {
  opacity: 0.5;
}

.note {
  margin: 32px 0 8px;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.4;
}

@media (min-width: 640px) {
  .chips {
    flex-basis: auto;
  }

  .toolbar {
    margin-left: auto;
  }
}

@media (min-width: 480px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 168px));
  }
}

@media (min-width: 840px) {
  .grid {
    grid-template-columns: repeat(auto-fill, 156px);
  }
}
</style>
