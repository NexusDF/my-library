import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  Book,
  BookId,
  Bookmark,
  Collection,
  CollectionId,
  ListeningSession,
  Settings,
} from '@/types/library'

interface AudiobookDB extends DBSchema {
  books: {
    key: BookId
    value: Book
  }
  audio: {
    key: BookId
    value: Blob
  }
  covers: {
    key: string
    value: Blob
  }
  collections: {
    key: CollectionId
    value: Collection
  }
  sessions: {
    key: string
    value: ListeningSession
    indexes: { startedAt: number }
  }
  settings: {
    key: string
    value: Settings
  }
  bookmarks: {
    key: string
    value: Bookmark
    indexes: { bookId: string }
  }
}

const DB_NAME = 'audiobooks'
const DB_VERSION = 2
const SETTINGS_KEY = 'app'

let databasePromise: Promise<IDBPDatabase<AudiobookDB>> | null = null

function openDatabase(): Promise<IDBPDatabase<AudiobookDB>> {
  if (!databasePromise) {
    databasePromise = openDB<AudiobookDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('books')) {
          database.createObjectStore('books', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('audio')) database.createObjectStore('audio')
        if (!database.objectStoreNames.contains('covers')) database.createObjectStore('covers')
        if (!database.objectStoreNames.contains('collections')) {
          database.createObjectStore('collections', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('sessions')) {
          const sessions = database.createObjectStore('sessions', { keyPath: 'id' })
          sessions.createIndex('startedAt', 'startedAt')
        }
        if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings')
        if (!database.objectStoreNames.contains('bookmarks')) {
          const bookmarks = database.createObjectStore('bookmarks', { keyPath: 'id' })
          bookmarks.createIndex('bookId', 'bookId')
        }
      },
    }).catch((error: unknown) => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}

export async function getAllBooks(): Promise<Book[]> {
  const database = await openDatabase()
  return database.getAll('books')
}

export async function getBook(id: BookId): Promise<Book | undefined> {
  const database = await openDatabase()
  return database.get('books', id)
}

export async function putBook(book: Book): Promise<void> {
  const database = await openDatabase()
  await database.put('books', book)
}

export async function deleteBook(id: BookId): Promise<void> {
  const database = await openDatabase()
  const tx = database.transaction(
    ['books', 'audio', 'covers', 'collections', 'bookmarks'],
    'readwrite',
  )
  const book = await tx.objectStore('books').get(id)
  await tx.objectStore('books').delete(id)
  await tx.objectStore('audio').delete(id)
  if (book?.coverId) await tx.objectStore('covers').delete(book.coverId)
  const collections = await tx.objectStore('collections').getAll()
  for (const collection of collections) {
    if (!collection.bookIds.includes(id)) continue
    const next: Collection = {
      ...collection,
      bookIds: collection.bookIds.filter((bookId) => bookId !== id),
    }
    await tx.objectStore('collections').put(next)
  }
  const marks = await tx.objectStore('bookmarks').index('bookId').getAll(id)
  for (const mark of marks) await tx.objectStore('bookmarks').delete(mark.id)
  await tx.done
}

export async function putAudio(id: BookId, blob: Blob): Promise<void> {
  const database = await openDatabase()
  await database.put('audio', blob, id)
}

export async function getAudio(id: BookId): Promise<Blob | undefined> {
  const database = await openDatabase()
  return database.get('audio', id)
}

export async function putCover(id: string, blob: Blob): Promise<void> {
  const database = await openDatabase()
  await database.put('covers', blob, id)
}

export async function getCover(id: string): Promise<Blob | undefined> {
  const database = await openDatabase()
  return database.get('covers', id)
}

export async function deleteCover(id: string): Promise<void> {
  const database = await openDatabase()
  await database.delete('covers', id)
}

export async function getAllCollections(): Promise<Collection[]> {
  const database = await openDatabase()
  return database.getAll('collections')
}

export async function putCollection(collection: Collection): Promise<void> {
  const database = await openDatabase()
  await database.put('collections', collection)
}

export async function deleteCollection(id: CollectionId): Promise<void> {
  const database = await openDatabase()
  await database.delete('collections', id)
}

export async function getAllSessions(): Promise<ListeningSession[]> {
  const database = await openDatabase()
  return database.getAllFromIndex('sessions', 'startedAt')
}

export async function putSession(session: ListeningSession): Promise<void> {
  const database = await openDatabase()
  await database.put('sessions', session)
}

export async function deleteSession(id: string): Promise<void> {
  const database = await openDatabase()
  await database.delete('sessions', id)
}

export async function clearSessions(): Promise<void> {
  const database = await openDatabase()
  await database.clear('sessions')
}

export async function getSettings(): Promise<Settings | undefined> {
  const database = await openDatabase()
  return database.get('settings', SETTINGS_KEY)
}

export async function putSettings(settings: Settings): Promise<void> {
  const database = await openDatabase()
  await database.put('settings', settings, SETTINGS_KEY)
}

export async function getAllBookmarks(): Promise<Bookmark[]> {
  const database = await openDatabase()
  return database.getAll('bookmarks')
}

export async function putBookmark(bookmark: Bookmark): Promise<void> {
  const database = await openDatabase()
  await database.put('bookmarks', bookmark)
}

export async function deleteBookmark(id: string): Promise<void> {
  const database = await openDatabase()
  await database.delete('bookmarks', id)
}

export async function getAllCoverKeys(): Promise<string[]> {
  const database = await openDatabase()
  const keys = await database.getAllKeys('covers')
  return keys.filter((key): key is string => typeof key === 'string')
}
