import { createContext, useContext } from 'react'
import type { LocalDate, Settings } from '../db/types'

export interface AppState {
  settings: Settings
  now: number
  today: LocalDate
}

export const AppCtx = createContext<AppState | null>(null)

/** Settings and the current logical day. Available everywhere after setup. */
export function useApp(): AppState {
  const v = useContext(AppCtx)
  if (!v) throw new Error('useApp needs AppCtx')
  return v
}

export const ToastCtx = createContext<(message: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export const CaptureCtx = createContext<{ open: () => void }>({ open: () => {} })
export const useCapture = () => useContext(CaptureCtx)

export interface StartFocus {
  taskId?: string
  projectId?: string
  title: string
  plannedMin?: number
  kind: 'start10' | 'overwhelm'
}

export const FocusCtx = createContext<{ start: (input: StartFocus) => Promise<void>; open: () => void }>({
  start: async () => {},
  open: () => {},
})
export const useFocus = () => useContext(FocusCtx)
