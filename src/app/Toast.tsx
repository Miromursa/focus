import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastCtx } from './context'

/** One quiet message at a time. No celebration, just acknowledgement. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMessage(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 3600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-8"
      >
        {message && <div className="max-w-md rounded-2xl bg-ink px-4 py-2.5 text-sm text-bg shadow-lg">{message}</div>}
      </div>
    </ToastCtx.Provider>
  )
}
