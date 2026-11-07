import { useLiveQuery } from 'dexie-react-hooks'
import { Minimize2, Square, Timer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FocusCtx, useApp, useToast, type StartFocus } from '../../app/context'
import { Button } from '../../components/ui'
import { completeOneThing } from '../../db/days'
import { db } from '../../db/db'
import { endSession, extendSession, runningSessions, settleExpiredSessions, startSession } from '../../db/sessions'
import type { FocusSession } from '../../db/types'
import { useNow } from '../../hooks/data'
import { notify, playChime } from '../../lib/browser'
import { fmtCountdown, fmtTime } from '../../lib/format'

const endOf = (s: Pick<FocusSession, 'startedAt' | 'plannedMin'>) => s.startedAt + s.plannedMin * 60_000

function SessionBar({ session, onOpen }: { session: FocusSession; onOpen: () => void }) {
  const { t } = useTranslation()
  const now = useNow(1000)
  const left = fmtCountdown(endOf(session) - now)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('focus.running', { title: session.title, time: left })}
      className="fixed inset-x-0 top-0 z-30 flex h-10 items-center justify-center gap-2 bg-accent px-4 text-sm font-medium text-accent-ink"
    >
      <Timer size={16} aria-hidden />
      <span className="tabular-nums">{left}</span>
      <span className="truncate opacity-90">{session.title}</span>
    </button>
  )
}

function Overlay({
  session,
  finished,
  onClose,
  onKeepGoing,
}: {
  session: FocusSession | null
  finished: FocusSession | null
  onClose: () => void
  onKeepGoing: (s: FocusSession) => void
}) {
  const { t } = useTranslation()
  const { today } = useApp()
  const toast = useToast()
  const now = useNow(1000)
  const ref = useRef<HTMLDialogElement>(null)
  const current = session ?? finished
  const task = useLiveQuery(async () => (current?.taskId ? ((await db.tasks.get(current.taskId)) ?? null) : null), [current?.taskId])
  const day = useLiveQuery(() => db.days.get(today), [today])

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  if (!current) return null
  const isOneThing = !!current.taskId && day?.oneThingTaskId === current.taskId && !day.outcome
  const lowEnergy = !!day?.lowEnergyAt

  return (
    <dialog
      ref={ref}
      aria-label={t('focus.label')}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-bg p-0 text-ink"
    >
      <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-ink-3">{t('focus.label')}</p>
        <h2 className="text-2xl font-semibold">{current.title}</h2>
        {task?.firstStep && <p className="text-ink-2">{t('today.oneThing.firstStep', { step: task.firstStep })}</p>}
        {session ? (
          <>
            <p className="text-7xl font-light tabular-nums sm:text-8xl">{fmtCountdown(endOf(session) - now)}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void extendSession(session.id, 10)}>{t('focus.plus10')}</Button>
              <Button
                onClick={async () => {
                  const minutes = Math.round((Date.now() - session.startedAt) / 60_000)
                  await endSession(session.id, true)
                  toast(t('focus.stoppedEarly', { minutes }))
                  onClose()
                }}
              >
                <Square size={16} aria-hidden />
                {t('focus.stop')}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                <Minimize2 size={16} aria-hidden />
                {t('focus.minimize')}
              </Button>
            </div>
          </>
        ) : (
          finished && (
            <>
              <p className="text-xl">{t('focus.complete', { minutes: Math.round((endOf(finished) - finished.startedAt) / 60_000) })}</p>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
                {isOneThing && lowEnergy && (
                  <Button
                    variant="primary"
                    onClick={async () => {
                      await completeOneThing(today, 'tiny')
                      onClose()
                    }}
                  >
                    {t('focus.tinyDone')}
                  </Button>
                )}
                {isOneThing && (
                  <Button
                    variant={lowEnergy ? 'secondary' : 'primary'}
                    onClick={async () => {
                      await completeOneThing(today, 'done')
                      onClose()
                    }}
                  >
                    {t('focus.oneThingDone')}
                  </Button>
                )}
                <Button onClick={() => onKeepGoing(finished)}>{t('focus.keepGoing')}</Button>
                <Button variant="ghost" onClick={onClose}>
                  {t('focus.stopHere')}
                </Button>
              </div>
            </>
          )
        )}
      </div>
    </dialog>
  )
}

/** Runs the focus timer. Sessions live in the database, so a reload or a closed app never loses one. */
export function FocusProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [overlay, setOverlay] = useState(false)
  const [finished, setFinished] = useState<FocusSession | null>(null)
  const session = useLiveQuery(async () => (await runningSessions())[0] ?? null, [])

  // Close sessions that ran out while the app was closed. Safe to repeat: the second run finds nothing.
  const lng = i18n.language
  useEffect(() => {
    void settleExpiredSessions().then((list) => {
      const last = list.at(-1)
      if (last) toast(t('focus.endedWhileAway', { time: fmtTime(endOf(last), lng) }))
    })
  }, [t, lng, toast])

  const id = session?.id
  const end = session ? endOf(session) : 0
  useEffect(() => {
    if (!id) return
    const timer = window.setTimeout(
      async () => {
        const fresh = await db.sessions.get(id)
        if (!fresh || fresh.endedAt) return
        await endSession(id, false)
        playChime()
        if (document.visibilityState !== 'visible') void notify(t('focus.notifyTitle'), fresh.title)
        setFinished({ ...fresh, endedAt: endOf(fresh) })
        setOverlay(true)
      },
      Math.max(0, end - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [id, end, t])

  const api = useMemo(
    () => ({
      start: async (input: StartFocus) => {
        await startSession(input)
        setFinished(null)
        setOverlay(true)
      },
      open: () => setOverlay(true),
    }),
    [],
  )

  const showBar = !!session && !overlay
  return (
    <FocusCtx.Provider value={api}>
      {showBar && <div className="h-10" aria-hidden />}
      {children}
      {showBar && <SessionBar session={session} onOpen={() => setOverlay(true)} />}
      {overlay && (session || finished) && (
        <Overlay
          session={session ?? null}
          finished={finished}
          onClose={() => {
            setOverlay(false)
            setFinished(null)
          }}
          onKeepGoing={(s) =>
            void api.start({ taskId: s.taskId, projectId: s.projectId, title: s.title, kind: s.kind, plannedMin: 10 })
          }
        />
      )}
    </FocusCtx.Provider>
  )
}
