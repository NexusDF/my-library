import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  deleteCollection as deleteStoredCollection,
  deleteCover,
  getAllCollections,
  getCover,
  putCollection,
  putCover,
} from '@/services/db'
import type { BookId, Collection, CollectionDraft, CollectionId } from '@/types/library'

const STORAGE_ERROR = 'Не удалось сохранить данные на устройстве'
const TITLE_ERROR = 'Введите название коллекции'

function storageError(error: unknown): Error {
  if (error instanceof Error && error.message === TITLE_ERROR) return error
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new Error('Недостаточно места в хранилище браузера')
  }
  return new Error(STORAGE_ERROR)
}

export const useCollectionsStore = defineStore('collections', () => {
  const collections = ref<Collection[]>([])
  const ready = ref(false)
  const coverUrls = ref<Record<string, string>>({})

  function revokeCover(coverId: string | null) {
    if (!coverId) return
    const url = coverUrls.value[coverId]
    if (!url) return
    URL.revokeObjectURL(url)
    delete coverUrls.value[coverId]
  }

  function revokeCovers() {
    for (const url of Object.values(coverUrls.value)) URL.revokeObjectURL(url)
    coverUrls.value = {}
  }

  function coverUrl(coverId: string | null): string | null {
    if (!coverId) return null
    return coverUrls.value[coverId] ?? null
  }

  function rememberCover(coverId: string, blob: Blob) {
    const previous = coverUrls.value[coverId]
    if (previous) URL.revokeObjectURL(previous)
    coverUrls.value[coverId] = URL.createObjectURL(blob)
  }

  function replaceCollection(next: Collection) {
    const index = collections.value.findIndex((collection) => collection.id === next.id)
    if (index === -1) {
      collections.value = [...collections.value, next]
      return
    }
    const copy = collections.value.slice()
    copy[index] = next
    collections.value = copy
  }

  async function hydrate(): Promise<void> {
    const urls: Record<string, string> = {}
    let committed = false
    try {
      const loaded = await getAllCollections()
      for (const collection of loaded) {
        if (!collection.coverId) continue
        const blob = await getCover(collection.coverId)
        if (!blob) continue
        urls[collection.coverId] = URL.createObjectURL(blob)
      }
      revokeCovers()
      collections.value = loaded
      coverUrls.value = urls
      committed = true
      ready.value = true
    } catch (error) {
      if (!committed) {
        for (const url of Object.values(urls)) URL.revokeObjectURL(url)
      }
      throw storageError(error)
    }
  }

  async function create(draft: CollectionDraft): Promise<Collection> {
    const title = draft.title.trim()
    if (!title) throw new Error(TITLE_ERROR)
    const now = Date.now()
    let coverId: string | null = null
    try {
      if (draft.coverBlob) {
        coverId = crypto.randomUUID()
        await putCover(coverId, draft.coverBlob)
      }
      const collection: Collection = {
        id: crypto.randomUUID(),
        title,
        description: draft.description,
        coverId,
        createdAt: now,
        updatedAt: now,
        bookIds: [],
      }
      await putCollection(collection)
      if (coverId && draft.coverBlob) rememberCover(coverId, draft.coverBlob)
      collections.value = [...collections.value, collection]
      return collection
    } catch (error) {
      if (coverId) await deleteCover(coverId).catch(() => undefined)
      throw storageError(error)
    }
  }

  async function update(id: CollectionId, draft: CollectionDraft): Promise<void> {
    const current = collections.value.find((collection) => collection.id === id)
    if (!current) return
    const title = draft.title.trim()
    const next: Collection = {
      ...current,
      title: title || current.title,
      description: draft.description,
      updatedAt: Date.now(),
    }
    const previousCoverId = current.coverId
    let createdCoverId: string | null = null
    try {
      if (draft.coverBlob) {
        createdCoverId = crypto.randomUUID()
        await putCover(createdCoverId, draft.coverBlob)
        next.coverId = createdCoverId
      } else if (draft.removeCover) {
        next.coverId = null
      }
      await putCollection(next)
    } catch (error) {
      if (createdCoverId) await deleteCover(createdCoverId).catch(() => undefined)
      throw storageError(error)
    }
    if (createdCoverId && draft.coverBlob) rememberCover(createdCoverId, draft.coverBlob)
    replaceCollection(next)
    if (
      previousCoverId &&
      previousCoverId !== next.coverId &&
      (draft.coverBlob || draft.removeCover)
    ) {
      revokeCover(previousCoverId)
      try {
        await deleteCover(previousCoverId)
      } catch (error) {
        throw storageError(error)
      }
    }
  }

  async function remove(id: CollectionId): Promise<void> {
    const current = collections.value.find((collection) => collection.id === id)
    let coverId = current?.coverId ?? null
    try {
      if (!current) {
        const all = await getAllCollections()
        coverId = all.find((collection) => collection.id === id)?.coverId ?? null
      }
      await deleteStoredCollection(id)
      if (coverId) await deleteCover(coverId)
    } catch (error) {
      throw storageError(error)
    }
    if (coverId) revokeCover(coverId)
    collections.value = collections.value.filter((collection) => collection.id !== id)
  }

  async function addBooks(id: CollectionId, bookIds: BookId[]): Promise<void> {
    const current = collections.value.find((collection) => collection.id === id)
    if (!current) return
    const seen = new Set(current.bookIds)
    const nextIds = current.bookIds.slice()
    for (const bookId of bookIds) {
      if (seen.has(bookId)) continue
      seen.add(bookId)
      nextIds.push(bookId)
    }
    if (nextIds.length === current.bookIds.length) return
    const next: Collection = { ...current, bookIds: nextIds, updatedAt: Date.now() }
    try {
      await putCollection(next)
    } catch (error) {
      throw storageError(error)
    }
    replaceCollection(next)
  }

  async function removeBook(id: CollectionId, bookId: BookId): Promise<void> {
    const current = collections.value.find((collection) => collection.id === id)
    if (!current || !current.bookIds.includes(bookId)) return
    const next: Collection = {
      ...current,
      bookIds: current.bookIds.filter((existing) => existing !== bookId),
      updatedAt: Date.now(),
    }
    try {
      await putCollection(next)
    } catch (error) {
      throw storageError(error)
    }
    replaceCollection(next)
  }

  async function reorder(id: CollectionId, bookIds: BookId[]): Promise<void> {
    const current = collections.value.find((collection) => collection.id === id)
    if (!current) return
    const allowed = new Set(current.bookIds)
    const seen = new Set<BookId>()
    const nextIds: BookId[] = []
    for (const bookId of bookIds) {
      if (!allowed.has(bookId) || seen.has(bookId)) continue
      seen.add(bookId)
      nextIds.push(bookId)
    }
    for (const bookId of current.bookIds) {
      if (!seen.has(bookId)) nextIds.push(bookId)
    }
    const next: Collection = { ...current, bookIds: nextIds, updatedAt: Date.now() }
    try {
      await putCollection(next)
    } catch (error) {
      throw storageError(error)
    }
    replaceCollection(next)
  }

  function getById(id: CollectionId): Collection | undefined {
    return collections.value.find((collection) => collection.id === id)
  }

  return {
    collections,
    ready,
    coverUrls,
    hydrate,
    create,
    update,
    remove,
    addBooks,
    removeBook,
    reorder,
    getById,
    coverUrl,
    revokeCovers,
  }
})
