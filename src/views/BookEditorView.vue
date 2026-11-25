<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useLibraryStore } from '@/stores/library'
import type { BookDraft } from '@/types/library'
import { formatClock } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const bootError = inject<Ref<string>>('bootError', ref(''))

const title = ref('')
const author = ref('')
const narrator = ref('')
const genre = ref('')
const description = ref('')
const coverBlob = ref<File | null>(null)
const removeCover = ref(false)
const previewUrl = ref<string | null>(null)
const seededId = ref<string | null>(null)
const saving = ref(false)
const formError = ref('')
const titleInput = ref<HTMLInputElement | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)
const broken = ref(false)

const bookId = computed(() => {
  const raw = route.params.id
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
})

const book = computed(() => (bookId.value ? (library.getBook(bookId.value) ?? null) : null))

watch(
  bookId,
  (id) => {
    if (!id) void router.replace({ name: 'library' })
  },
  { immediate: true },
)

function revokePreview() {
  if (!previewUrl.value) return
  URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

function resetCoverInput() {
  const input = coverInput.value
  if (!input) return
  input.value = ''
}

watch(
  book,
  (value) => {
    if (!value || seededId.value === value.id) return
    revokePreview()
    seededId.value = value.id
    title.value = value.title
    author.value = value.author
    narrator.value = value.narrator
    genre.value = value.genre
    description.value = value.description
    coverBlob.value = null
    removeCover.value = false
    broken.value = false
    formError.value = ''
    resetCoverInput()
  },
  { immediate: true },
)

const shownCover = computed(() => {
  if (previewUrl.value) return previewUrl.value
  if (removeCover.value) return null
  const current = book.value
  if (!current?.coverId) return null
  return library.coverUrl(current.coverId) || null
})

watch(shownCover, () => {
  broken.value = false
})

const letter = computed(() => {
  const char = title.value.trim().charAt(0)
  return char ? char.toLocaleUpperCase('ru') : '•'
})

const canRemoveCover = computed(
  () => Boolean(previewUrl.value) || (!removeCover.value && Boolean(book.value?.coverId)),
)

function goBack() {
  const state = window.history.state as { back?: string | null } | null
  if (state?.back) router.back()
  else void router.push({ name: 'library' })
}

function onCoverPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  revokePreview()
  previewUrl.value = URL.createObjectURL(file)
  coverBlob.value = file
  removeCover.value = false
}

function removeCoverImage() {
  if (previewUrl.value || coverBlob.value) {
    revokePreview()
    coverBlob.value = null
    removeCover.value = false
    resetCoverInput()
    return
  }
  removeCover.value = true
}

async function save() {
  if (!bookId.value || saving.value) return
  if (!title.value.trim()) {
    formError.value = 'Укажите название'
    titleInput.value?.focus()
    return
  }
  formError.value = ''
  saving.value = true
  const draft: BookDraft = {
    title: title.value.trim(),
    author: author.value.trim(),
    narrator: narrator.value.trim(),
    genre: genre.value.trim(),
    description: description.value.trim(),
    coverBlob: coverBlob.value,
    removeCover: removeCover.value,
  }
  try {
    await library.updateBook(bookId.value, draft)
    goBack()
  } catch (error) {
    formError.value = error instanceof Error && error.message ? error.message : 'Не удалось сохранить книгу'
  } finally {
    saving.value = false
  }
}

onUnmounted(revokePreview)
</script>

<template>
  <div class="page">
    <AppHeader title="Редактирование">
      <template #leading>
        <button type="button" class="back" @click="goBack">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 5 8 12l7 7" />
          </svg>
          Назад
        </button>
      </template>
    </AppHeader>

    <p v-if="bookId && !library.ready && !bootError" class="loading" role="status">Загрузка...</p>
    <EmptyState v-else-if="bookId && library.ready && !book" title="Книга не найдена">
      <button type="button" class="btn btn--primary" @click="goBack">В библиотеку</button>
    </EmptyState>

    <form v-else-if="book && seededId === book.id" class="form" autocomplete="off" novalidate @submit.prevent="save">
      <p class="file-meta">{{ book.fileName }} · {{ formatClock(book.duration) }}</p>

      <label class="field" for="book-title">
        <span>Название</span>
        <input
          id="book-title"
          ref="titleInput"
          v-model="title"
          type="text"
          name="title"
          autocomplete="off"
          :aria-invalid="Boolean(formError && !title.trim())"
        />
      </label>

      <label class="field" for="book-author">
        <span>Автор</span>
        <input id="book-author" v-model="author" type="text" name="author" autocomplete="off" />
      </label>

      <label class="field" for="book-narrator">
        <span>Исполнитель</span>
        <input id="book-narrator" v-model="narrator" type="text" name="narrator" autocomplete="off" />
      </label>

      <label class="field" for="book-genre">
        <span>Жанр</span>
        <input id="book-genre" v-model="genre" type="text" name="genre" autocomplete="off" />
      </label>

      <label class="field" for="book-description">
        <span>Описание</span>
        <textarea id="book-description" v-model="description" name="description" rows="5" />
      </label>

      <div class="cover-block">
        <span class="field-label" id="book-cover-label">Обложка</span>
        <div class="cover-row">
          <span class="preview">
            <img
              v-if="shownCover && !broken"
              :src="shownCover"
              alt="Обложка"
              @error="broken = true"
            />
            <span v-else class="monogram" aria-hidden="true">{{ letter }}</span>
          </span>
          <div class="cover-actions">
            <input
              id="book-cover"
              ref="coverInput"
              class="cover-input"
              type="file"
              accept="image/*"
              aria-labelledby="book-cover-label"
              @change="onCoverPick"
            />
            <button type="button" class="btn" :disabled="!canRemoveCover" @click="removeCoverImage">
              Убрать обложку
            </button>
          </div>
        </div>
      </div>

      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

      <button type="submit" class="btn btn--primary btn--block" :disabled="saving">
        {{ saving ? 'Сохраняем...' : 'Сохранить' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.page {
  width: min(100%, 960px);
  margin-inline: auto;
}

.back {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  min-height: 44px;
  margin-right: 4px;
  padding: 0 8px 0 0;
  color: var(--accent);
  background: transparent;
  border: 0;
}

.loading {
  margin: 48px 0;
  color: var(--text-muted);
  text-align: center;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px var(--space) 28px;
}

.file-meta {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span,
.field-label {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.field input,
.field textarea,
.cover-input {
  width: 100%;
  padding: 10px 12px;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.field input {
  min-height: 44px;
}

.field textarea {
  min-height: 120px;
  resize: vertical;
}

.cover-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cover-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}

.preview {
  display: block;
  flex: 0 0 auto;
  width: 96px;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-soft));
  border: 1px solid var(--line);
  border-radius: 12px;
}

.preview img {
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
  font-size: 1.75rem;
  font-weight: 600;
}

.cover-actions {
  display: flex;
  flex: 1 1 200px;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  font: inherit;
  color: var(--text);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.btn:disabled {
  opacity: 0.5;
}

.btn--primary {
  font-weight: 600;
  color: var(--accent-ink);
  background: var(--accent);
  border-color: transparent;
}

.btn--block {
  width: 100%;
}

.form-error {
  margin: 0;
  color: var(--danger);
}
</style>
