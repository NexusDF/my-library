import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  configure,
  type Entry,
} from '@zip.js/zip.js'
import {
  deleteBook,
  deleteBookmark,
  deleteCollection,
  deleteCover,
  deleteSession,
  getAllBookmarks,
  getAllBooks,
  getAllCollections,
  getAllCoverKeys,
  getAllSessions,
  getAudio,
  getCover,
  getSettings,
  putAudio,
  putBook,
  putBookmark,
  putCollection,
  putCover,
  putSession,
  putSettings,
} from '@/services/db'
import { assertRoomFor } from '@/services/storageQuota'
import {
  DEFAULT_SETTINGS,
  type Book,
  type Bookmark,
  type Collection,
  type ListeningSession,
  type Settings,
} from '@/types/library'

configure({ useWebWorkers: false })

const FORMAT = 'audiobooks-backup'
const VERSION = 1
const MANIFEST = 'manifest.json'
const MAX_MANIFEST_CHARS = 8_000_000
const MAX_ENTRY_BYTES = 4 * 1024 * 1024 * 1024

export type ImportMode = 'merge' | 'replace'

export interface BackupConflict {
  id: string
  title: string
}

export interface BackupReport {
  bookCount: number
  conflicts: BackupConflict[]
}

interface AudioRef {
  bookId: string
  path: string
  size: number
}

interface CoverRef {
  id: string
  path: string
  size: number
}

interface Manifest {
  format: typeof FORMAT
  version: typeof VERSION
  exportedAt: number
  books: Book[]
  collections: Collection[]
  bookmarks: Bookmark[]
  sessions: ListeningSession[]
  settings: Settings | null
  audio: AudioRef[]
  covers: CoverRef[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safePath(path: string, folder: 'audio' | 'covers'): boolean {
  if (!path.startsWith(`${folder}/`)) return false
  if (path.includes('\\') || path.includes('..') || path.includes('//')) return false
  const name = path.slice(folder.length + 1)
  return name.length > 0 && !name.includes('/')
}

function asBook(value: unknown): Book | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  if (typeof value.title !== 'string') return null
  const duration = Number(value.duration)
  const position = Number(value.position)
  if (!Number.isFinite(duration) || duration < 0) return null
  if (!Number.isFinite(position) || position < 0) return null
  const book: Book = {
    id: value.id,
    title: value.title,
    author: typeof value.author === 'string' ? value.author : '',
    narrator: typeof value.narrator === 'string' ? value.narrator : '',
    genre: typeof value.genre === 'string' ? value.genre : '',
    description: typeof value.description === 'string' ? value.description : '',
    duration,
    addedAt: typeof value.addedAt === 'number' ? value.addedAt : Date.now(),
    lastPlayedAt: typeof value.lastPlayedAt === 'number' ? value.lastPlayedAt : null,
    position,
    coverId: typeof value.coverId === 'string' && value.coverId ? value.coverId : null,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : '',
    fileName: typeof value.fileName === 'string' ? value.fileName : 'audio',
    fileSize: typeof value.fileSize === 'number' && value.fileSize >= 0 ? value.fileSize : 0,
  }
  if (typeof value.playbackRate === 'number' && value.playbackRate > 0) {
    book.playbackRate = value.playbackRate
  }
  return book
}

function asCollection(value: unknown): Collection | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  if (typeof value.title !== 'string') return null
  if (!Array.isArray(value.bookIds) || !value.bookIds.every((id) => typeof id === 'string')) return null
  return {
    id: value.id,
    title: value.title,
    description: typeof value.description === 'string' ? value.description : '',
    coverId: typeof value.coverId === 'string' && value.coverId ? value.coverId : null,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    bookIds: value.bookIds,
  }
}

function asBookmark(value: unknown): Bookmark | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  if (typeof value.bookId !== 'string' || !value.bookId) return null
  const position = Number(value.position)
  if (!Number.isFinite(position) || position < 0) return null
  return {
    id: value.id,
    bookId: value.bookId,
    title: typeof value.title === 'string' && value.title.trim() ? value.title : 'Закладка',
    note: typeof value.note === 'string' ? value.note : '',
    position,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
  }
}

