<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useCollectionsStore } from '@/stores/collections'
import { useLibraryStore } from '@/stores/library'
import { collectionProgress } from '@/types/library'

const props = defineProps<{
  collection: {
    id: string
    title: string
    description?: string | null
    coverId?: string | null
    bookIds: readonly string[]
  }
}>()

const collectionsStore = useCollectionsStore()
const libraryStore = useLibraryStore()
const broken = ref<Record<string, boolean>>({})

const customCover = computed(() => {
  void collectionsStore.coverUrls
  const coverId = props.collection.coverId
  if (!coverId) return null
  return collectionsStore.coverUrl(coverId) || null
})

const cells = computed(() => {
  void libraryStore.books
  void libraryStore.coverUrls
  return props.collection.bookIds.slice(0, 4).map((bookId) => {
    const book = libraryStore.getBook(bookId)
    const coverId = book?.coverId
    const url = coverId ? libraryStore.coverUrl(coverId) : null
    return {
      key: bookId,
      url: url || null,
      letter: initial(book?.title),
    }
  })
})

const collageClass = computed(() => {
  const count = cells.value.length
  if (count <= 1) return 'count-1'
  if (count === 2) return 'count-2'
  if (count === 3) return 'count-3'
  return 'count-4'
})

const description = computed(() => props.collection.description?.trim() ?? '')
const titleInitial = computed(() => initial(props.collection.title))
const countLabel = computed(() => booksLabel(props.collection.bookIds.length))

const progress = computed(() => {
  void libraryStore.books
  return collectionProgress(props.collection.bookIds.map((id) => libraryStore.getBook(id)))
})

function isBroken(key: string): boolean {
  return broken.value[key] === true
}

function hideCell(key: string) {
  broken.value = { ...broken.value, [key]: true }
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
</script>

<template>
  <RouterLink class="card" :to="{ name: 'collection', params: { id: collection.id } }">
    <img
      v-if="customCover"
      class="photo"
      :src="customCover"
      alt=""
      draggable="false"
    />
    <div v-else-if="collection.coverId || cells.length === 0" class="photo letter-tile">
      {{ titleInitial }}
    </div>
    <div v-else class="collage" :class="collageClass">
      <div v-for="cell in cells" :key="cell.key" class="cell">
        <img
          v-if="cell.url && !isBroken(cell.key)"
          :src="cell.url"
          alt=""
          draggable="false"
          @error="hideCell(cell.key)"
        />
        <span v-else class="letter">{{ cell.letter }}</span>
      </div>
    </div>

    <span class="copy">
      <span class="title">{{ collection.title }}</span>
      <span class="count">{{ countLabel }}</span>
      <span class="progress" aria-hidden="true">
        <span class="progress__fill" :style="{ width: `${progress}%` }"></span>
      </span>
      <span class="progress-label">{{ progress }}%</span>
      <span v-if="description" class="desc">{{ description }}</span>
    </span>
  </RouterLink>
</template>

<style scoped>
.card {
  --c-elevated: var(--bg-elevated, #1c1b22);
  --c-soft: var(--bg-soft, #2a2933);
  --c-text: var(--text, #f3efe6);
  --c-muted: var(--text-muted, #9c978e);
  --c-accent: var(--accent, #c4b4e4);
  --c-line: var(--line, rgba(243, 239, 230, 0.12));
  --c-radius: var(--radius, 12px);

  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  height: 100%;
  padding: 12px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  background: var(--c-elevated);
  color: var(--c-text);
  text-decoration: none;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-tap-highlight-color: transparent;
}

.card:active {
  background: var(--c-soft);
}

@media (hover: hover) {
  .card:hover {
    background: var(--c-soft);
  }
}

.card:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}

.photo,
.collage {
  width: 72px;
  height: 96px;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px var(--c-line);
}

.photo {
  display: block;
  object-fit: cover;
  background: var(--c-soft);
}

.letter-tile,
.letter {
  background: var(--c-soft);
  background: color-mix(in srgb, var(--c-accent) 26%, var(--c-soft));
  color: var(--c-text);
  font-weight: 600;
}

.letter-tile {
  display: grid;
  place-items: center;
  font-size: 28px;
}

.collage {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  overflow: hidden;
  background: var(--c-line);
}

.collage.count-1 {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.collage.count-2 {
  grid-template-rows: 1fr;
}

.collage.count-3 .cell:last-child {
  grid-column: 1 / -1;
}

.cell {
  display: flex;
  min-width: 0;
  min-height: 0;
}

.cell img,
.letter {
  width: 100%;
  height: 100%;
  flex: 1;
}

.cell img {
  display: block;
  object-fit: cover;
}

.letter {
  display: grid;
  place-items: center;
  font-size: 14px;
}

.copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.title,
.count,
.desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.count,
.desc,
.progress-label {
  color: var(--c-muted);
  font-size: 13px;
  line-height: 1.35;
}

.progress {
  display: block;
  height: 3px;
  margin-top: 6px;
  overflow: hidden;
  background: var(--c-line);
  border-radius: 999px;
}

.progress__fill {
  display: block;
  height: 100%;
  background: var(--c-accent);
  border-radius: inherit;
}

.progress-label {
  font-variant-numeric: tabular-nums;
}
</style>
