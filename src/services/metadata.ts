import { parseBlob, type IPicture } from 'music-metadata'

const UNPLAYABLE = 'Этот формат браузер, скорее всего, не сможет воспроизвести'

const EXTENSION_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
}

const EMPTY_TAGS = {
  title: null,
  author: null,
  narrator: null,
  genre: null,
  cover: null,
} as const

type LegacyCommon = {
  genre?: string[]
  albumartist?: string
}

function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

function declaredMime(file: File): string {
  return file.type.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function audioMimeType(file: File): string {
  const extension = fileExtension(file.name)
  const declared = declaredMime(file)
  if (declared === 'audio/mp4' || extension === 'm4a' || extension === 'm4b') return 'audio/mp4'
  if (declared.startsWith('audio/')) return declared
  return EXTENSION_MIME[extension] ?? ''
}

export function assertPlayable(file: File): void {
  const extension = fileExtension(file.name)
  const declared = declaredMime(file)
  const knownExtension = Object.hasOwn(EXTENSION_MIME, extension)
  if (!knownExtension && !declared.startsWith('audio/')) throw new Error(UNPLAYABLE)
  const mime = audioMimeType(file)
  if (!mime || document.createElement('audio').canPlayType(mime) === '') {
    throw new Error(UNPLAYABLE)
  }
}

function text(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function pictureBlob(picture: IPicture): Blob {
  const buffer = new ArrayBuffer(picture.data.byteLength)
  new Uint8Array(buffer).set(picture.data)
  const type = picture.format.trim() || 'image/jpeg'
  return new Blob([buffer], { type })
}

export async function readTrackMetadata(file: File): Promise<{
  title: string | null
  author: string | null
  narrator: string | null
  genre: string | null
  cover: Blob | null
}> {
  try {
    const metadata = await parseBlob(file)
    const common = metadata.common
    const legacy = common as typeof common & LegacyCommon
    let cover: Blob | null = null
    try {
      const picture = common.picture?.[0]
      if (picture && picture.data.byteLength > 0) cover = pictureBlob(picture)
    } catch {
      cover = null
    }
    return {
      title: text(common.title),
      author: text(common.artist) ?? text(common.albumArtist) ?? text(legacy.albumartist),
      narrator: null,
      genre: text(common.genres?.[0]) ?? text(legacy.genre?.[0]),
      cover,
    }
  } catch {
    return { ...EMPTY_TAGS }
  }
}

export function readDuration(file: Blob, mimeType: string): Promise<number> {
  const source = mimeType && file.type !== mimeType ? new Blob([file], { type: mimeType }) : file
  const url = URL.createObjectURL(source)
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.hidden = true

  return new Promise((resolve) => {
    let settled = false
    let timer = 0

    const finish = (value: number) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('error', onError)
      audio.src = ''
      audio.remove()
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(value) && value > 0 ? value : 0)
    }

    const onLoaded = () => finish(audio.duration)
    const onError = () => finish(0)
    timer = window.setTimeout(() => finish(0), 8000)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('error', onError)
    document.body?.append(audio)
    audio.src = url
  })
}
