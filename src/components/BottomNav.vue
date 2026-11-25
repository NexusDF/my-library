<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const sections: Record<string, readonly string[]> = {
  library: ['library', 'book-new', 'book-edit'],
  collections: ['collections', 'collection'],
  stats: ['stats'],
}

function isCurrent(name: string) {
  const current = route.name
  if (typeof current !== 'string') return false
  return sections[name]?.includes(current) ?? false
}
</script>

<template>
  <nav class="nav" aria-label="Разделы">
    <div class="nav__inner">
      <RouterLink v-slot="{ href, navigate }" :to="{ name: 'library' }" custom>
        <a
          :href="href"
          class="nav__link"
          :class="{ 'is-current': isCurrent('library') }"
          :aria-current="isCurrent('library') ? 'page' : undefined"
          @click="navigate"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 6.2c-1.7-1.1-3.7-1.7-6-1.7H4.5v14.2H6c2.2 0 4.1.6 6 1.6 1.9-1 3.8-1.6 6-1.6h1.5V4.5H18c-2.3 0-4.3.6-6 1.7z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linejoin="round"
            />
            <path d="M12 6.2v14.1" fill="none" stroke="currentColor" stroke-width="1.75" />
          </svg>
          <span>Библиотека</span>
        </a>
      </RouterLink>

      <RouterLink v-slot="{ href, navigate }" :to="{ name: 'collections' }" custom>
        <a
          :href="href"
          class="nav__link"
          :class="{ 'is-current': isCurrent('collections') }"
          :aria-current="isCurrent('collections') ? 'page' : undefined"
          @click="navigate"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4 4.5 8 12 12l7.5-4L12 4z" />
            <path d="m4.5 12 7.5 4 7.5-4" />
            <path d="m4.5 16 7.5 4 7.5-4" />
          </svg>
          <span>Коллекции</span>
        </a>
      </RouterLink>

      <RouterLink v-slot="{ href, navigate }" :to="{ name: 'stats' }" custom>
        <a
          :href="href"
          class="nav__link"
          :class="{ 'is-current': isCurrent('stats') }"
          :aria-current="isCurrent('stats') ? 'page' : undefined"
          @click="navigate"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M4 19.5h16" />
            <path d="M7 19.5v-5" />
            <path d="M12 19.5V7" />
            <path d="M17 19.5v-8" />
          </svg>
          <span>Статистика</span>
        </a>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  box-sizing: border-box;
  height: calc(var(--nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  border-top: 1px solid var(--line);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.nav__inner {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  max-width: 960px;
  height: var(--nav-h);
  margin: 0 auto;
}

.nav__link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  color: var(--text-muted);
  font-size: 0.75rem;
  letter-spacing: 0.01em;
  text-decoration: none;
}

.nav__link svg {
  display: block;
}

.nav__link.is-current {
  color: var(--accent);
  font-weight: 600;
}

@media (hover: hover) {
  .nav__link:hover {
    color: var(--text);
  }

  .nav__link.is-current:hover {
    color: var(--accent);
  }
}
</style>
