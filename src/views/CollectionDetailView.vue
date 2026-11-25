<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCollectionsStore } from '@/stores/collections'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { bookProgress, collectionProgress } from '@/types/library'
import AddBooksSheet from '@/components/AddBooksSheet.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const collectionsStore = useCollectionsStore()
const libraryStore = useLibraryStore()
const playerStore = usePlayerStore()

const editing = ref(false)
const saving = ref(false)
const editError = ref('')
const actionError = ref('')
const draftTitle = ref('')
const draftDescription = ref('')
const coverBlob = ref<Blob | null>(null)
const previewUrl = ref<string | null>(null)
const removeCover = ref(false)
const fileKey = ref(0)
const titleInput = ref<HTMLInputElement | null>(null)
const sheetOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const openingId = ref<string | null>(null)
const order = ref('saved')
const removingId = ref<string | null>(null)
const brokenCovers = ref<Record<string, boolean>>({})

const routeId = computed(() => {
  const raw = route.params.id
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
})

const ready = computed(() => Boolean(collectionsStore.ready && libraryStore.ready))

const model = computed(() => {
  if (!ready.value || !routeId.value) return null
  const current = collectionsStore.getById(routeId.value)
  if (!current) return null
  void libraryStore.books
  void collectionsStore.coverUrls

  const members = current.bookIds.map((bookId) => {
    const book = libraryStore.getBook(bookId)
    if (!book) {
      return {
        id: bookId,
        title: 'Книга недоступна',
        author: '',
        percent: 0,
        raw: 0,
        cover: null as string | null,
        letter: '?',
        missing: true,
      }
    }
    const raw = readProgress(book)
    const cover = book.coverId ? libraryStore.coverUrl(book.coverId) : null
    const author = book.author?.trim()
    return {
      id: book.id,
      title: book.title,
      author: author ? author : 'Автор не указан',
      percent: clampPercent(raw),
      raw,
      cover: cover || null,
      letter: initial(book.title),
      missing: false,
    }
  })

  const measured = current.bookIds
    .map((bookId) => libraryStore.getBook(bookId))
    .filter((book) => book !== undefined)
  const completion = collectionProgress(measured)

  return {
    id: current.id,
    title: current.title,
    description: (current.description ?? '').trim(),
    coverId: current.coverId ?? null,
    bookIds: current.bookIds,
    countLabel: booksLabel(current.bookIds.length),
    completion,
    members,
  }
})

const savedCover = computed(() => {
  const coverId = model.value?.coverId
  if (!coverId || removeCover.value) return null
  void collectionsStore.coverUrls
  return collectionsStore.coverUrl(coverId) || null
})

const shownCover = computed(() => previewUrl.value || savedCover.value)

onUnmounted(() => {
  revokePreview()
})

watch(
  () => model.value?.id,
  () => {
    editing.value = false
    sheetOpen.value = false
    deleteOpen.value = false
    actionError.value = ''
    editError.value = ''
    removeCover.value = false
    clearCover()
  },
)

watch(editing, async (open) => {
  if (!open) return
  await nextTick()
  titleInput.value?.focus()
})

watch(draftTitle, (value) => {
  if (value.trim() && editError.value === 'Введите название коллекции') editError.value = ''
})

watch(removeCover, (remove) => {
  if (remove) clearCover()
})

function toggleEdit() {
  if (saving.value) return
  if (editing.value) {
    editing.value = false
    editError.value = ''
    removeCover.value = false
    clearCover()
    return
  }
  const current = model.value
  if (!current) return
  draftTitle.value = current.title
  draftDescription.value = current.description
  removeCover.value = false
  editError.value = ''
  clearCover()
  editing.value = true
}

function clearCover() {
  revokePreview()
  coverBlob.value = null
  fileKey.value += 1
}

function revokePreview() {
  if (!previewUrl.value) return
  URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

function onCoverPicked(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0] ?? null
  revokePreview()
  coverBlob.value = file
  previewUrl.value = file ? URL.createObjectURL(file) : null
  if (file) removeCover.value = false
}

