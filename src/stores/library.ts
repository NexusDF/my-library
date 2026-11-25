import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  deleteBook as deleteStoredBook,
  deleteCover,
  getAllBooks,
  getCover,
  putAudio,
  putBook,
  putCover,
} from '@/services/db'
import { assertPlayable, audioMimeType, readDuration, readTrackMetadata } from '@/services/metadata'
import { assertRoomFor, requestPersistentStorage } from '@/services/storageQuota'
import { useBookmarkStore } from '@/stores/bookmarks'
import { useCollectionsStore } from '@/stores/collections'
import type { Book, BookDraft, BookId } from '@/types/library'

const STORAGE_ERROR = 'Не удалось сохранить данные на устройстве'
const KNOWN_ERRORS = new Set([
  STORAGE_ERROR,
  'Недостаточно места в хранилище браузера',
  'Этот формат браузер, скорее всего, не сможет воспроизвести',
])

function storageError(error: unknown): Error {
  if (error instanceof Error && KNOWN_ERRORS.has(error.message)) return error
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new Error('Недостаточно места в хранилище браузера')
  }
  return new Error(STORAGE_ERROR)
}

function fileTitle(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return base
  return base.slice(0, dot)
}

export const useLibraryStore = defineStore('library', () => {
  const books = ref<Book[]>([])
  const ready = ref(false)
  const importing = ref(false)
  const importError = ref<string | null>(null)
  const importProgress = ref<{ current: number; total: number; fileName: string } | null>(null)
  const coverUrls = ref<Record<string, string>>({})
  let persistentRequested = false

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

  function replaceBook(next: Book) {
    const index = books.value.findIndex((book) => book.id === next.id)
    if (index === -1) {
      books.value = [...books.value, next]
      return
    }
    const copy = books.value.slice()
    copy[index] = next
    books.value = copy
  }

  async function hydrate(): Promise<void> {
    const urls: Record<string, string> = {}
    let committed = false
    try {
      const loaded = await getAllBooks()
      for (const book of loaded) {
        if (!book.coverId) continue
        const blob = await getCover(book.coverId)
        if (!blob) continue
        urls[book.coverId] = URL.createObjectURL(blob)
      }
      revokeCovers()
      books.value = loaded
      coverUrls.value = urls
      committed = true
      if (!persistentRequested) {
        persistentRequested = true
        await requestPersistentStorage()
      }
      ready.value = true
    } catch (error) {
      if (!committed) {
        for (const url of Object.values(urls)) URL.revokeObjectURL(url)
      }
      throw storageError(error)
    }
  }

  async function importOne(file: File): Promise<Book> {
    assertPlayable(file)
    await assertRoomFor(file.size)
    const tags = await readTrackMetadata(file)
    const mimeType = audioMimeType(file) || file.type
    const duration = await readDuration(file, mimeType)
    const id = crypto.randomUUID()
    let coverId: string | null = null
    try {
      if (tags.cover) {
        coverId = crypto.randomUUID()
        await putCover(coverId, tags.cover)
      }
      await putAudio(id, file)
      const book: Book = {
        id,
        title: tags.title ?? fileTitle(file.name),
        author: tags.author ?? '',
        narrator: '',
        genre: tags.genre ?? '',
        description: '',
        duration,
        addedAt: Date.now(),
        lastPlayedAt: null,
        position: 0,
        coverId,
        mimeType,
        fileName: file.name,
        fileSize: file.size,
      }
      await putBook(book)
      if (coverId && tags.cover) rememberCover(coverId, tags.cover)
      return book
    } catch (error) {
      await deleteStoredBook(id).catch(() => undefined)
      if (coverId) {
        revokeCover(coverId)
        await deleteCover(coverId).catch(() => undefined)
      }
      throw error
    }
  }

  async function importFiles(files: File[]): Promise<Book[]> {
    importing.value = true
    importError.value = null
    const saved: Book[] = []
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        if (!file) continue
        importProgress.value = { current: index + 1, total: files.length, fileName: file.name }
        try {
          const book = await importOne(file)
          saved.push(book)
          books.value = [...books.value, book]
        } catch (error) {
          importError.value = storageError(error).message
        }
      }
      return saved
    } finally {
      importing.value = false
      importProgress.value = null
    }
  }

  async function updateBook(id: BookId, draft: BookDraft): Promise<void> {
    const current = books.value.find((book) => book.id === id)
    if (!current) return
    const title = draft.title.trim()
    const next: Book = {
      ...current,
      title: title || current.title,
      author: draft.author,
      narrator: draft.narrator,
      genre: draft.genre,
      description: draft.description,
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
      await putBook(next)
    } catch (error) {
      if (createdCoverId) await deleteCover(createdCoverId).catch(() => undefined)
      throw storageError(error)
    }
    if (createdCoverId && draft.coverBlob) rememberCover(createdCoverId, draft.coverBlob)
    replaceBook(next)
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

  async function deleteBook(id: BookId): Promise<void> {
    const current = books.value.find((book) => book.id === id)
    try {
      await deleteStoredBook(id)
    } catch (error) {
      throw storageError(error)
    }
    if (current?.coverId) revokeCover(current.coverId)
    books.value = books.value.filter((book) => book.id !== id)
    useBookmarkStore().forgetBook(id)
    const collections = useCollectionsStore()
    if (!collections.ready) return
    let changed = false
    const nextCollections = collections.collections.map((collection) => {
      if (!collection.bookIds.includes(id)) return collection
      changed = true
      return { ...collection, bookIds: collection.bookIds.filter((bookId) => bookId !== id) }
    })
    if (changed) collections.collections = nextCollections
  }

  function getBook(id: BookId): Book | undefined {
    return books.value.find((book) => book.id === id)
  }

  async function setProgress(id: BookId, position: number, duration: number): Promise<void> {
    const current = books.value.find((book) => book.id === id)
    if (!current) return
    const next: Book = {
      ...current,
      position: Number.isFinite(position) ? Math.max(0, position) : 0,
      lastPlayedAt: Date.now(),
    }
    if (Number.isFinite(duration) && duration > 0) next.duration = duration
    try {
      await putBook(next)
    } catch (error) {
      throw storageError(error)
    }
    replaceBook(next)
  }

  async function resetProgress(id: BookId): Promise<void> {
    const current = books.value.find((book) => book.id === id)
    if (!current) return
    const next: Book = { ...current, position: 0, lastPlayedAt: null }
    try {
      await putBook(next)
    } catch (error) {
      throw storageError(error)
    }
    replaceBook(next)
  }

  async function setPlaybackRate(id: BookId, rate: number): Promise<void> {
    const current = books.value.find((book) => book.id === id)
    if (!current || !Number.isFinite(rate) || rate <= 0) return
    const next: Book = { ...current, playbackRate: rate }
    try {
      await putBook(next)
    } catch (error) {
      throw storageError(error)
    }
    replaceBook(next)
  }

  return {
    books,
    ready,
    importing,
    importError,
    importProgress,
    coverUrls,
    hydrate,
    importFiles,
    updateBook,
    deleteBook,
    getBook,
    setProgress,
    resetProgress,
    setPlaybackRate,
    coverUrl,
    revokeCovers,
  }
})