function asSession(value: unknown): ListeningSession | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  if (typeof value.bookId !== 'string' || !value.bookId) return null
  const listenedSeconds = Number(value.listenedSeconds)
  const position = Number(value.position)
  const startedAt = Number(value.startedAt)
  const endedAt = Number(value.endedAt)
  if (![listenedSeconds, position, startedAt, endedAt].every((item) => Number.isFinite(item))) return null
  if (listenedSeconds < 0 || position < 0) return null
  const session: ListeningSession = {
    id: value.id,
    bookId: value.bookId,
    bookTitle: typeof value.bookTitle === 'string' ? value.bookTitle : '',
    author: typeof value.author === 'string' ? value.author : '',
    startedAt,
    endedAt,
    listenedSeconds,
    position,
  }
  if (typeof value.playbackRate === 'number' && value.playbackRate > 0) {
    session.playbackRate = value.playbackRate
  }
  return session
}

function asSettings(value: unknown): Settings | null {
  if (value === null) return null
  if (!isRecord(value)) return null
  const theme = value.theme
  const view = value.libraryView
  const sort = value.librarySort
  const filter = value.libraryFilter
  const rate = Number(value.playbackRate)
  if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return null
  if (view !== 'grid' && view !== 'list') return null
  if (sort !== 'title' && sort !== 'author' && sort !== 'added' && sort !== 'lastPlayed') return null
  if (filter !== 'all' && filter !== 'unread' && filter !== 'inProgress' && filter !== 'finished') {
    return null
  }
  if (!Number.isFinite(rate) || rate <= 0) return null
  return { theme, playbackRate: rate, libraryView: view, librarySort: sort, libraryFilter: filter }
}

function parseManifest(raw: string): Manifest {
  if (raw.length > MAX_MANIFEST_CHARS) throw new Error('Файл манифеста слишком большой')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Манифест резервной копии повреждён')
  }
  if (!isRecord(parsed) || parsed.format !== FORMAT || parsed.version !== VERSION) {
    throw new Error('Это не резервная копия библиотеки')
  }
  if (!Array.isArray(parsed.books) || !Array.isArray(parsed.audio) || !Array.isArray(parsed.covers)) {
    throw new Error('В архиве не хватает описания книг')
  }
  const books = parsed.books.map(asBook)
  if (books.some((book) => book === null)) throw new Error('Метаданные книг в архиве повреждены')
  const collections = Array.isArray(parsed.collections) ? parsed.collections.map(asCollection) : []
  const bookmarks = Array.isArray(parsed.bookmarks) ? parsed.bookmarks.map(asBookmark) : []
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions.map(asSession) : []
  if (collections.some((item) => item === null)) throw new Error('Коллекции в архиве повреждены')
  if (bookmarks.some((item) => item === null)) throw new Error('Закладки в архиве повреждены')
  if (sessions.some((item) => item === null)) throw new Error('История прослушивания в архиве повреждена')

  const audio: AudioRef[] = []
  for (const item of parsed.audio) {
    if (!isRecord(item) || typeof item.bookId !== 'string' || typeof item.path !== 'string') {
      throw new Error('Список аудиофайлов в архиве повреждён')
    }
    if (!safePath(item.path, 'audio')) throw new Error('В архиве указан небезопасный путь к аудио')
    const size = Number(item.size)
    audio.push({ bookId: item.bookId, path: item.path, size: Number.isFinite(size) ? size : 0 })
  }
  const covers: CoverRef[] = []
  for (const item of parsed.covers) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.path !== 'string') {
      throw new Error('Список обложек в архиве повреждён')
    }
    if (!safePath(item.path, 'covers')) throw new Error('В архиве указан небезопасный путь к обложке')
    const size = Number(item.size)
    covers.push({ id: item.id, path: item.path, size: Number.isFinite(size) ? size : 0 })
  }

  const bookList = books as Book[]
  const ids = new Set<string>()
  for (const book of bookList) {
    if (ids.has(book.id)) throw new Error('В архиве повторяется идентификатор книги')
    ids.add(book.id)
  }
  if (audio.length !== bookList.length) throw new Error('Число аудиофайлов не совпадает с числом книг')
  const audioIds = new Set(audio.map((item) => item.bookId))
  if (audioIds.size !== audio.length) throw new Error('В архиве повторяется аудиофайл')
  for (const book of bookList) {
    if (!audioIds.has(book.id)) throw new Error(`В архиве нет аудио для «${book.title || 'книги'}»`)
  }
  const coverIds = new Set(covers.map((item) => item.id))
  if (coverIds.size !== covers.length) throw new Error('В архиве повторяется обложка')
  for (const book of bookList) {
    if (book.coverId && !coverIds.has(book.coverId)) {
      throw new Error(`В архиве нет обложки для «${book.title || 'книги'}»`)
    }
  }
  for (const collection of collections as Collection[]) {
    if (collection.coverId && !coverIds.has(collection.coverId)) {
      throw new Error(`В архиве нет обложки коллекции «${collection.title}»`)
    }
  }

  const settings = asSettings(parsed.settings ?? null)
  if (parsed.settings != null && !settings) throw new Error('Настройки в архиве повреждены')

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now(),
    books: bookList,
    collections: collections as Collection[],
    bookmarks: bookmarks as Bookmark[],
    sessions: sessions as ListeningSession[],
    settings,
    audio,
    covers,
  }
}

