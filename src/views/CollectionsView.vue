<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useCollectionsStore } from '@/stores/collections'
import { useLibraryStore } from '@/stores/library'
import CollectionCard from '@/components/CollectionCard.vue'

const collectionsStore = useCollectionsStore()
const libraryStore = useLibraryStore()

const formOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const draftTitle = ref('')
const draftDescription = ref('')
const coverBlob = ref<Blob | null>(null)
const previewUrl = ref<string | null>(null)
const fileKey = ref(0)
const titleInput = ref<HTMLInputElement | null>(null)

const ready = computed(() => Boolean(collectionsStore.ready && libraryStore.ready))
const collectionList = computed(() => collectionsStore.collections ?? [])

onUnmounted(() => {
  revokePreview()
})

watch(formOpen, async (open) => {
  if (!open) return
  await nextTick()
  titleInput.value?.focus()
})

watch(draftTitle, (value) => {
  if (value.trim() && formError.value === 'Введите название коллекции') formError.value = ''
})

function toggleForm() {
  if (saving.value) return
  formError.value = ''
  if (formOpen.value) {
    formOpen.value = false
    resetForm()
    return
  }
  resetForm()
  formOpen.value = true
}

function resetForm() {
  draftTitle.value = ''
  draftDescription.value = ''
  formError.value = ''
  clearCover()
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
}

async function submit() {
  if (saving.value) return
  const title = draftTitle.value.trim()
  if (!title) {
    formError.value = 'Введите название коллекции'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    await collectionsStore.create({
      title,
      description: draftDescription.value.trim(),
      coverBlob: coverBlob.value,
      removeCover: false,
    })
    formOpen.value = false
    resetForm()
  } catch (caught) {
    formError.value = messageOf(caught, 'Не удалось создать коллекцию')
  } finally {
    saving.value = false
  }
}

function messageOf(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message.trim()) return caught.message.trim()
  return fallback
}
</script>

<template>
  <main class="page">
    <header class="head">
      <h1>Коллекции</h1>
      <button
        type="button"
        class="btn primary"
        :aria-expanded="formOpen"
        :disabled="saving"
        @click="toggleForm"
      >
        Новая коллекция
      </button>
    </header>

    <p v-if="!ready" class="status" role="status">Загрузка...</p>

    <template v-else>
      <form v-if="formOpen" class="panel" @submit.prevent="submit">
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
        <img v-if="previewUrl" class="preview" :src="previewUrl" alt="Предпросмотр обложки" />
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <div class="form-actions">
          <button type="submit" class="btn primary" :disabled="saving">Создать</button>
          <button type="button" class="btn ghost" :disabled="saving" @click="toggleForm">
            Отмена
          </button>
        </div>
      </form>

      <div v-if="collectionList.length === 0" class="empty">
        <p class="empty-title">Коллекций пока нет</p>
        <p>Соберите книги по настроению: фантастика, книги перед сном, что слушать дальше.</p>
      </div>
      <ul v-else class="list">
        <li v-for="item in collectionList" :key="item.id">
          <CollectionCard :collection="item" />
        </li>
      </ul>
    </template>
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

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.25;
}

.status,
.empty p,
.form-error {
  margin: 0;
}

.status,
.empty p {
  color: var(--c-muted);
  line-height: 1.5;
}

.empty {
  padding: 12px 0 8px;
}

.empty-title {
  margin-bottom: 8px;
  color: var(--c-text);
  font-size: 18px;
  font-weight: 600;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list > li {
  min-width: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  background: var(--c-elevated);
  animation: fade 180ms ease;
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

.form-error {
  color: var(--c-danger);
  font-size: 14px;
}

.form-actions {
  display: flex;
  gap: 8px;
}

.form-actions .btn {
  flex: 1;
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

.btn.primary {
  background: var(--c-accent);
  color: var(--c-ink);
}

.btn.ghost {
  border-color: var(--c-line);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:focus-visible,
.field input:focus-visible,
.field textarea:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}

@media (min-width: 720px) {
  h1 {
    font-size: 26px;
  }
}

@media (min-width: 800px) {
  .list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel {
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
