export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  const paddedSeconds = secs.toString().padStart(2, '0')
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`
  return `${minutes}:${paddedSeconds}`
}

export function formatSpent(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  if (safe <= 0) return '0 мин'
  const total = Math.max(1, Math.round(safe))
  if (total < 60) return `${total} сек`
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours <= 0) {
    if (secs === 0) return `${minutes} мин`
    return `${minutes} мин ${secs} сек`
  }
  if (minutes === 0) return `${hours} ч`
  return `${hours} ч ${minutes} мин`
}

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function weekRange(now = new Date()): { start: number; end: number } {
  const start = new Date(now.getTime())
  start.setHours(0, 0, 0, 0)
  const weekday = start.getDay()
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1
  start.setDate(start.getDate() - daysFromMonday)
  const end = new Date(start.getTime())
  end.setDate(end.getDate() + 7)
  return { start: start.getTime(), end: end.getTime() }
}

export function monthRange(now = new Date()): { start: number; end: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
  return { start: start.getTime(), end: end.getTime() }
}