async function readManifest(file: Blob): Promise<{ manifest: Manifest; entries: Map<string, Entry> }> {
  const reader = new ZipReader(new BlobReader(file))
  try {
    const listed = await reader.getEntries()
    const entries = new Map<string, Entry>()
    for (const entry of listed) {
      const name = entry.filename.replaceAll('\\', '/')
      if (entries.has(name)) throw new Error('В архиве повторяется имя файла')
      entries.set(name, entry)
    }
    const manifestEntry = entries.get(MANIFEST)
    if (!manifestEntry || manifestEntry.directory) throw new Error('В архиве нет манифеста')
    if (manifestEntry.uncompressedSize > MAX_MANIFEST_CHARS) {
      throw new Error('Файл манифеста слишком большой')
    }
    const text = await manifestEntry.getData(new TextWriter())
    const manifest = parseManifest(text)
    for (const item of [...manifest.audio, ...manifest.covers]) {
      const entry = entries.get(item.path)
      if (!entry || entry.directory) throw new Error(`В архиве нет файла ${item.path}`)
      if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error('Файл в архиве слишком большой')
      if (item.size > 0 && entry.uncompressedSize > 0 && entry.uncompressedSize !== item.size) {
        throw new Error('Размер файла в архиве не совпадает с манифестом')
      }
    }
    return { manifest, entries }
  } catch (error) {
    if (error instanceof Error && /архив|манифест|копи|книг|обложк|заклад|истори|настрой|путь|файл/i.test(error.message)) {
      throw error
    }
    throw new Error('Не удалось прочитать архив. Проверьте, что это резервная копия библиотеки.')
  } finally {
    await reader.close()
  }
}

