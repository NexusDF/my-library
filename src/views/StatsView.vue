<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLibraryStore } from '@/stores/library'
import { useStatsStore } from '@/stores/stats'
import { bookStatus } from '@/types/library'
import { formatClock, formatSpent, monthRange, weekRange } from '@/utils/format'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const WEEK_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

const libraryStore = useLibraryStore()
const statsStore = useStatsStore()

const resetOpen = ref(false)
const resetting = ref(false)
const resetError = ref('')
const period = ref<'week' | 'month'>('week')
const selectedKey = ref<string | null>(null)
const expandedId = ref<string | null>(null)

const ready = computed(() => Boolean(statsStore.ready && libraryStore.ready))

const bookCounts = computed(() => {
  let finished = 0
  let inProgress = 0
  let unread = 0
  for (const book of libraryStore.books) {
    const status = bookStatus(book)
    if (status === 'finished') finished += 1
    else if (status === 'inProgress') inProgress += 1
    else if (status === 'unread') unread += 1
  }
  return { finished, inProgress, unread }
})

const periodTotals = computed(() => {
  void statsStore.sessions
  const week = weekRange()
  const month = monthRange()
  return {
    weekSeconds: statsStore.secondsBetween(week.start, week.end),
    monthSeconds: statsStore.secondsBetween(month.start, month.end),
  }
})

const chart = computed(() => {
  void statsStore.sessions
  const range = period.value === 'week' ? weekRange() : monthRange()
  const rows = statsStore.secondsByDay(range.start, range.end) ?? []
  const bars =
    period.value === 'week'
      ? rows.map((row) => {
          const date = parseDay(row.date)
          return {
            key: row.date,
            label: weekLabel(date),
            seconds: readSeconds(row.seconds),
            caption: date.toLocaleDateString('ru', { day: 'numeric', month: 'long' }),
          }
        })
      : monthBuckets(range.start, range.end, rows)
  const max = bars.reduce((peak, bar) => Math.max(peak, bar.seconds), 0)
  return {
    max,
    bars: bars.map((bar) => ({
      ...bar,
      height: max > 0 && bar.seconds > 0 ? Math.max(8, (bar.seconds / max) * 100) : 0,
    })),
  }
})

const averageSession = computed(() => {
  void statsStore.sessions
  const range = period.value === 'week' ? weekRange() : monthRange()
  const list = (statsStore.sessions ?? []).filter(
    (session) =>
      session.startedAt >= range.start &&
      session.startedAt < range.end &&
      session.listenedSeconds >= 1,
  )
  if (list.length === 0) return 0
  const total = list.reduce((sum, session) => sum + session.listenedSeconds, 0)
  return total / list.length
})

const selectedBar = computed(
  () => chart.value.bars.find((bar) => bar.key === selectedKey.value) ?? null,
)

const chartSummary = computed(() =>
  chart.value.bars.map((bar) => `${bar.caption}: ${formatSpent(bar.seconds)}`).join(', '),
)

