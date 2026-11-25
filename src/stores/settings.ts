import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getSettings, putSettings } from '@/services/db'
import { DEFAULT_SETTINGS, type Settings } from '@/types/library'

const STORAGE_ERROR = 'Не удалось сохранить данные на устройстве'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const ready = ref(false)

  async function hydrate(): Promise<void> {
    try {
      const stored = await getSettings()
      settings.value = { ...DEFAULT_SETTINGS, ...stored }
      ready.value = true
    } catch {
      throw new Error(STORAGE_ERROR)
    }
  }

  async function patch(partial: Partial<Settings>): Promise<void> {
    const next: Settings = { ...settings.value, ...partial }
    try {
      await putSettings(next)
    } catch {
      throw new Error(STORAGE_ERROR)
    }
    settings.value = next
  }

  return { settings, ready, hydrate, patch }
})
