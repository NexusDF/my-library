export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const persist = navigator.storage?.persist?.bind(navigator.storage)
    if (!persist) return false
    return await persist()
  } catch {
    return false
  }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate) return null
    const { usage, quota } = estimate
    if (usage == null || quota == null) return null
    return { usage, quota }
  } catch {
    return null
  }
}

export async function assertRoomFor(bytes: number): Promise<void> {
  const estimate = await estimateStorage()
  if (!estimate) return
  if (estimate.usage + bytes > estimate.quota * 0.98) {
    throw new Error('Недостаточно места в хранилище браузера')
  }
}