const history = computed(() => {
  void libraryStore.books
  void libraryStore.coverUrls
  const sessions = statsStore.sessions ?? []
  return [...sessions]
    .sort((left, right) => stamp(right.startedAt) - stamp(left.startedAt))
    .map((session) => {
      const book = libraryStore.getBook(session.bookId)
      const cover = book?.coverId ? libraryStore.coverUrl(book.coverId) : null
      const title = session.bookTitle?.trim() || 'Книга'
      return {
        id: session.id,
        title,
        author: session.author?.trim() || 'Автор не указан',
        spent: formatSpent(session.listenedSeconds),
        when: sessionWhen(session.startedAt),
        position: typeof session.position === 'number' ? formatClock(session.position) : '',
        ended: sessionWhen(session.endedAt),
        bookId: session.bookId,
        rate:
          typeof session.playbackRate === 'number' && session.playbackRate > 0
            ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(session.playbackRate)}×`
            : 'Не сохранена',
        cover,
        letter: title.charAt(0).toLocaleUpperCase('ru') || '•',
      }
    })
})

async function confirmReset() {
  if (resetting.value) return
  resetting.value = true
  resetOpen.value = false
  resetError.value = ''
  try {
    await statsStore.reset()
  } catch (caught) {
    resetError.value = messageOf(caught, 'Не удалось сбросить статистику')
  } finally {
    resetting.value = false
  }
}

function setPeriod(next: 'week' | 'month') {
  period.value = next
  selectedKey.value = null
}

function toggleSession(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function toggleBar(key: string) {
  selectedKey.value = selectedKey.value === key ? null : key
}

function parseDay(key: string): Date {
  const [year, month, day] = key.split('-').map((part) => Number(part))
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

function monthBuckets(
  start: number,
  end: number,
  rows: { date: string; seconds: number }[],
) {
  const lastDay = new Date(end - 1).getDate()
  const monthName = new Date(start).toLocaleDateString('ru', { month: 'long' })
  const ranges = [
    { from: 1, to: 7 },
    { from: 8, to: 14 },
    { from: 15, to: 21 },
    { from: 22, to: 28 },
  ]
  if (lastDay > 28) ranges.push({ from: 29, to: lastDay })
  const buckets = ranges.map((range) => ({
    key: `${range.from}-${range.to}`,
    label: `${range.from}–${range.to}`,
    seconds: 0,
    caption: `${range.from}–${range.to} ${monthName}`,
    from: range.from,
    to: range.to,
  }))
  for (const row of rows) {
    const day = parseDay(row.date).getDate()
    const bucket = buckets.find((item) => day >= item.from && day <= item.to)
    if (bucket) bucket.seconds += readSeconds(row.seconds)
  }
  return buckets
}

function weekLabel(date: Date): string {
  const index = date.getDay() === 0 ? 6 : date.getDay() - 1
  return WEEK_LABELS[index] ?? ''
}

function readSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function stamp(value: number | string | Date): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : 0
  }
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

function sessionWhen(value: number | string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ru')
}

function messageOf(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message.trim()) return caught.message.trim()
  return fallback
}
</script>

<template>
  <main class="page">
    <header class="head">
      <h1>Статистика</h1>
    </header>

    <p v-if="!ready" class="status" role="status">Загрузка...</p>

    <template v-else>
      <section class="metrics">
        <article class="metric wide">
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4.5l3 2" stroke-linecap="round" />
            </svg>
          </span>
          <div>
            <p class="metric-label">Общее время</p>
            <p class="metric-value">{{ formatSpent(statsStore.totalSeconds) }}</p>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M6 5.5h9.5A2.5 2.5 0 0 1 18 8v11H8.5A2.5 2.5 0 0 0 6 16.5v-11Z" />
              <path d="M6 16.5h12" />
            </svg>
          </span>
          <div>
            <p class="metric-label">В библиотеке</p>
            <p class="metric-value">{{ libraryStore.books.length }}</p>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M7 12.5 10.2 16 17 8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div>
            <p class="metric-label">Завершено книг</p>
            <p class="metric-value">{{ bookCounts.finished }}</p>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.2 6.2v11.6L18 12 8.2 6.2Z" />
            </svg>
          </span>
          <div>
            <p class="metric-label">В процессе</p>
            <p class="metric-value">{{ bookCounts.inProgress }}</p>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <circle cx="12" cy="12" r="7" />
            </svg>
          </span>
          <div>
            <p class="metric-label">Не начаты</p>
            <p class="metric-value">{{ bookCounts.unread }}</p>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="4.5" y="6" width="15" height="13" rx="2" />
              <path d="M8 4.5v3M16 4.5v3M4.5 10.5h15" stroke-linecap="round" />
            </svg>
          </span>
          <div>
            <p class="metric-label">За неделю</p>
            <p class="metric-value">{{ formatSpent(periodTotals.weekSeconds) }}</p>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="4.5" y="6" width="15" height="13" rx="2" />
              <path d="M8 4.5v3M16 4.5v3" stroke-linecap="round" />
            </svg>
          </span>
          <div>
            <p class="metric-label">За месяц</p>
            <p class="metric-value">{{ formatSpent(periodTotals.monthSeconds) }}</p>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M8 7h8M8 12h8M8 17h5" stroke-linecap="round" />
            </svg>
          </span>
          <div>
            <p class="metric-label">Средний сеанс</p>
            <p class="metric-value">{{ formatSpent(averageSession) }}</p>
            <p class="metric-note">{{ period === 'week' ? 'за неделю' : 'за месяц' }}</p>
          </div>
        </article>
      </section>

      <section class="block" aria-labelledby="chart-title">
        <div class="block-head">
          <h2 id="chart-title">{{ period === 'week' ? 'Время по дням' : 'Время по неделям' }}</h2>
          <div class="switch" role="group" aria-label="Период графика">
            <button type="button" :aria-pressed="period === 'week'" @click="setPeriod('week')">Неделя</button>
            <button type="button" :aria-pressed="period === 'month'" @click="setPeriod('month')">Месяц</button>
          </div>
        </div>
        <p v-if="chart.max === 0" class="flat">
          {{ period === 'week' ? 'На этой неделе прослушиваний пока нет' : 'В этом месяце прослушиваний пока нет' }}
        </p>
        <template v-else>
          <p v-if="selectedBar" class="detail">{{ selectedBar.caption }} · {{ formatSpent(selectedBar.seconds) }}</p>
          <p v-else class="detail hint">Нажмите на столбец, чтобы увидеть время</p>
          <div class="chart-scroll">
            <div
              class="chart"
              :class="{ month: period === 'month' }"
              :style="period === 'month' ? { gridTemplateColumns: `repeat(${chart.bars.length}, minmax(0, 1fr))` } : undefined"
              role="img"
              :aria-label="`Время по дням. ${chartSummary}`"
            >
              <button
                v-for="bar in chart.bars"
                :key="bar.key"
                type="button"
                class="bar-col"
                :aria-pressed="selectedKey === bar.key"
                :aria-label="`${bar.caption}: ${formatSpent(bar.seconds)}`"
                @click="toggleBar(bar.key)"
              >
                <span class="bar-track">
                  <span v-if="bar.seconds > 0" class="bar" :style="{ height: `${bar.height}%` }"></span>
                </span>
                <span class="bar-label">{{ bar.label }}</span>
                <span v-if="period === 'week'" class="bar-time">{{ bar.seconds > 0 ? formatSpent(bar.seconds) : '—' }}</span>
              </button>
            </div>
          </div>
        </template>
      </section>

      <section class="block">
        <h2>История</h2>
        <p v-if="history.length === 0" class="flat">Прослушиваний пока нет.</p>
        <ul v-else class="history">
          <li v-for="session in history" :key="session.id">
            <button
              type="button"
              class="session"
              :aria-expanded="expandedId === session.id"
              @click="toggleSession(session.id)"
            >
              <span class="session-cover">
                <img v-if="session.cover" :src="session.cover" alt="" />
                <span v-else>{{ session.letter }}</span>
              </span>
              <span class="session-copy">
                <span class="session-top">
                  <h3>{{ session.title }}</h3>
                  <span class="spent">{{ session.spent }}<span>сеанс</span></span>
                </span>
                <span class="quiet">{{ session.author }}</span>
                <span v-if="session.when" class="quiet">{{ session.when }}</span>
              </span>
            </button>
            <dl v-if="expandedId === session.id" class="session-details">
              <div>
                <dt>ID книги</dt>
                <dd>{{ session.bookId }}</dd>
              </div>
              <div>
                <dt>Начало</dt>
                <dd>{{ session.when || '—' }}</dd>
              </div>
              <div>
                <dt>Окончание</dt>
                <dd>{{ session.ended || '—' }}</dd>
              </div>
              <div>
                <dt>Длительность сеанса</dt>
                <dd>{{ session.spent }}</dd>
              </div>
              <div>
                <dt>Позиция после сеанса</dt>
                <dd>{{ session.position || '—' }}</dd>
              </div>
              <div>
                <dt>Скорость</dt>
                <dd>{{ session.rate }}</dd>
              </div>
            </dl>
          </li>
        </ul>
      </section>

      <p class="note">Считается только время, пока аудио действительно играет.</p>
      <p v-if="resetError" class="form-error" role="alert">{{ resetError }}</p>
      <button type="button" class="btn danger" :disabled="resetting" @click="resetOpen = true">
        Сбросить статистику
      </button>
    </template>

    <ConfirmDialog
      :open="resetOpen"
      title="Сбросить статистику?"
      message="Часы и история будут удалены. Позиции в книгах останутся."
      confirm-label="Сбросить"
      :danger="true"
      @confirm="confirmReset"
      @cancel="resetOpen = false"
    />
  </main>
</template>

<style scoped>
.page {
  --c-bg: var(--bg, #141318);
  --c-elevated: var(--bg-elevated, #1c1b22);
  --c-soft: var(--bg-soft, #2a2933);
  --c-text: var(--text, #f3efe6);
  --c-muted: var(--text-muted, #9c978e);
  --c-accent: var(--accent, #c4b4e4);
  --c-ink: var(--accent-ink, #1b1524);
  --c-line: var(--line, rgba(243, 239, 230, 0.12));
  --c-danger: var(--danger, #e39494);
  --c-radius: var(--radius, 12px);

  box-sizing: border-box;
  width: min(100%, 960px);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 16px 16px calc(20px + env(safe-area-inset-bottom));
  background: var(--c-bg);
  color: var(--c-text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

.page *,
.page *::before,
.page *::after {
  box-sizing: border-box;
}

.head {
  margin-bottom: 20px;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.25;
}

h2 {
  margin-bottom: 12px;
  font-size: 17px;
  font-weight: 600;
}

.status {
  color: var(--c-muted);
}

.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.metric {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  background: var(--c-elevated);
}

.metric-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--c-accent);
  background: color-mix(in srgb, var(--c-accent) 16%, transparent);
  border-radius: 10px;
}

.metric-icon svg {
  width: 18px;
  height: 18px;
}

.metric.wide {
  grid-column: 1 / -1;
}

.metric-label {
  margin-bottom: 6px;
  color: var(--c-muted);
  font-size: 13px;
}

.metric-value {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.metric.wide .metric-value {
  font-size: 28px;
}

.block {
  margin-top: 28px;
  min-width: 0;
}

.block-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.block-head h2 {
  margin-bottom: 0;
}

.switch {
  display: flex;
  flex: none;
  padding: 3px;
  background: var(--c-soft);
  border-radius: 999px;
}

.switch button {
  min-height: 32px;
  padding: 0 12px;
  color: var(--c-muted);
  font: inherit;
  font-size: 13px;
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.switch button[aria-pressed='true'] {
  color: var(--c-ink);
  background: var(--c-accent);
}

.detail {
  margin-bottom: 10px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.detail.hint {
  color: var(--c-muted);
}

.chart-scroll {
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.flat {
  padding: 18px 16px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  background: var(--c-elevated);
  color: var(--c-muted);
  line-height: 1.45;
}

.chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  min-height: 168px;
}

.chart.month {
  width: 100%;
  min-width: 0;
}

.metric-note {
  margin: 2px 0 0;
  color: var(--c-muted);
  font-size: 12px;
}

.bar-col {
  display: flex;
  min-width: 0;
  padding: 0;
  flex-direction: column;
  align-items: center;
  color: inherit;
  background: transparent;
  border: 0;
}

.bar-col[aria-pressed='true'] .bar-label {
  color: var(--c-text);
  font-weight: 650;
}

.bar-track {
  display: flex;
  align-items: flex-end;
  width: 100%;
  max-width: 28px;
  height: 112px;
  overflow: hidden;
  background: transparent;
  border-bottom: 2px solid var(--c-line);
  border-radius: 0;
}

.bar {
  width: 100%;
  background: var(--c-accent);
  border-radius: 8px 8px 3px 3px;
}

.bar-label,
.bar-time {
  max-width: 100%;
  overflow: hidden;
  color: var(--c-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-label {
  margin-top: 8px;
}

.bar-time {
  font-variant-numeric: tabular-nums;
}

.history {
  margin: 0;
  padding: 0;
  list-style: none;
}

.session {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  width: 100%;
  padding: 14px 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--c-line);
  cursor: pointer;
}

.session-details {
  display: grid;
  gap: 8px;
  margin: 0 0 12px 56px;
}

.session-details div {
  display: grid;
  gap: 2px;
}

.session-details dt {
  color: var(--c-muted);
  font-size: 12px;
}

.session-details dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.session-cover {
  display: grid;
  place-items: center;
  width: 44px;
  height: 62px;
  overflow: hidden;
  color: var(--c-accent);
  font-weight: 650;
  background: color-mix(in srgb, var(--c-accent) 16%, var(--c-soft));
  border: 1px solid var(--c-line);
  border-radius: 8px;
}

.session-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.session-copy {
  min-width: 0;
}

.session-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.session h3 {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.spent {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  color: var(--c-accent);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.spent span {
  color: var(--c-muted);
  font-size: 11px;
  font-weight: 500;
}

.quiet {
  display: block;
  color: var(--c-muted);
  font-size: 13px;
}

.note {
  margin-top: 28px;
  color: var(--c-muted);
  font-size: 13px;
  line-height: 1.45;
}

.form-error {
  margin-top: 12px;
  color: var(--c-danger);
  font-size: 14px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  margin-top: 12px;
  padding: 0 16px;
  border: 1px solid var(--c-danger);
  border-radius: 999px;
  background: transparent;
  color: var(--c-danger);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (min-width: 720px) {
  h1 {
    font-size: 26px;
  }
}
</style>
