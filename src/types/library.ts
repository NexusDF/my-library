export type BookId = string
export type CollectionId = string
export type BookStatus = 'unread' | 'inProgress' | 'finished'

export interface Book {
  id: BookId
  title: string
  author: string
  narrator: string
  genre: string
  description: string
  duration: number
  addedAt: number
  lastPlayedAt: number | null
  position: number
  coverId: string | null
  mimeType: string
  fileName: string
  fileSize: number
  playbackRate?: number | null
}

export interface BookDraft {
  title: string
  author: string
  narrator: string
  genre: string
  description: string
  coverBlob: Blob | null
  removeCover: boolean
}

export interface Collection {
  id: CollectionId
  title: string
  description: string
  coverId: string | null
  createdAt: number
  updatedAt: number
  bookIds: BookId[]
}

export interface Bookmark {
  id: string
  bookId: BookId
  title: string
  note: string
  position: number
  createdAt: number
}

export interface CollectionDraft {
  title: string
  description: string
  coverBlob: Blob | null
  removeCover: boolean
}

export interface ListeningSession {
  id: string
  bookId: BookId
  bookTitle: string
  author: string
  startedAt: number
  endedAt: number
  listenedSeconds: number
  position: number
  playbackRate?: number
}

export type ThemeSetting = 'system' | 'light' | 'dark'
export type LibraryViewMode = 'grid' | 'list'
export type LibrarySort = 'title' | 'author' | 'added' | 'lastPlayed'
export type LibraryFilter = 'all' | 'unread' | 'inProgress' | 'finished'

export interface Settings {
  theme: ThemeSetting
  playbackRate: number
  libraryView: LibraryViewMode
  librarySort: LibrarySort
  libraryFilter: LibraryFilter
}

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5] as const
export const COMPLETE_RATIO = 0.95

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  playbackRate: 1,
  libraryView: 'grid',
  librarySort: 'added',
  libraryFilter: 'all',
}

export function bookStatus(book: Pick<Book, 'position' | 'duration'>): BookStatus {
  if (book.position === 0) return 'unread'
  if (book.position >= book.duration * COMPLETE_RATIO || book.position >= book.duration - 0.25) {
    return 'finished'
  }
  return 'inProgress'
}

export function bookStatusLabel(status: BookStatus): string {
  if (status === 'finished') return 'Завершена'
  if (status === 'inProgress') return 'В процессе'
  return 'Не начата'
}

export function collectionProgress(
  books: Array<Pick<Book, 'position' | 'duration'> | undefined>,
): number {
  let listened = 0
  let total = 0
  for (const book of books) {
    if (!book) continue
    const duration = book.duration
    if (!Number.isFinite(duration) || duration <= 0) continue
    const position = Number.isFinite(book.position)
      ? Math.min(Math.max(book.position, 0), duration)
      : 0
    total += duration
    listened += position
  }
  if (total <= 0) return 0
  return Math.min(100, Math.round((listened / total) * 100))
}

export function bookProgress(book: Pick<Book, 'position' | 'duration'>): number {
  const { position, duration } = book
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0
  const percent = Math.round((position / duration) * 100)
  if (!Number.isFinite(percent) || percent <= 0) return 0
  if (percent >= 100) return 100
  return percent
}
