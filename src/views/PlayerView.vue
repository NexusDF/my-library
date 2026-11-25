<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBookmarkStore } from '@/stores/bookmarks'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { PLAYBACK_RATES } from '@/types/library'
import { formatClock } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const player = usePlayerStore()
const bookmarks = useBookmarkStore()

const coverFailed = ref(false)
const bookmarkTitle = ref('')
const bookmarkNote = ref('')
const bookmarkError = ref('')
const customMinutes = ref(20)
const savingBookmark = ref(false)
const moreOpen = ref(false)
const aboutOpen = ref(false)
const sheet = ref<'rate' | 'sleep' | 'marks' | null>(null)
const scrubbing = ref(false)
const scrubTo = ref(0)

const routeId = computed(() => {
  const raw = route.params.id
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
})

const book = computed(() => {
  const id = routeId.value
  if (!id) return undefined
  const found = library.books.find((item) => item.id === id)
  return found ?? library.getBook(id)
})

const cover = computed(() => (book.value ? library.coverUrl(book.value.coverId) : null))

const initial = computed(() => {
  const text = book.value?.title.trim() ?? ''
  return text ? text.slice(0, 1).toLocaleUpperCase('ru') : '•'
})

const author = computed(() => book.value?.author.trim() || 'Автор не указан')
const narrator = computed(() => book.value?.narrator.trim() ?? '')
const genre = computed(() => book.value?.genre.trim() ?? '')
const description = computed(() => book.value?.description.trim() ?? '')

const loadingAudio = computed(
  () => player.bookId === routeId.value && player.status === 'loading',
)

const errorText = computed(() => (player.bookId === routeId.value ? player.error : null))

const canSeek = computed(() => player.duration > 0 && player.status !== 'loading')
const sliderMax = computed(() => (player.duration > 0 ? player.duration : 1))
const playLabel = computed(() => (player.status === 'playing' ? 'Пауза' : 'Воспроизвести'))

const shownPosition = computed(() => (scrubbing.value ? scrubTo.value : player.position))

const progressRatio = computed(() => {
  if (sliderMax.value <= 0) return 0
  return Math.min(100, Math.max(0, (shownPosition.value / sliderMax.value) * 100))
})

const rateFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

function formatRate(rate: number): string {
  return `${rateFormat.format(rate)}×`
}

function rateSelected(rate: number): boolean {
  return Math.abs(player.playbackRate - rate) < 0.001
}

const bookBookmarks = computed(() => (routeId.value ? bookmarks.forBook(routeId.value) : []))

const sleepLabel = computed(() => {
  if (player.sleepMode === 'off') return 'Таймер сна'
  if (player.sleepMode === 'end') return `До конца · ${formatClock(player.sleepRemaining)}`
  return formatClock(player.sleepRemaining)
})

function currentPosition(): number {
  if (scrubbing.value) return scrubTo.value
  if (player.bookId === routeId.value && player.duration > 0) return player.position
  return book.value?.position ?? 0
}

async function saveBookmark() {
  const id = routeId.value
  if (!id || savingBookmark.value) return
  savingBookmark.value = true
  bookmarkError.value = ''
  try {
    await bookmarks.add({
      bookId: id,
      title: bookmarkTitle.value,
      note: bookmarkNote.value,
      position: currentPosition(),
    })
    bookmarkTitle.value = ''
    bookmarkNote.value = ''
  } catch (caught) {
    bookmarkError.value = caught instanceof Error ? caught.message : 'Не удалось сохранить закладку'
  } finally {
    savingBookmark.value = false
  }
}

async function removeBookmark(id: string) {
  bookmarkError.value = ''
  try {
    await bookmarks.remove(id)
  } catch (caught) {
    bookmarkError.value = caught instanceof Error ? caught.message : 'Не удалось удалить закладку'
  }
}

function jumpBookmark(position: number) {
  const id = routeId.value
  if (!id) return
  sheet.value = null
  if (player.bookId !== id) {
    void player.open(id, false).then(() => player.seek(position))
    return
  }
  player.seek(position)
}

function startCustomSleep() {
  const minutes = Number(customMinutes.value)
  if (!Number.isFinite(minutes) || minutes < 1) return
  player.startSleep(Math.min(minutes, 720))
  sheet.value = null
}

function chooseRate(rate: number) {
  player.setRate(rate)
  sheet.value = null
}