export async function exportLibrary(): Promise<Blob> {
  const [books, collections, bookmarks, sessions, settings] = await Promise.all([
    getAllBooks(),
    getAllCollections(),
    getAllBookmarks(),
    getAllSessions(),
    getSettings(),
  ])
  const audio: AudioRef[] = []
  const covers: CoverRef[] = []
  const coverSeen = new Set<string>()
  const exportedBooks: Book[] = []

  const writer = new ZipWriter(new BlobWriter('application/zip'))
  try {
    for (const book of books) {
      const blob = await getAudio(book.id)
      if (!blob) throw new Error(`Не найден аудиофайл «${book.title}»`)
      const path = `audio/${book.id}`
      await writer.add(path, new BlobReader(blob), { level: 0 })
      audio.push({ bookId: book.id, path, size: blob.size })
      let coverId = book.coverId
      if (coverId && !coverSeen.has(coverId)) {
        const cover = await getCover(coverId)
        if (!cover) coverId = null
        else {
          const coverPath = `covers/${coverId}`
          await writer.add(coverPath, new BlobReader(cover), { level: 0 })
          covers.push({ id: coverId, path: coverPath, size: cover.size })
          coverSeen.add(coverId)
        }
      }
      exportedBooks.push(coverId === book.coverId ? book : { ...book, coverId })
    }
    for (const collection of collections) {
      if (!collection.coverId || coverSeen.has(collection.coverId)) continue
      const cover = await getCover(collection.coverId)
      if (!cover) continue
      const coverPath = `covers/${collection.coverId}`
      await writer.add(coverPath, new BlobReader(cover), { level: 0 })
      covers.push({ id: collection.coverId, path: coverPath, size: cover.size })
      coverSeen.add(collection.coverId)
    }
    const manifest: Manifest = {
      format: FORMAT,
      version: VERSION,
      exportedAt: Date.now(),
      books: exportedBooks,
      collections,
      bookmarks,
      sessions,
      settings: settings ?? null,
      audio,
      covers,
    }
    await writer.add(MANIFEST, new TextReader(JSON.stringify(manifest)), { level: 0 })
    return await writer.close()
  } catch (error) {
    await writer.close().catch(() => undefined)
    throw error instanceof Error ? error : new Error('Не удалось создать резервную копию')
  }
}

export async function inspectBackup(file: Blob): Promise<BackupReport> {
  const { manifest } = await readManifest(file)
  const local = await getAllBooks()
  const localIds = new Set(local.map((book) => book.id))
  const conflicts = manifest.books
    .filter((book) => localIds.has(book.id))
    .map((book) => ({ id: book.id, title: book.title || 'Без названия' }))
  return { bookCount: manifest.books.length, conflicts }
}

async function readEntryBlob(file: Blob, path: string, mime: string, expected: number): Promise<Blob> {
  const reader = new ZipReader(new BlobReader(file))
  try {
    const listed = await reader.getEntries()
    const match = listed.find((item) => item.filename.replaceAll('\\', '/') === path)
    if (!match || match.directory) throw new Error(`В архиве нет файла ${path}`)
    if (match.uncompressedSize > MAX_ENTRY_BYTES) throw new Error('Файл в архиве слишком большой')
    const blob = await match.getData(new BlobWriter(mime || 'application/octet-stream'))
    if (!(blob instanceof Blob) || blob.size <= 0) throw new Error(`Файл ${path} пустой или повреждён`)
    if (expected > 0 && blob.size !== expected && match.uncompressedSize > 0 && blob.size !== match.uncompressedSize) {
      throw new Error(`Файл ${path} повреждён`)
    }
    if (match.uncompressedSize > 0 && blob.size !== match.uncompressedSize) {
      throw new Error(`Файл ${path} повреждён`)
    }
    return blob
  } catch (error) {
    if (error instanceof Error && /архив|файл|пустой|повреж/i.test(error.message)) throw error
    throw new Error('Не удалось прочитать файл из архива')
  } finally {
    await reader.close()
  }
}

