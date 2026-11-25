import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { getAudioElement, setSource } from '@/services/audioEngine'
import { getAudio } from '@/services/db'
import { useLibraryStore } from '@/stores/library'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { bookStatus } from '@/types/library'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused'

interface SessionSnapshot {
  bookId: string
  bookTitle: string
  author: string
  listenedSeconds: number
  position: number
  duration: number
  startedAt: number
  endedAt: number
  playbackRate: number
}

const METADATA_TIMEOUT_MS = 10_000
const FLUSH_EVERY_SECONDS = 5
const SLEEP_FADE_MS = 3_000

let engineBound = false

function finitePositive(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function isNotAllowed(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError'
}

function isArtworkUrl(url: string): boolean {
  return url.startsWith('blob:') || /^https?:/i.test(url)
}

export const usePlayerStore = defineStore('player', () => {
  const library = useLibraryStore()
  const settings = useSettingsStore()
  const stats = useStatsStore()

  const bookId = ref<string | null>(null)
  const status = ref<PlayerStatus>('idle')
  const position = ref(0)
  const duration = ref(0)
  const error = ref<string | null>(null)
  const sleepMode = ref<'off' | 'minutes' | 'end'>('off')
  const sleepRemaining = ref(0)

  let objectUrl: string | null = null
  let generation = 0
  let playWhenReady = false
  let ignoreMediaEvents = false
  let preserveFinished = false
  let positionReady = false
  let touched = false
  let pendingSeconds = 0
  let playMark: number | null = null
  let sessionStartedAt = 0
  let titleCache = ''
  let authorCache = ''
  let persistQueue: Promise<void> = Promise.resolve()
  let sleepDeadline = 0
  let sleepTimer = 0
  let fadeFrame = 0
  let fading = false
  let baseVolume = 1

  function applyRate(rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) return
    getAudioElement().playbackRate = rate
  }

  function remember(id: string) {
    const book = library.getBook(id)
    if (!book) return book
    titleCache = book.title
    authorCache = book.author
    return book
  }

  function capture(): SessionSnapshot | null {
    let banked = pendingSeconds
    if (playMark !== null) {
      banked += (performance.now() - playMark) / 1000
      playMark = status.value === 'playing' ? performance.now() : null
    }

    let listened = 0
    if (banked >= 1) {
      listened = banked
      pendingSeconds = 0
    } else {
      pendingSeconds = banked
    }

    const id = bookId.value
    if (!id || !positionReady || !touched) return null

    const endedAt = Date.now()
    const startedAt = sessionStartedAt > 0 ? sessionStartedAt : endedAt
    if (listened >= 1) sessionStartedAt = endedAt

    const book = library.getBook(id)
    const savedPosition =
      preserveFinished && book ? book.position : Math.max(0, position.value)
    const savedDuration = finitePositive(duration.value) ?? 0

    return {
      bookId: id,
      bookTitle: book?.title ?? titleCache,
      author: book?.author ?? authorCache,
      listenedSeconds: listened,
      position: Math.max(0, savedPosition),
      duration: savedDuration,
      startedAt,
      endedAt,
      playbackRate: getAudioElement().playbackRate,
    }
  }

  async function writeSnapshot(snapshot: SessionSnapshot) {
    try {
      await library.setProgress(snapshot.bookId, snapshot.position, snapshot.duration)
    } catch {
      // Прогресс не должен отменять запись статистики.
    }
    if (snapshot.listenedSeconds < 1) return
    try {
      await stats.record({
        bookId: snapshot.bookId,
        bookTitle: snapshot.bookTitle,
        author: snapshot.author,
        listenedSeconds: snapshot.listenedSeconds,
        position: snapshot.position,
        startedAt: snapshot.startedAt,
        endedAt: snapshot.endedAt,
        playbackRate: snapshot.playbackRate,
      })
    } catch {
      // Статистика пишется по возможности, воспроизведение продолжается.
    }
  }

  function requestPersist() {
    const snapshot = capture()
    if (!snapshot) return
    persistQueue = persistQueue
      .catch(() => undefined)
      .then(() => writeSnapshot(snapshot))
  }

  function releaseSource() {
    if (fading) {
      if (fadeFrame) cancelAnimationFrame(fadeFrame)
      fadeFrame = 0
      fading = false
      restoreVolume()
      if (sleepMode.value === 'minutes') armSleepTimer()
    }
    const audio = getAudioElement()
    ignoreMediaEvents = true
    try {
      audio.pause()
      if (objectUrl) {
        const url = objectUrl
        objectUrl = null
        audio.removeAttribute('src')
        audio.load()
        URL.revokeObjectURL(url)
      }
    } finally {
      ignoreMediaEvents = false
    }
  }

  function syncPlaybackState() {
    const session = navigator.mediaSession
    if (!session) return
    if (!bookId.value || status.value === 'idle') {
      session.playbackState = 'none'
      return
    }
    session.playbackState = status.value === 'playing' ? 'playing' : 'paused'
  }

  function syncPositionState() {
    const session = navigator.mediaSession
    if (!session?.setPositionState) return
    const dur = finitePositive(duration.value)
    if (dur === null) return
    const pos = Math.min(Math.max(0, position.value), dur)
    const rate = getAudioElement().playbackRate
    try {
      session.setPositionState({
        duration: dur,
        playbackRate: Number.isFinite(rate) && rate > 0 ? rate : 1,
        position: pos,
      })
    } catch {
      return
    }
  }

  function publishMetadata() {
    const session = navigator.mediaSession
    if (!session || typeof MediaMetadata === 'undefined') return
    const id = bookId.value
    if (!id) return
    const book = remember(id)
    if (!book) return

    const artwork: MediaImage[] = []
    const cover = library.coverUrl(book.coverId)
    if (cover && isArtworkUrl(cover)) {
      artwork.push({ src: cover, sizes: '512x512' })
    }

    try {
      session.metadata = new MediaMetadata({
        title: book.title,
        artist: book.author,
        album: book.narrator,
        artwork,
      })
    } catch {
      return
    }
    syncPlaybackState()
  }

  function waitForLibrary(): Promise<void> {
    if (library.ready) return Promise.resolve()
    return new Promise((resolve) => {
      const stop = watch(
        () => library.ready,
        (ready) => {
          if (!ready) return
          stop()
          resolve()
        },
      )
      if (library.ready) {
        stop()
        resolve()
      }
    })
  }

  function loadAndWait(url: string): Promise<boolean> {
    const audio = getAudioElement()
    return new Promise((resolve) => {
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        audio.removeEventListener('loadedmetadata', onReady)
        audio.removeEventListener('error', onFail)
        window.clearTimeout(timer)
        resolve(ok)
      }
      const onReady = () => {
        if (audio.currentSrc && audio.currentSrc !== url) return
        finish(true)
      }
      const onFail = () => {
        if (!audio.error) return
        if (audio.currentSrc && audio.currentSrc !== url) return
        finish(false)
      }
      const timer = window.setTimeout(() => finish(false), METADATA_TIMEOUT_MS)
      audio.addEventListener('loadedmetadata', onReady)
      audio.addEventListener('error', onFail)
      setSource(url)
      if (audio.readyState >= 1) finish(true)
      else if (audio.error) finish(false)
    })
  }

  function onTimeUpdate() {
    if (ignoreMediaEvents) return
    const audio = getAudioElement()
    const time = audio.currentTime
    if (Number.isFinite(time)) position.value = time
    syncPositionState()
    watchSleep(audio)
    if (status.value !== 'playing' || playMark === null) return
    const elapsed = pendingSeconds + (performance.now() - playMark) / 1000
    if (elapsed >= FLUSH_EVERY_SECONDS) requestPersist()
  }

  function onPlay() {
    if (ignoreMediaEvents) return
    touched = true
    status.value = 'playing'
    error.value = null
    preserveFinished = false
    if (playMark === null) {
      playMark = performance.now()
      if (pendingSeconds === 0) sessionStartedAt = Date.now()
    }
    syncPlaybackState()
    syncPositionState()
  }

  function onPause() {
    if (ignoreMediaEvents) return
    if (getAudioElement().ended) return
    status.value = 'paused'
    requestPersist()
    syncPlaybackState()
  }

  function onEnded() {
    if (ignoreMediaEvents) return
    const audio = getAudioElement()
    const dur = finitePositive(audio.duration) ?? finitePositive(duration.value) ?? 0
    if (dur > 0) {
      duration.value = dur
      position.value = dur
    }
    status.value = 'paused'
    preserveFinished = false
    if (sleepMode.value === 'end') cancelSleep()
    requestPersist()
    syncPlaybackState()
    syncPositionState()
  }

  function onSeeked() {
    if (ignoreMediaEvents) return
    const time = getAudioElement().currentTime
    if (Number.isFinite(time)) position.value = time
    syncPositionState()
  }

  function onDurationChange() {
    const next = getAudioElement().duration
    if (Number.isFinite(next) && next > 0) duration.value = next
  }

  function onMediaError() {
    if (ignoreMediaEvents) return
    if (status.value !== 'playing' && status.value !== 'paused') return
    const audio = getAudioElement()
    if (!objectUrl || !audio.error || audio.currentSrc !== objectUrl) return
    error.value = 'Не удалось открыть аудио'
    status.value = 'paused'
    requestPersist()
    syncPlaybackState()
  }

  function onHidden() {
    if (document.visibilityState === 'hidden') requestPersist()
  }

  function onPageHide() {
    requestPersist()
  }

  function bindEngine() {
    if (engineBound) return
    engineBound = true
    const audio = getAudioElement()
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('seeked', onSeeked)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('error', onMediaError)
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide, { capture: true })

    const session = navigator.mediaSession
    if (!session) return
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void play()],
      ['pause', () => pause()],
      ['seekbackward', () => skip(-15)],
      ['seekforward', () => skip(30)],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
            seek(details.seekTime)
          }
        },
      ],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        continue
      }
    }
  }

  async function open(id: string, autoplay: boolean): Promise<void> {
    const audio = getAudioElement()
    if (bookId.value === id && objectUrl && !audio.error) {
      if (autoplay) await play()
      return
    }
    if (bookId.value === id && status.value === 'loading') {
      if (autoplay) playWhenReady = true
      return
    }

    const token = ++generation
    playWhenReady = autoplay
    status.value = 'paused'
    requestPersist()
    touched = false
    pendingSeconds = 0
    playMark = null
    sessionStartedAt = 0
    positionReady = false
    releaseSource()

    bookId.value = id
    status.value = 'loading'
    error.value = null
    position.value = 0
    duration.value = 0
    preserveFinished = false

    const blobTask = getAudio(id).then(
      (blob) => ({ blob, failed: false as const }),
      () => ({ blob: undefined, failed: true as const }),
    )
    await waitForLibrary()
    if (token !== generation) return

    const known = library.getBook(id)
    if (known && bookStatus(known) !== 'finished') {
      position.value = Math.max(0, known.position)
      duration.value = finitePositive(known.duration) ?? 0
    }

    const result = await blobTask
    if (token !== generation) return
    if (result.failed || !result.blob) {
      error.value = result.failed ? 'Не удалось открыть аудио' : 'Аудиофайл не найден'
      status.value = 'idle'
      return
    }

    const url = URL.createObjectURL(result.blob)
    objectUrl = url
    const loaded = await loadAndWait(url)
    if (token !== generation) {
      if (objectUrl === url) releaseSource()
      else URL.revokeObjectURL(url)
      return
    }
    if (!loaded) {
      releaseSource()
      error.value = 'Не удалось открыть аудио'
      status.value = 'idle'
      return
    }

    const book = remember(id)
    const dur = finitePositive(audio.duration) ?? finitePositive(book?.duration ?? 0) ?? 0
    duration.value = dur

    const finished = book ? bookStatus(book) === 'finished' : false
    preserveFinished = finished
    let start = 0
    if (!finished && book && Number.isFinite(book.position)) start = Math.max(0, book.position)
    if (dur > 0) start = Math.min(start, dur)

    try {
      audio.currentTime = start
    } catch {
      // Элемент может ещё не принимать перемотку. Позицию оставляем расчётной.
    }
    position.value = start
    if (start > 1 && audio.currentTime < 1) {
      const retrySeek = () => {
        if (token !== generation || bookId.value !== id) return
        try {
          audio.currentTime = start
        } catch {
          return
        }
        if (Number.isFinite(audio.currentTime)) position.value = audio.currentTime
      }
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) retrySeek()
      else audio.addEventListener('canplay', retrySeek, { once: true })
    }
    applyRate(settings.settings.playbackRate)
    publishMetadata()
    syncPositionState()

    if (token !== generation) return
    pendingSeconds = 0
    playMark = null
    sessionStartedAt = 0
    positionReady = true
    if (!playWhenReady) {
      status.value = 'paused'
      return
    }

    try {
      await audio.play()
    } catch (caught) {
      if (token !== generation) return
      if (isNotAllowed(caught)) error.value = 'Нажмите воспроизведение ещё раз'
      if (status.value === 'loading') status.value = 'paused'
    }
  }

  async function play() {
    if (status.value === 'loading') {
      playWhenReady = true
      return
    }
    if (!objectUrl) {
      const id = bookId.value
      if (id) await open(id, true)
      return
    }

    const audio = getAudioElement()
    const dur = finitePositive(duration.value) ?? finitePositive(audio.duration) ?? 0
    const atEnd =
      audio.ended || (dur > 0 && audio.currentTime >= dur - 0.25)
    if (atEnd) {
      try {
        audio.currentTime = 0
        position.value = 0
      } catch {
        return
      }
    }

    try {
      await audio.play()
    } catch (caught) {
      if (isNotAllowed(caught)) error.value = 'Нажмите воспроизведение ещё раз'
      const playback = status.value as PlayerStatus
      if (audio.paused && playback !== 'loading') status.value = 'paused'
    }
  }

  function pause() {
    playWhenReady = false
    const audio = getAudioElement()
    if (!audio.paused) audio.pause()
  }

  function toggle() {
    if (status.value === 'playing') pause()
    else void play()
  }

  function seek(seconds: number) {
    touched = true
    const audio = getAudioElement()
    const dur =
      finitePositive(duration.value) ?? finitePositive(audio.duration) ?? 0
    const next = Math.min(Math.max(0, seconds), dur)
    preserveFinished = false
    position.value = next
    if (objectUrl) {
      try {
        audio.currentTime = next
      } catch {
        requestPersist()
        return
      }
    }
    syncPositionState()
    requestPersist()
  }

  function skip(deltaSeconds: number) {
    seek(position.value + deltaSeconds)
  }

  function setRate(rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) return
    applyRate(rate)
    const id = bookId.value
    if (!id) {
      void settings.patch({ playbackRate: rate }).catch(() => applyRate(playbackRate.value))
      return
    }
    void library.setPlaybackRate(id, rate).catch(() => applyRate(playbackRate.value))
  }

  function place(id: string, seconds: number) {
    if (bookId.value !== id) return
    const audio = getAudioElement()
    const next = Math.max(0, seconds)
    ignoreMediaEvents = true
    try {
      if (objectUrl) audio.currentTime = next
      position.value = next
    } catch {
      position.value = next
    } finally {
      ignoreMediaEvents = false
    }
    preserveFinished = false
    if (status.value !== 'playing') touched = false
  }

  function unload() {
    cancelSleep()
    requestPersist()
    touched = false
    pendingSeconds = 0
    playMark = null
    sessionStartedAt = 0
    positionReady = false
    releaseSource()
    bookId.value = null
    status.value = 'idle'
    position.value = 0
    duration.value = 0
    error.value = null
  }

  function stopFade() {
    if (fadeFrame) cancelAnimationFrame(fadeFrame)
    fadeFrame = 0
    fading = false
    window.clearTimeout(sleepTimer)
    sleepTimer = 0
  }

  function restoreVolume() {
    const audio = getAudioElement()
    if (baseVolume > 0) audio.volume = baseVolume
  }

  function cancelSleep() {
    stopFade()
    restoreVolume()
    sleepMode.value = 'off'
    sleepRemaining.value = 0
    sleepDeadline = 0
  }

  function finishSleep() {
    stopFade()
    const audio = getAudioElement()
    restoreVolume()
    sleepMode.value = 'off'
    sleepRemaining.value = 0
    sleepDeadline = 0
    if (!audio.paused) audio.pause()
  }

  function beginFade() {
    if (fading) return
    const audio = getAudioElement()
    if (audio.paused) {
      finishSleep()
      return
    }
    if (document.hidden) {
      finishSleep()
      return
    }
    fading = true
    baseVolume = audio.volume > 0 ? audio.volume : 1
    const from = audio.volume
    const started = performance.now()
    const step = (now: number) => {
      if (!fading) return
      const progress = Math.min(1, (now - started) / SLEEP_FADE_MS)
      audio.volume = from * (1 - progress)
      if (progress < 1 && !audio.paused) {
        fadeFrame = requestAnimationFrame(step)
        return
      }
      finishSleep()
    }
    fadeFrame = requestAnimationFrame(step)
  }

  function armSleepTimer() {
    window.clearTimeout(sleepTimer)
    const tick = () => {
      if (sleepMode.value !== 'minutes') return
      const left = sleepDeadline - Date.now()
      sleepRemaining.value = Math.max(0, Math.ceil(left / 1000))
      if (left <= SLEEP_FADE_MS) {
        beginFade()
        return
      }
      sleepTimer = window.setTimeout(tick, 250)
    }
    sleepTimer = window.setTimeout(tick, 250)
  }

  function startSleep(minutes: number) {
    if (!Number.isFinite(minutes) || minutes <= 0) return
    cancelSleep()
    const ms = Math.round(minutes * 60 * 1000)
    sleepMode.value = 'minutes'
    sleepDeadline = Date.now() + ms
    sleepRemaining.value = Math.max(1, Math.round(ms / 1000))
    baseVolume = getAudioElement().volume || 1
    armSleepTimer()
  }

  function startSleepUntilEnd() {
    const audio = getAudioElement()
    const total = finitePositive(audio.duration) ?? finitePositive(duration.value)
    if (!total) return
    const remain = total - audio.currentTime
    if (!Number.isFinite(remain) || remain <= 0.2) return
    cancelSleep()
    sleepMode.value = 'end'
    sleepRemaining.value = Math.max(1, Math.ceil(remain))
    baseVolume = audio.volume || 1
  }

  function watchSleep(audio: HTMLAudioElement) {
    if (sleepMode.value === 'minutes' && sleepDeadline > 0 && Date.now() >= sleepDeadline - SLEEP_FADE_MS) {
      beginFade()
      return
    }
    if (sleepMode.value !== 'end') return
    const total = finitePositive(audio.duration) ?? finitePositive(duration.value)
    if (!total) return
    const remain = total - audio.currentTime
    sleepRemaining.value = Number.isFinite(remain) ? Math.max(0, Math.ceil(remain)) : 0
    if (status.value === 'playing' && Number.isFinite(remain) && remain <= SLEEP_FADE_MS / 1000) beginFade()
  }

  const playbackRate = computed(() => {
    const id = bookId.value
    const book = id ? library.books.find((item) => item.id === id) : undefined
    if (book && typeof book.playbackRate === 'number' && book.playbackRate > 0) return book.playbackRate
    return settings.settings.playbackRate
  })

  bindEngine()

  watch(playbackRate, (rate) => applyRate(rate), { immediate: true })

  watch(
    () => {
      const id = bookId.value
      if (!id) return ''
      const book = library.books.find((item) => item.id === id)
      if (!book) return ''
      const cover = library.coverUrl(book.coverId) ?? ''
      return `${book.title}\0${book.author}\0${book.narrator}\0${cover}`
    },
    (signature) => {
      if (signature) publishMetadata()
    },
  )

  return {
    bookId,
    status,
    position,
    duration,
    error,
    open,
    toggle,
    pause,
    play,
    seek,
    skip,
    setRate,
    place,
    unload,
    playbackRate,
    sleepMode,
    sleepRemaining,
    startSleep,
    startSleepUntilEnd,
    cancelSleep,
  }
})