async function saveEdit() {
  const current = model.value
  if (!current || saving.value) return
  const title = draftTitle.value.trim()
  if (!title) {
    editError.value = 'Введите название коллекции'
    return
  }
  saving.value = true
  editError.value = ''
  try {
    await collectionsStore.update(current.id, {
      title,
      description: draftDescription.value.trim(),
      coverBlob: coverBlob.value,
      removeCover: removeCover.value,
    })
    editing.value = false
    removeCover.value = false
    clearCover()
  } catch (caught) {
    editError.value = messageOf(caught, 'Не удалось сохранить коллекцию')
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (deleting.value) return
  const current = model.value
  deleteOpen.value = false
  if (!current) return
  deleting.value = true
  actionError.value = ''
  try {
    await collectionsStore.remove(current.id)
    await router.push({ name: 'collections' })
  } catch (caught) {
    actionError.value = messageOf(caught, 'Не удалось удалить коллекцию')
  } finally {
    deleting.value = false
  }
}

async function listen(bookId: string) {
  if (openingId.value) return
  openingId.value = bookId
  actionError.value = ''
  void playerStore.open(bookId, true)
  try {
    await router.push({ name: 'player', params: { id: bookId } })
  } catch (caught) {
    actionError.value = messageOf(caught, 'Не удалось открыть плеер')
  } finally {
    openingId.value = null
  }
}

async function removeMember(bookId: string) {
  const current = model.value
  if (!current || removingId.value) return
  removingId.value = bookId
  actionError.value = ''
  try {
    await collectionsStore.removeBook(current.id, bookId)
  } catch (caught) {
    actionError.value = messageOf(caught, 'Не удалось убрать книгу')
  } finally {
    removingId.value = null
  }
}

function coverVisible(id: string, cover: string | null): boolean {
  return Boolean(cover) && brokenCovers.value[id] !== true
}

function hideCover(id: string) {
  brokenCovers.value = { ...brokenCovers.value, [id]: true }
}

function readProgress(book: NonNullable<ReturnType<typeof libraryStore.getBook>>): number {
  const value = bookProgress(book)
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(100, value)
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(100, Math.round(value))
}

function initial(value: string | null | undefined): string {
  const first = Array.from(value?.trim() ?? '')[0]
  return first ? first.toLocaleUpperCase('ru') : '?'
}

function booksLabel(count: number): string {
  const abs = Math.abs(count)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} книга`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} книги`
  return `${count} книг`
}

async function applyOrder(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  order.value = value
  const current = model.value
  if (!current || value === 'saved') return
  const members = current.members.filter((member) => !member.missing)
  const sorted = members.slice().sort((left, right) => {
    if (value === 'title') return left.title.localeCompare(right.title, 'ru', { sensitivity: 'base' })
    if (value === 'author') return left.author.localeCompare(right.author, 'ru', { sensitivity: 'base' })
    return right.percent - left.percent
  })
  const missing = current.members.filter((member) => member.missing).map((member) => member.id)
  try {
    await collectionsStore.reorder(current.id, [...sorted.map((member) => member.id), ...missing])
  } catch (caught) {
    actionError.value = messageOf(caught, 'Не удалось изменить порядок книг')
  }
}

function messageOf(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message.trim()) return caught.message.trim()
  return fallback
}
</script>

