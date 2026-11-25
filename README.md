# vue-app

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

This project replaces its workspace TypeScript package with [typescript-native-bridge](https://github.com/johnsoncodehk/typescript-native-bridge). Command-line tools use the bridge automatically. To use it in VS Code after installing dependencies, accept the prompt to use the workspace TypeScript version. If the prompt does not appear, run **TypeScript: Select TypeScript Version** and choose **Use Workspace Version**.

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

## Публикация на GitHub Pages

Сборка публикуется workflow `.github/workflows/deploy.yml` при пуше в `main` или `master`. Запуск вручную: вкладка Actions → «Публикация на GitHub Pages» → Run workflow.

Один раз в репозитории на GitHub откройте Settings → Pages → Build and deployment и выберите Source: **GitHub Actions**.

Адрес сайта:

- репозиторий проекта: `https://<пользователь>.github.io/<репозиторий>/`
- репозиторий `<пользователь>.github.io`: `https://<пользователь>.github.io/`

Workflow сам подставляет этот путь в `base` Vite, поэтому маршруты Vue Router, manifest и service worker указывают в подпапку репозитория. Локально `npm run dev` по-прежнему открывает приложение из корня.