function chooseSleep(minutes: number) {
  player.startSleep(minutes)
  sheet.value = null
}

function chooseSleepEnd() {
  player.startSleepUntilEnd()
  sheet.value = null
}

function openSheet(next: 'rate' | 'sleep' | 'marks') {
  moreOpen.value = false
  sheet.value = next
}

function closeSheet() {
  sheet.value = null
}

watch(cover, () => {
  coverFailed.value = false
})

watch(
  () => [routeId.value, library.ready] as const,
  ([id, ready]) => {
    if (!id || !ready) return
    if (!library.getBook(id)) return
    const sameBook = player.bookId === id
    const engaged =
      player.status === 'loading' ||
      player.status === 'playing' ||
      player.status === 'paused'
    if (sameBook && engaged) return
    void player.open(id, false)
  },
  { immediate: true },
)

watch(routeId, () => {
  moreOpen.value = false
  aboutOpen.value = false
  sheet.value = null
  scrubbing.value = false
})

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (sheet.value) sheet.value = null
  else moreOpen.value = false
}

watch([sheet, moreOpen], ([nextSheet, menu]) => {
  if (nextSheet || menu) document.addEventListener('keydown', onEscape)
  else document.removeEventListener('keydown', onEscape)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onEscape)
})

function goLibrary() {
  void router.push({ name: 'library' })
}

function editBook() {
  const id = routeId.value
  if (!id) return
  moreOpen.value = false
  void router.push({ name: 'book-edit', params: { id } })
}

function revealAbout() {
  moreOpen.value = false
  aboutOpen.value = true
}

function readSlider(event: Event): number | null {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : null
}

function onScrub(event: Event) {
  const value = readSlider(event)
  if (value === null) return
  scrubbing.value = true
  scrubTo.value = value
}

function commitScrub(event: Event) {
  const value = readSlider(event)
  scrubbing.value = false
  if (value === null) return
  if (Math.abs(value - player.position) < 0.05) return
  player.seek(value)
}
</script>