<template>
  <main class="page">
    <RouterLink class="back" :to="{ name: 'collections' }">К коллекциям</RouterLink>

    <p v-if="!ready" class="status" role="status">Загрузка...</p>

    <h1 v-else-if="!model">Коллекция не найдена</h1>

    <template v-else>
      <header class="intro">
        <h1>{{ model.title }}</h1>
        <p v-if="model.description" class="lead">{{ model.description }}</p>
        <p class="count">{{ model.countLabel }}</p>
        <p id="average-progress" class="average">Общий прогресс {{ model.completion }}%</p>
        <div
          class="meter"
          role="meter"
          aria-labelledby="average-progress"
          :aria-valuenow="model.completion"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="meter-fill" :style="{ width: `${model.completion}%` }"></div>
        </div>
      </header>

      <div class="actions">
        <button type="button" class="btn ghost" :disabled="saving" @click="toggleEdit">
          Изменить
        </button>
        <button type="button" class="btn primary" @click="sheetOpen = true">Добавить книги</button>
        <button type="button" class="btn danger" :disabled="deleting" @click="deleteOpen = true">
          Удалить коллекцию
        </button>
      </div>

      <form v-if="editing" class="panel" @submit.prevent="saveEdit">
        <label class="field">
          <span>Название</span>
          <input
            ref="titleInput"
            v-model="draftTitle"
            type="text"
            autocomplete="off"
            :disabled="saving"
          />
        </label>
        <label class="field">
          <span>Описание</span>
          <textarea v-model="draftDescription" rows="3" :disabled="saving"></textarea>
        </label>
        <label class="field">
          <span>Обложка</span>
          <input
            :key="fileKey"
            type="file"
            accept="image/*"
            :disabled="saving"
            @change="onCoverPicked"
          />
        </label>
        <img v-if="shownCover" class="preview" :src="shownCover" alt="Обложка коллекции" />
        <label v-if="model.coverId" class="check">
          <input v-model="removeCover" type="checkbox" :disabled="saving" />
          <span>Убрать обложку</span>
        </label>
        <p v-if="editError" class="form-error" role="alert">{{ editError }}</p>
        <div class="form-actions">
          <button type="submit" class="btn primary" :disabled="saving">Сохранить</button>
          <button type="button" class="btn ghost" :disabled="saving" @click="toggleEdit">
            Отмена
          </button>
        </div>
      </form>

      <p v-if="actionError" class="form-error banner" role="alert">{{ actionError }}</p>

      <section class="books-block">
        <div class="books-head">
          <h2>Книги</h2>
          <label v-if="model.bookIds.length > 1" class="order">
            <span class="visually-hidden">Порядок книг</span>
            <select :value="order" @change="applyOrder">
              <option value="saved">Сохранённый порядок</option>
              <option value="title">По названию</option>
              <option value="author">По автору</option>
              <option value="progress">По прогрессу</option>
            </select>
          </label>
        </div>
        <p v-if="model.bookIds.length === 0" class="hint">В коллекции пока нет книг.</p>
        <ul v-else class="books">
          <li v-for="member in model.members" :key="member.id" class="book">
            <div class="thumb">
              <img
                v-if="coverVisible(member.id, member.cover)"
                :src="member.cover || undefined"
                alt=""
                draggable="false"
                @error="hideCover(member.id)"
              />
              <span v-else class="letter">{{ member.letter }}</span>
            </div>
            <div class="book-copy">
              <h3>{{ member.title }}</h3>
              <p v-if="member.author" class="author">{{ member.author }}</p>
              <template v-if="!member.missing">
                <div class="meter slim" aria-hidden="true">
                  <div class="meter-fill" :style="{ width: `${member.percent}%` }"></div>
                </div>
                <p class="percent">{{ member.percent }}%</p>
              </template>
              <div class="book-actions">
                <button
                  v-if="!member.missing"
                  type="button"
                  class="btn primary slim"
                  :disabled="openingId === member.id"
                  @click="listen(member.id)"
                >
                  Слушать
                </button>
                <button
                  type="button"
                  class="btn ghost slim"
                  :disabled="removingId === member.id"
                  @click="removeMember(member.id)"
                >
                  Убрать
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <AddBooksSheet
        :open="sheetOpen"
        :collection-book-ids="model.bookIds"
        @close="sheetOpen = false"
      />
    </template>

    <ConfirmDialog
      :open="deleteOpen"
      title="Удалить коллекцию?"
      message="Книги останутся в библиотеке."
      confirm-label="Удалить"
      :danger="true"
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
    />
  </main>
</template>

