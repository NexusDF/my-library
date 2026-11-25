import { ref } from 'vue'
import { defineStore } from 'pinia'
import { deleteBookmark, getAllBookmarks, putBookmark } from '@/services/db'
import type { Bookmark, BookId } from '@/types/library'

const STORAGE_ERROR = 'Не удалось сохранить данные на устройстве'

export const useBookmarkStore = defineStore('bookmarks', () => {
  const bookmarks = ref<Bookmark[]>([])
  const ready = ref(false)

  async function hydrate(): Promise<void> {
    try {
      const loaded = await getAllBookmarks()
      bookmarks.value = loaded.slice().sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
      ready.value = true
    } catch {
      throw new Error(STORAGE_ERROR)
    }
  }

  function forBook(bookId: BookId): Bookmark[] {
    return bookmarks.value
      .filter((bookmark) => bookmark.bookId === bookId)
      .slice()
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
  }

  async function add(input: {
    bookId: BookId
    title: string
    note: string
    position: number
  }): Promise<Bookmark> {
    const title = input.title.trim() || 'Закладка'
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      bookId: input.bookId,
      title,
      note: input.note.trim(),
      position: Number.isFinite(input.position) ? Math.max(0, input.position) : 0,
      createdAt: Date.now(),
    }
    try {
      await putBookmark(bookmark)
    } catch {
      throw new Error(STORAGE_ERROR)
    }
    bookmarks.value = [...bookmarks.value, bookmark]
    return bookmark
  }

  async function remove(id: string): Promise<void> {
    try {
      await deleteBookmark(id)
    } catch {
      throw new Error(STORAGE_ERROR)
    }
    bookmarks.value = bookmarks.value.filter((bookmark) => bookmark.id !== id)
  }

  function forgetBook(bookId: BookId) {
    bookmarks.value = bookmarks.value.filter((bookmark) => bookmark.bookId !== bookId)
  }

  return { bookmarks, ready, hydrate, forBook, add, remove, forgetBook }
})
