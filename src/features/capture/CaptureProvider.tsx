import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CaptureCtx } from '../../app/context'
import { isTypingTarget } from '../../lib/browser'
import { CaptureSheet } from './CaptureSheet'

/** Capture is reachable from anywhere: the + button or the C key. */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const api = useMemo(() => ({ open: () => setOpen(true) }), [])
  return (
    <CaptureCtx.Provider value={api}>
      {children}
      <CaptureSheet open={open} onClose={() => setOpen(false)} />
    </CaptureCtx.Provider>
  )
}
