let element: HTMLAudioElement | null = null

export function getAudioElement(): HTMLAudioElement {
  if (!element) {
    element = new Audio()
    element.preload = 'metadata'
    element.setAttribute('playsinline', 'true')
  }
  return element
}

export function setSource(url: string): void {
  const audio = getAudioElement()
  audio.src = url
  audio.load()
}