<template>
  <section class="player">
    <header class="top">
      <button type="button" class="icon-btn" aria-label="К библиотеке" @click="goLibrary">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M14.5 5.5 8 12l6.5 6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div class="top-actions">
        <button type="button" class="icon-btn" aria-label="Закладки" @click="openSheet('marks')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 5.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V6.5a1 1 0 0 1 1-1Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
          </svg>
          <span v-if="bookBookmarks.length" class="badge">{{ bookBookmarks.length }}</span>
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label="Дополнительные действия"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="12" r="1.35" fill="currentColor" />
            <circle cx="12" cy="12" r="1.35" fill="currentColor" />
            <circle cx="18" cy="12" r="1.35" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div v-if="moreOpen" class="popover" role="menu">
        <button type="button" role="menuitem" @click="editBook">Редактировать</button>
        <button v-if="description" type="button" role="menuitem" @click="revealAbout">О книге</button>
      </div>
    </header>

    <p v-if="!library.ready" class="status">Загрузка...</p>
    <p v-else-if="!book" class="status">Книга не найдена</p>

    <div v-else class="body">
      <div class="hero">
        <div class="cover">
          <img v-if="cover && !coverFailed" :src="cover" alt="" @error="coverFailed = true" />
          <span v-else class="monogram" aria-hidden="true">
            <span class="monogram-mark">{{ initial }}</span>
          </span>
        </div>
        <div class="meta">
          <h1>{{ book.title }}</h1>
          <p class="author">{{ author }}</p>
          <p v-if="narrator" class="quiet">{{ narrator }}</p>
          <p v-if="genre" class="quiet">{{ genre }}</p>
          <div v-if="description" class="about">
            <button type="button" :aria-expanded="aboutOpen" @click="aboutOpen = !aboutOpen">
              О книге
              <svg viewBox="0 0 24 24" aria-hidden="true" :class="{ open: aboutOpen }">
                <path
                  d="m6.5 9.5 5.5 5.5 5.5-5.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <p v-if="aboutOpen">{{ description }}</p>
          </div>
        </div>
      </div>

      <div class="controls">
        <p v-if="loadingAudio" class="status" aria-live="polite">Открываем аудио...</p>
        <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>

        <div class="timeline">
          <span>{{ formatClock(shownPosition) }}</span>
          <input
            type="range"
            :min="0"
            :max="sliderMax"
            step="0.1"
            :value="shownPosition"
            :disabled="!canSeek"
            :style="{ '--progress': `${progressRatio}%` }"
            aria-label="Позиция воспроизведения"
            aria-valuemin="0"
            :aria-valuemax="Math.round(sliderMax)"
            :aria-valuenow="Math.round(shownPosition)"
            :aria-valuetext="formatClock(shownPosition)"
            @input="onScrub"
            @change="commitScrub"
            @pointerup="commitScrub"
            @keyup="commitScrub"
          />
          <span>{{ formatClock(player.duration) }}</span>
        </div>

        <div class="transport">
          <button
            type="button"
            class="skip"
            aria-label="Назад на 15 секунд"
            :disabled="!canSeek"
            @click="player.skip(-15)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M8.2 8.2 4.8 12l3.4 3.8"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M19 12a6.2 6.2 0 1 0-1.6 4.2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              />
            </svg>
            <span>15 сек</span>
          </button>
          <button type="button" class="play" :aria-label="playLabel" @click="player.toggle()">
            <svg v-if="player.status === 'playing'" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 5.2h3.2v13.6H7V5.2Zm6.8 0H17v13.6h-3.2V5.2Z" fill="currentColor" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8.2 5.4v13.2L18.4 12 8.2 5.4Z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            class="skip"
            aria-label="Вперёд на 30 секунд"
            :disabled="!canSeek"
            @click="player.skip(30)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15.8 8.2 19.2 12l-3.4 3.8"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M5 12a6.2 6.2 0 1 1 1.6 4.2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              />
            </svg>
            <span>30 сек</span>
          </button>
        </div>

        <button type="button" class="speed" @click="openSheet('rate')">
          <span>Скорость воспроизведения</span>
          <strong>{{ formatRate(player.playbackRate) }}</strong>
        </button>

        <div class="tools">
          <button type="button" class="tool" :class="{ live: player.sleepMode !== 'off' }" @click="openSheet('sleep')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M8 4.8h.2A7.2 7.2 0 1 0 19 15.6 6.2 6.2 0 0 1 8 4.8Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linejoin="round"
              />
            </svg>
            <span>{{ sleepLabel }}</span>
          </button>
          <button type="button" class="tool" @click="openSheet('marks')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 5.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V6.5a1 1 0 0 1 1-1Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linejoin="round"
              />
            </svg>
            <span>Закладки</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="sheet" class="shade" @click.self="closeSheet">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="sheet === 'rate' ? 'Скорость воспроизведения' : sheet === 'sleep' ? 'Таймер сна' : 'Закладки'"
      >
        <div class="sheet-head">
          <h2>
            {{
              sheet === 'rate' ? 'Скорость воспроизведения' : sheet === 'sleep' ? 'Таймер сна' : 'Закладки'
            }}
          </h2>
          <button type="button" class="icon-btn" aria-label="Закрыть" @click="closeSheet">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m7 7 10 10M17 7 7 17"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <div v-if="sheet === 'rate'" class="rate-list" role="listbox" aria-label="Скорость воспроизведения">
          <button
            v-for="rate in PLAYBACK_RATES"
            :key="rate"
            type="button"
            role="option"
            :aria-selected="rateSelected(rate)"
            :class="{ selected: rateSelected(rate) }"
            @click="chooseRate(rate)"
          >
            {{ formatRate(rate) }}
          </button>
        </div>

        <div v-else-if="sheet === 'sleep'" class="sleep-list">
          <p v-if="player.sleepMode !== 'off'" class="sheet-note">
            Осталось {{ formatClock(player.sleepRemaining) }}
          </p>
          <button type="button" @click="chooseSleep(15)">15 минут</button>
          <button type="button" @click="chooseSleep(30)">30 минут</button>
          <button type="button" @click="chooseSleep(45)">45 минут</button>
          <button type="button" @click="chooseSleep(60)">60 минут</button>
          <button type="button" :disabled="player.duration <= 0" @click="chooseSleepEnd">До конца файла</button>
          <form class="custom" @submit.prevent="startCustomSleep">
            <label>
              <span>Своё время, минуты</span>
              <input v-model.number="customMinutes" type="number" min="1" max="720" step="1" />
            </label>
            <button type="submit">Запустить</button>
          </form>
          <button v-if="player.sleepMode !== 'off'" type="button" class="quiet-btn" @click="player.cancelSleep()">
            Отменить таймер
          </button>
        </div>

        <div v-else class="marks-panel">
          <form class="custom" @submit.prevent="saveBookmark">
            <label>
              <span>Название</span>
              <input v-model="bookmarkTitle" type="text" maxlength="80" placeholder="Закладка" />
            </label>
            <label>
              <span>Заметка</span>
              <textarea v-model="bookmarkNote" rows="2" maxlength="500" placeholder="Необязательно"></textarea>
            </label>
            <button type="submit" :disabled="savingBookmark">На текущей позиции</button>
          </form>
          <p v-if="bookmarkError" class="error" role="alert">{{ bookmarkError }}</p>
          <p v-if="bookBookmarks.length === 0" class="sheet-note">Закладок пока нет.</p>
          <ul v-else class="marks">
            <li v-for="mark in bookBookmarks" :key="mark.id">
              <button type="button" class="mark-jump" @click="jumpBookmark(mark.position)">
                <span>{{ mark.title }}</span>
                <span>{{ formatClock(mark.position) }}</span>
              </button>
              <p v-if="mark.note">{{ mark.note }}</p>
              <button type="button" class="quiet-btn" @click="removeBookmark(mark.id)">Удалить</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.player {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  box-sizing: border-box;
  padding:
    max(8px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(12px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  color: var(--text);
}

.top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
}

.top-actions {
  display: flex;
  gap: 4px;
}

.icon-btn,
.skip,
.play,
.speed,
.tool,
.about button,
.popover button,
.sheet button {
  touch-action: manipulation;
}

.icon-btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  color: var(--text);
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.icon-btn svg,
.skip svg,
.play svg,
.tool svg,
.about svg {
  width: 22px;
  height: 22px;
}

.icon-btn:active,
.skip:active,
.play:active,
.speed:active,
.tool:active {
  transform: scale(0.96);
}

.badge {
  position: absolute;
  top: 6px;
  right: 4px;
  min-width: 16px;
  padding: 0 4px;
  color: var(--accent-ink);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  background: var(--accent);
  border-radius: 999px;
}

.popover {
  position: absolute;
  top: calc(100% - 4px);
  right: 0;
  z-index: 5;
  display: grid;
  min-width: 180px;
  padding: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 8%, transparent);
}

