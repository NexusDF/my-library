<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  title: string
  author: string
  coverUrl: string | null
  progress: number
  again?: boolean
}>()

defineEmits<{
  open: []
  play: []
}>()

const broken = ref(false)

watch(
  () => props.coverUrl,
  () => {
    broken.value = false
  },
)

const clamped = computed(() => {
  if (!Number.isFinite(props.progress)) return 0
  return Math.min(100, Math.max(0, props.progress))
})

const percentLabel = computed(() => Math.round(clamped.value))

const authorLabel = computed(() => props.author.trim() || 'Автор не указан')

const letter = computed(() => {
  const char = props.title.trim().charAt(0)
  return char ? char.toLocaleUpperCase('ru') : '•'
})

const actionLabel = computed(() => (props.again ? 'Прослушать снова' : 'Продолжить'))
</script>

<template>
  <article class="continue">
    <button type="button" class="continue__open" @click="$emit('open')">
      <span class="cover">
        <img v-if="coverUrl && !broken" :src="coverUrl" alt="" @error="broken = true" />
        <span v-else class="monogram" aria-hidden="true">{{ letter }}</span>
      </span>
      <span class="continue__body">
        <span class="continue__title">{{ title }}</span>
        <span class="continue__author">{{ authorLabel }}</span>
        <span class="bar" aria-hidden="true">
          <span class="bar__fill" :style="{ width: `${clamped}%` }" />
        </span>
        <span class="continue__percent">{{ percentLabel }}% прослушано</span>
      </span>
    </button>
    <button type="button" class="play" @click="$emit('play')">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.5 5.8v12.4L18.5 12 8.5 5.8z" fill="currentColor" />
      </svg>
      {{ actionLabel }}
    </button>
  </article>
</template>

<style scoped>
.continue {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.continue__open {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}

.cover {
  display: block;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-soft));
  border: 1px solid var(--line);
  border-radius: 10px;
}

.cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.monogram {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 1.25rem;
  font-weight: 600;
}

.continue__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.continue__title {
  display: -webkit-box;
  overflow: hidden;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.continue__author,
.continue__percent {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.continue__author {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar {
  display: block;
  height: 3px;
  margin-top: 8px;
  overflow: hidden;
  background: var(--line);
  border-radius: 999px;
}

.bar__fill {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
}

.continue__percent {
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}

.play {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  justify-self: start;
  min-height: 40px;
  padding: 0 14px;
  color: var(--accent-ink);
  font-size: 0.88rem;
  font-weight: 650;
  background: var(--accent);
  border: 0;
  border-radius: 999px;
}

.play svg {
  display: block;
  margin-left: 1px;
}
</style>