<style scoped>
.page {
  --c-bg: var(--bg, #141318);
  --c-elevated: var(--bg-elevated, #1c1b22);
  --c-soft: var(--bg-soft, #2a2933);
  --c-text: var(--text, #f3efe6);
  --c-muted: var(--text-muted, #9c978e);
  --c-accent: var(--accent, #c4b4e4);
  --c-ink: var(--accent-ink, #1b1524);
  --c-line: var(--line, rgba(243, 239, 230, 0.12));
  --c-danger: var(--danger, #e39494);
  --c-radius: var(--radius, 12px);

  box-sizing: border-box;
  width: min(100%, 960px);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 16px 16px calc(20px + env(safe-area-inset-bottom));
  background: var(--c-bg);
  color: var(--c-text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

.page *,
.page *::before,
.page *::after {
  box-sizing: border-box;
}

.back {
  display: inline-flex;
  margin-bottom: 14px;
  color: var(--c-accent);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.back:hover {
  text-decoration: underline;
}

.back:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

h2,
h3,
p {
  margin: 0;
}

.lead {
  margin-top: 8px;
  color: var(--c-muted);
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.count {
  margin-top: 12px;
  font-size: 14px;
}

.average {
  margin: 4px 0 8px;
  color: var(--c-muted);
  font-size: 14px;
}

.meter {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--c-soft);
}

.meter.slim {
  margin-top: 8px;
}

.meter-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--c-accent);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  background: var(--c-elevated);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--c-muted);
  font-size: 13px;
}

.field input,
.field textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--c-line);
  border-radius: 10px;
  background: var(--c-bg);
  color: var(--c-text);
  font: inherit;
  font-size: 16px;
}

.field textarea {
  min-height: 88px;
  resize: vertical;
}

.field input[type='file'] {
  padding: 10px 0;
  border: 0;
  background: transparent;
  font-size: 14px;
}

.field input[type='file']::file-selector-button {
  margin-right: 12px;
  padding: 8px 12px;
  border: 1px solid var(--c-line);
  border-radius: 999px;
  background: var(--c-soft);
  color: var(--c-text);
  font: inherit;
  cursor: pointer;
}

.preview {
  width: 72px;
  height: 96px;
  object-fit: cover;
  border-radius: 8px;
  background: var(--c-soft);
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--c-text);
  font-size: 15px;
}

.check input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--c-accent);
}

.form-actions {
  display: flex;
  gap: 8px;
}

.form-actions .btn {
  flex: 1;
}

.form-error,
.hint,
.status {
  color: var(--c-muted);
  font-size: 14px;
  line-height: 1.45;
}

.form-error {
  color: var(--c-danger);
}

.banner {
  margin-top: 16px;
}

.books-block {
  margin-top: 28px;
}

.books-block h2 {
  font-size: 17px;
  font-weight: 600;
}

.books-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  justify-content: space-between;
}

.books-head select {
  min-height: 40px;
  padding: 0 10px;
  color: inherit;
  background: var(--c-elevated);
  border: 1px solid var(--c-line);
  border-radius: 10px;
  font: inherit;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.hint,
.status {
  margin-top: 8px;
}

.books {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.book {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  padding: 14px 0;
  border-top: 1px solid var(--c-line);
}

.books .book:first-child {
  border-top: 0;
}

.thumb {
  width: 48px;
  height: 64px;
  overflow: hidden;
  border-radius: 8px;
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
  font-size: 18px;
  font-weight: 600;
}

.book-copy {
  min-width: 0;
}

.book-copy h3 {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.author,
.percent {
  margin-top: 2px;
  color: var(--c-muted);
  font-size: 13px;
}

.book-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.actions .btn {
  width: 100%;
}

.btn.slim {
  min-height: 40px;
  padding: 0 14px;
  font-size: 14px;
}

.btn.primary {
  background: var(--c-accent);
  color: var(--c-ink);
}

.btn.ghost {
  border-color: var(--c-line);
}

.btn.danger {
  border-color: var(--c-danger);
  color: var(--c-danger);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:focus-visible,
.field input:focus-visible,
.field textarea:focus-visible,
.check input:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}

@media (min-width: 720px) {
  h1 {
    font-size: 26px;
  }

  .actions {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .actions .btn {
    width: auto;
  }
}
</style>