.popover button {
  min-height: 44px;
  padding: 0 12px;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 10px;
}

.popover button:hover {
  background: var(--bg-soft);
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  width: min(100%, 440px);
  margin: 0 auto;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-width: 0;
  padding-top: 4px;
}

.cover {
  width: clamp(132px, min(62vw, 28dvh), 248px);
  aspect-ratio: 2 / 3;
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--text) 7%, transparent);
}

.cover img,
.monogram {
  display: block;
  width: 100%;
  height: 100%;
}

.cover img {
  object-fit: cover;
}

.monogram {
  display: grid;
  place-items: center;
  color: var(--accent);
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 58%),
    color-mix(in srgb, var(--accent) 10%, var(--bg-soft));
}

.monogram-mark {
  display: grid;
  place-items: center;
  width: 42%;
  aspect-ratio: 1;
  font-size: 1.6rem;
  font-weight: 650;
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
  border: 1px solid var(--line);
  border-radius: 50%;
}

.meta {
  width: 100%;
  min-width: 0;
  text-align: center;
}

h1 {
  margin: 0;
  font-size: 1.28rem;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.author {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 0.98rem;
}

.quiet {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 0.86rem;
}

.about {
  margin-top: 10px;
}

.about button {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  min-height: 36px;
  padding: 0 8px;
  color: var(--accent);
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.about svg {
  width: 16px;
  height: 16px;
  transition: transform 160ms ease;
}

.about svg.open {
  transform: rotate(180deg);
}

.about p {
  margin: 4px 0 0;
  color: var(--text);
  font-size: 0.92rem;
  line-height: 1.5;
  text-align: left;
  white-space: pre-wrap;
}

.controls {
  display: grid;
  gap: 14px;
  width: 100%;
}

.status {
  margin: 0;
  color: var(--text-muted);
  text-align: center;
}

.error {
  margin: 0;
  color: var(--danger);
  text-align: center;
}

.timeline {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

input[type='range'] {
  width: 100%;
  height: 28px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

input[type='range']:disabled {
  cursor: default;
  opacity: 0.45;
}

input[type='range']::-webkit-slider-runnable-track {
  height: 4px;
  background: linear-gradient(
    to right,
    var(--accent) var(--progress, 0%),
    var(--bg-soft) var(--progress, 0%)
  );
  border-radius: 999px;
}

input[type='range']::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  margin-top: -6px;
  appearance: none;
  background: var(--accent);
  border: 0;
  border-radius: 50%;
}

input[type='range']::-moz-range-track {
  height: 4px;
  background: var(--bg-soft);
  border: 0;
  border-radius: 999px;
}

input[type='range']::-moz-range-progress {
  height: 4px;
  background: var(--accent);
  border-radius: 999px;
}

input[type='range']::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--accent);
  border: 0;
  border-radius: 50%;
}

.transport {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  justify-items: center;
}

.skip,
.play {
  padding: 0;
  border-radius: 50%;
}

.skip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.play {
  display: grid;
  place-items: center;
}

.skip {
  width: 76px;
  height: 76px;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
}

.skip span {
  margin-top: -2px;
  font-size: 0.68rem;
  letter-spacing: 0.01em;
}

.skip svg {
  width: 22px;
  height: 22px;
}

.skip:disabled {
  opacity: 0.4;
}

.play {
  width: 84px;
  height: 84px;
  color: var(--accent-ink);
  background: var(--accent);
  border: 0;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 28%, transparent);
}

