import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { clearSessions, getAllSessions, putSession } from '@/services/db'
import type { ListeningSession } from '@/types/library'
import { dayKey } from '@/utils/format'

const STORAGE_ERROR = 'Не удалось сохранить данные на устройстве'

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function addLocalDays(timestamp: number, days: number): number {
  const date = new Date(timestamp)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

function sessionSecondsIn(session: ListeningSession, start: number, end: number): number {
  if (!(end > start) || !(session.listenedSeconds > 0)) return 0
  const wall = session.endedAt - session.startedAt
  if (!(wall > 0)) {
    return session.startedAt >= start && session.startedAt < end ? session.listenedSeconds : 0
  }
  const from = Math.max(session.startedAt, start)
  const to = Math.min(session.endedAt, end)
  if (to <= from) return 0
  return session.listenedSeconds * ((to - from) / wall)
}

function secondsInRange(list: ListeningSession[], start: number, end: number): number {
  let total = 0
  for (const session of list) total += sessionSecondsIn(session, start, end)
  return total
}

export const useStatsStore = defineStore('stats', () => {
  const sessions = ref<ListeningSession[]>([])
  const ready = ref(false)

  const totalSeconds = computed(() =>
    sessions.value.reduce((sum, session) => sum + session.listenedSeconds, 0),
  )

  const secondsBetween = computed(() => {
    const list = sessions.value
    return (start: number, end: number) => secondsInRange(list, start, end)
  })

  const secondsByDay = computed(() => {
    const list = sessions.value
    return (start: number, end: number): { date: string; seconds: number }[] => {
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
      const days: { date: string; seconds: number }[] = []
      let cursor = startOfLocalDay(start)
      while (cursor < end) {
        const next = addLocalDays(cursor, 1)
        const sliceStart = Math.max(cursor, start)
        const sliceEnd = Math.min(next, end)
        days.push({
          date: dayKey(cursor),
          seconds: sliceEnd > sliceStart ? secondsInRange(list, sliceStart, sliceEnd) : 0,
        })
        if (next <= cursor) break
        cursor = next
      }
      return days
    }
  })

  async function hydrate(): Promise<void> {
    try {
      const loaded = await getAllSessions()
      sessions.value = loaded.slice().sort((a, b) => b.startedAt - a.startedAt)
      ready.value = true
    } catch {
      throw new Error(STORAGE_ERROR)
    }
  }

  async function record(input: {
    bookId: string
    bookTitle: string
    author: string
    listenedSeconds: number
    position: number
    startedAt: number
    endedAt: number
    playbackRate?: number
  }): Promise<void> {
    if (!Number.isFinite(input.listenedSeconds) || input.listenedSeconds < 1) return
    const session: ListeningSession = {
      id: crypto.randomUUID(),
      bookId: input.bookId,
      bookTitle: input.bookTitle,
      author: input.author,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      listenedSeconds: input.listenedSeconds,
      position: input.position,
    }
    if (typeof input.playbackRate === 'number' && input.playbackRate > 0) {
      session.playbackRate = input.playbackRate
    }
    try {
      await putSession(session)
    } catch {
      throw new Error(STORAGE_ERROR)
    }
    sessions.value = [session, ...sessions.value].sort((a, b) => b.startedAt - a.startedAt)
  }

  async function reset(): Promise<void> {
    try {
      await clearSessions()
    } catch {
      throw new Error(STORAGE_ERROR)
    }
    sessions.value = []
  }

  return { sessions, ready, totalSeconds, secondsBetween, secondsByDay, hydrate, record, reset }
})
