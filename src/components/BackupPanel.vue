<script setup lang="ts">
import { ref } from 'vue'
import { useBookmarkStore } from '@/stores/bookmarks'
import { useCollectionsStore } from '@/stores/collections'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import type { BackupConflict, ImportMode } from '@/services/backup'

const library = useLibraryStore()
const collections = useCollectionsStore()
const stats = useStatsStore()
const bookmarks = useBookmarkStore()
const settings = useSettingsStore()
const player = usePlayerStore()

const busy = ref(false)
const message = ref('')
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const pendingFile = ref<File | null>(null)
const conflicts = ref<BackupConflict[]>([])
const conflictOpen = ref(false)

function stamp() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

async function refresh() {
  await Promise.all([
    library.hydrate(),
    collections.hydrate(),
    stats.hydrate(),
    bookmarks.hydrate(),
    settings.hydrate(),
  ])
}

async function exportCopy() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const { exportLibrary } = await import('@/services/backup')
    const blob = await exportLibrary()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `biblioteka-${stamp()}.zip`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    message.value = 'Резервная копия сохранена.'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось создать копию'
  } finally {
    busy.value = false
  }
}

function pickFile() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  conflicts.value = []
  try {
    const { inspectBackup } = await import('@/services/backup')
    const report = await inspectBackup(file)
    pendingFile.value = file
    if (report.conflicts.length > 0) {
      conflicts.value = report.conflicts
      conflictOpen.value = true
      return
    }
    await apply('merge')
  } catch (caught) {
    pendingFile.value = null
    error.value = caught instanceof Error ? caught.message : 'Не удалось прочитать архив'
  } finally {
    busy.value = false
  }
}

async function apply(mode: ImportMode) {
  const file = pendingFile.value
  if (!file) return
  busy.value = true
  error.value = ''
  conflictOpen.value = false
  try {
    const { importBackup } = await import('@/services/backup')
    await importBackup(file, mode)
    await refresh()
    if (mode === 'replace') player.unload()
    message.value = mode === 'replace' ? 'Библиотека заменена копией.' : 'Копия объединена с библиотекой.'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Не удалось восстановить копию'
  } finally {
    pendingFile.value = null
    conflicts.value = []
    busy.value = false
  }
}

function cancelImport() {
  conflictOpen.value = false
  pendingFile.value = null
  conflicts.value = []
}
</script>

<template>
  <section class="backup" aria-labelledby="backup-title">
    <h2 id="backup-title">Резервная копия</h2>
    <p>Архив включает аудио, обложки, прогресс, коллекции, закладки, статистику и настройки.</p>
    <div class="backup__actions">
      <button type="button" class="btn btn--primary" :disabled="busy" @click="exportCopy">
        Сохранить копию
      </button>
      <button type="button" class="btn" :disabled="busy" @click="pickFile">Восстановить</button>
      <input ref="fileInput" class="backup__file" type="file" accept=".zip,application/zip" @change="onFile" />
    </div>
    <p v-if="message" class="backup__ok" role="status">{{ message }}</p>
    <p v-if="error" class="backup__error" role="alert">{{ error }}</p>

    <div v-if="conflictOpen" class="backup__dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <div class="backup__panel">
        <h3 id="conflict-title">В копии есть книги, которые уже в библиотеке</h3>
        <p>Можно пропустить совпадающие книги или заменить библиотеку целиком. При ошибке текущие книги не удаляются.</p>
        <ul>
          <li v-for="conflict in conflicts" :key="conflict.id">{{ conflict.title }}</li>
        </ul>
        <div class="backup__actions">
          <button type="button" class="btn" :disabled="busy" @click="cancelImport">Отмена</button>
          <button type="button" class="btn" :disabled="busy" @click="apply('merge')">Объединить</button>
          <button type="button" class="btn btn--primary" :disabled="busy" @click="apply('replace')">Заменить</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.backup {
  margin-top: 28px;
}

.backup h2 {
  margin: 0 0 6px;
  font-size: 1rem;
}

.backup p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.45;
}

.backup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.backup__file {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.backup__ok,
.backup__error {
  margin-top: 10px;
}

.backup__error {
  color: var(--danger, #9a3b32);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  font: inherit;
  color: inherit;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
}

.btn--primary {
  font-weight: 600;
  color: var(--accent-ink);
  background: var(--accent);
  border-color: transparent;
}

.btn:disabled {
  cursor: default;
  opacity: 0.55;
}

.backup__dialog {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, #1f1c18 35%, transparent);
}

.backup__panel {
  width: min(100%, 480px);
  max-height: min(80vh, 560px);
  overflow: auto;
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 16px;
}

.backup__panel h3 {
  margin: 0 0 8px;
  font-size: 1.05rem;
}

.backup__panel ul {
  margin: 12px 0;
  padding-left: 18px;
}
</style>