.play svg {
  width: 30px;
  height: 30px;
}

.speed,
.tool {
  display: flex;
  align-items: center;
  min-height: 46px;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.speed {
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
}

.speed span,
.tool span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.speed strong {
  flex: none;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.tools {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tool {
  justify-content: center;
  gap: 8px;
  min-width: 0;
  padding: 0 10px;
  font-size: 0.92rem;
}

.tool svg {
  flex: none;
  width: 18px;
  height: 18px;
}

.tool.live {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}

.shade {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  align-items: end;
  background: color-mix(in srgb, #1f1c18 32%, transparent);
}

.sheet {
  width: min(100%, 520px);
  max-height: min(78dvh, 640px);
  margin: 0 auto;
  padding:
    8px 16px
    max(16px, env(safe-area-inset-bottom));
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 20px 20px 0 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sheet-head h2 {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 650;
}

.rate-list,
.sleep-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.rate-list {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.rate-list button,
.sleep-list > button,
.custom button,
.quiet-btn {
  min-height: 44px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.rate-list button.selected {
  color: var(--accent-ink);
  background: var(--accent);
  border-color: transparent;
}

.sheet-note {
  margin: 0 0 8px;
  color: var(--text-muted);
}

.custom {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.custom label {
  display: grid;
  gap: 4px;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.custom input,
.custom textarea {
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.marks {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.marks li {
  padding: 10px 0;
  border-top: 1px solid var(--line);
}

.mark-jump {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 0;
  text-align: left;
  background: transparent;
  border: 0;
}

.quiet-btn {
  padding: 0 12px;
  color: var(--text-muted);
}

.icon-btn:focus-visible,
.skip:focus-visible,
.play:focus-visible,
.speed:focus-visible,
.tool:focus-visible,
.popover button:focus-visible,
.sheet button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-height: 700px) {
  .body {
    gap: 10px;
  }

  .hero {
    gap: 10px;
  }

  .cover {
    width: clamp(112px, min(46vw, 24dvh), 200px);
  }

  h1 {
    font-size: 1.12rem;
  }

  .controls {
    gap: 8px;
  }

  .skip {
    width: 68px;
    height: 68px;
  }

  .play {
    width: 74px;
    height: 74px;
  }
}

@media (min-width: 900px) {
  .body {
    display: grid;
    grid-template-columns: minmax(220px, 300px) minmax(320px, 440px);
    align-items: center;
    justify-content: center;
    width: min(100%, 920px);
    gap: 48px;
  }

  .hero {
    align-self: center;
  }

  .cover {
    width: min(280px, 36dvh);
  }

  .meta {
    text-align: left;
  }

  .about p {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .about svg,
  .icon-btn,
  .skip,
  .play,
  .speed,
  .tool {
    transition: none;
  }
}
</style>