export async function importBackup(file: Blob, mode: ImportMode): Promise<void> {
  const { manifest } = await readManifest(file)
  const localBooks = await getAllBooks()
  const localIds = new Set(localBooks.map((book) => book.id))
  const localById = new Map(localBooks.map((book) => [book.id, book]))
  const importedBookIds = new Set(manifest.books.map((book) => book.id))

  for (const book of manifest.books) {
    const exists = localIds.has(book.id)
    if (mode === 'merge' && exists) continue
    const audioRef = manifest.audio.find((item) => item.bookId === book.id)
    if (!audioRef) throw new Error(`В архиве нет аудио для «${book.title}»`)
    const previous = localById.get(book.id)
    const delta = audioRef.size - (previous?.fileSize ?? 0)
    if (delta > 0) await assertRoomFor(delta)
  }

  const writtenCovers = new Set<string>()
  try {
    for (const book of manifest.books) {
      const exists = localIds.has(book.id)
      if (mode === 'merge' && exists) continue
      if (book.coverId) {
        const coverRef = manifest.covers.find((item) => item.id === book.coverId)
        if (!coverRef) throw new Error(`В архиве нет обложки для «${book.title}»`)
        if (!writtenCovers.has(book.coverId)) {
          const blob = await readEntryBlob(file, coverRef.path, 'application/octet-stream', coverRef.size)
          await putCover(book.coverId, blob)
          writtenCovers.add(book.coverId)
        }
      }
      const audioRef = manifest.audio.find((item) => item.bookId === book.id)
      if (!audioRef) throw new Error(`В архиве нет аудио для «${book.title}»`)
      const audio = await readEntryBlob(file, audioRef.path, book.mimeType, audioRef.size)
      await putAudio(book.id, audio)
      const next = { ...book, fileSize: audio.size }
      await putBook(next)
    }

    for (const collection of manifest.collections) {
      if (collection.coverId && !writtenCovers.has(collection.coverId)) {
        const coverRef = manifest.covers.find((item) => item.id === collection.coverId)
        if (!coverRef) throw new Error(`В архиве нет обложки коллекции «${collection.title}»`)
        const blob = await readEntryBlob(file, coverRef.path, 'application/octet-stream', coverRef.size)
        await putCover(collection.coverId, blob)
        writtenCovers.add(collection.coverId)
      }
    }

    const localCollections = await getAllCollections()
    const localCollectionIds = new Map(localCollections.map((collection) => [collection.id, collection]))
    for (const collection of manifest.collections) {
      const current = localCollectionIds.get(collection.id)
      if (mode === 'merge' && current) {
        const seen = new Set(current.bookIds)
        const bookIds = current.bookIds.slice()
        for (const bookId of collection.bookIds) {
          if (seen.has(bookId)) continue
          seen.add(bookId)
          bookIds.push(bookId)
        }
        await putCollection({ ...current, bookIds, updatedAt: Date.now() })
        continue
      }
      await putCollection(collection)
    }

    const localBookmarks = await getAllBookmarks()
    const localBookmarkIds = new Set(localBookmarks.map((bookmark) => bookmark.id))
    for (const bookmark of manifest.bookmarks) {
      if (mode === 'merge' && localBookmarkIds.has(bookmark.id)) continue
      await putBookmark(bookmark)
    }

    const localSessions = await getAllSessions()
    const localSessionIds = new Set(localSessions.map((session) => session.id))
    for (const session of manifest.sessions) {
      if (mode === 'merge' && localSessionIds.has(session.id)) continue
      await putSession(session)
    }

    if (mode === 'replace' && manifest.settings) {
      await putSettings({ ...DEFAULT_SETTINGS, ...manifest.settings })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось прочитать архив'
    throw new Error(`${message}. Текущая библиотека не удалялась.`)
  }

  if (mode !== 'replace') return

  try {
  const importedCollectionIds = new Set(manifest.collections.map((collection) => collection.id))
  const importedBookmarkIds = new Set(manifest.bookmarks.map((bookmark) => bookmark.id))
  const importedSessionIds = new Set(manifest.sessions.map((session) => session.id))

  for (const book of localBooks) {
    if (!importedBookIds.has(book.id)) await deleteBook(book.id)
  }
  const collectionsNow = await getAllCollections()
  for (const collection of collectionsNow) {
    if (!importedCollectionIds.has(collection.id)) await deleteCollection(collection.id)
  }
  const bookmarksNow = await getAllBookmarks()
  for (const bookmark of bookmarksNow) {
    if (!importedBookmarkIds.has(bookmark.id)) await deleteBookmark(bookmark.id)
  }
  const sessionsNow = await getAllSessions()
  for (const session of sessionsNow) {
    if (!importedSessionIds.has(session.id)) await deleteSession(session.id)
  }

  const keptBooks = await getAllBooks()
  const keptCollections = await getAllCollections()
  const used = new Set<string>()
  for (const book of keptBooks) if (book.coverId) used.add(book.coverId)
  for (const collection of keptCollections) if (collection.coverId) used.add(collection.coverId)
  const coverKeys = await getAllCoverKeys()
  for (const key of coverKeys) {
    if (!used.has(key)) await deleteCover(key)
  }
  } catch {
    throw new Error('Копия записана, но не удалось убрать записи, которых в ней нет.')
  }
}
