export const cn = (...classes: (string | false | null | undefined)[]): string => classes.filter(Boolean).join(' ')

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A soft two-note chime. Sound is optional, so failures are ignored. */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const t0 = ctx.currentTime
    ;[660, 880].forEach((freq, i) => {
      const start = t0 + i * 0.18
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.65)
    })
    setTimeout(() => void ctx.close(), 1200)
  } catch {
    // no audio available
  }
}

export async function notify(title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, { body, tag: 'focus-timer', icon: 'pwa-192x192.png' })
    else new Notification(title, { body })
  } catch {
    // notifications are best effort
  }
}

export const isTypingTarget = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
