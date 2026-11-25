import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Actions передаёт BASE_PATH вида /имя-репозитория/.
// Локально переменной нет, и приложение открывается из корня.
function pagesBase(): string {
  const raw = process.env.BASE_PATH?.trim()
  if (!raw || raw === '/') return '/'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const base = pagesBase()

  return {
    base,
    plugins: [
      vue(),
      ...(mode === 'production' ? [] : [vueDevTools()]),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon.svg'],
        manifest: {
          name: 'Моя библиотека',
          short_name: 'Библиотека',
          description: 'Личная библиотека аудиокниг',
          lang: 'ru',
          id: base,
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#f3eee6',
          theme_color: '#5b468f',
          icons: [
            { src: 'favicon.ico', sizes: '48x48', type: 'image/x-icon' },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,svg,webmanifest}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: 'index.html',
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
