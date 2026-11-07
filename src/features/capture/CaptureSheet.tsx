import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp, useToast } from '../../app/context'
import { Sheet } from '../../components/dialogs'
import { Button, TextArea } from '../../components/ui'
import { bumpOneThing, type BumpMode } from '../../db/days'
import { db } from '../../db/db'
import { captureTasks, captureTriaged, splitLines } from '../../db/tasks'
import { nextWorkday } from '../../domain/dates'
import { fmtDay } from '../../lib/format'

type Step = 'input' | 'twoMin' | 'doNow' | 'urgent' | 'bump' | 'noOneThing' | 'conflict'

function CaptureBody({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const { settings, today } = useApp()
  const toast = useToast()
  const [text, setText] = useState('')
  const [step, setStep] = useState<Step>('input')
  const [busy, setBusy] = useState(false)
  const [urgentTitle, setUrgentTitle] = useState('')
  const [conflictTitle, setConflictTitle] = useState('')
  const todayDay = useLiveQuery(() => db.days.get(today), [today])
  const oneThingOpen = !!todayDay?.oneThingTaskId && !todayDay.outcome
  const next = nextWorkday(today, settings.workdays)
  const nextLabel = fmtDay(next, i18n.language, 'short')

  const lines = splitLines(text)
  const single = lines.length === 1 ? lines[0] : ''

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const saveInbox = () =>
    run(async () => {
      if (!lines.length) return
      await captureTasks(lines, 'capture')
      toast(lines.length > 1 ? t('capture.savedMany', { count: lines.length }) : t('capture.saved'))
      onClose()
    })

  const finishUrgent = (mode: BumpMode) =>
    run(async () => {
      const res = await bumpOneThing(today, next, urgentTitle, mode)
      if (res.status === 'conflict') {
        setConflictTitle(res.existingTitle)
        setStep('conflict')
        return
      }
      toast(res.status === 'moved' ? t('capture.urgentToast', { day: nextLabel }) : t('capture.urgentKeptToast', { day: nextLabel }))
      onClose()
    })

  const question = (title: string, hint?: string) => (
    <div className="space-y-2">
      <p className="rounded-xl bg-muted px-3 py-2 text-ink">“{single}”</p>
      <p className="text-lg font-medium">{title}</p>
      {hint && <p className="text-ink-2">{hint}</p>}
    </div>
  )

  if (step === 'input') {
    return (
      <div className="space-y-4">
        <TextArea
          data-autofocus
          aria-label={t('capture.title')}
          minRows={2}
          value={text}
          placeholder={t('capture.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void saveInbox()
            }
          }}
        />
        <p className="text-sm text-ink-3">{lines.length > 1 ? t('capture.triageOneAtATime') : t('capture.hint')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={!single || busy} onClick={() => setStep('twoMin')}>
            {t('capture.triage')}
          </Button>
          <Button variant="primary" disabled={!lines.length || busy} onClick={() => void saveInbox()}>
            {t('capture.save')}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'twoMin') {
    return (
      <div className="space-y-5">
        {question(t('capture.twoMin'), t('capture.twoMinHint'))}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => setStep('urgent')}>{t('capture.twoMinNo')}</Button>
          <Button variant="primary" onClick={() => setStep('doNow')}>
            {t('capture.twoMinYes')}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'doNow') {
    return (
      <div className="space-y-5">
        {question(t('capture.doItNow'), t('capture.doItNowHint'))}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setStep('twoMin')}>
            {t('common.back')}
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await captureTriaged(single, 'two-min')
                toast(t('capture.doneToast'))
                onClose()
              })
            }
          >
            {t('capture.markDone')}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'urgent') {
    return (
      <div className="space-y-5">
        {question(t('capture.urgent'), t('capture.urgentHint'))}
        <p className="italic text-ink-2">{t('capture.urgentProbe')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await captureTriaged(single, 'not-urgent')
                toast(t('capture.saved'))
                onClose()
              })
            }
          >
            {t('capture.notUrgent')}
          </Button>
          <Button variant="primary" onClick={() => setStep(oneThingOpen ? 'bump' : 'noOneThing')}>
            {t('capture.isUrgent')}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'bump') {
    return (
      <div className="space-y-5">
        {question(t('capture.doItNow'), t('capture.bumpBody', { day: nextLabel }))}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setStep('urgent')}>
            {t('common.back')}
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const task = await captureTriaged(single, 'urgent')
                setUrgentTitle(task.title)
                const res = await bumpOneThing(today, next, task.title, 'ask')
                if (res.status === 'conflict') {
                  setConflictTitle(res.existingTitle)
                  setStep('conflict')
                  return
                }
                toast(t('capture.urgentToast', { day: nextLabel }))
                onClose()
              })
            }
          >
            {t('capture.bumpConfirm')}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'noOneThing') {
    return (
      <div className="space-y-5">
        {question(t('capture.doItNow'), t('capture.urgentNoOneThing'))}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setStep('urgent')}>
            {t('common.back')}
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await captureTriaged(single, 'urgent')
                toast(t('capture.urgentAdded'))
                onClose()
              })
            }
          >
            {t('capture.addToToday')}
          </Button>
        </div>
      </div>
    )
  }

  // conflict: the next workday already has a One Thing
  return (
    <div className="space-y-5">
      <p className="text-lg font-medium">{t('capture.conflictTitle', { day: nextLabel, title: conflictTitle })}</p>
      <p className="text-ink-2">{t('capture.conflictBody')}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={() => void finishUrgent('keep')}>
          {conflictTitle}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void finishUrgent('replace')}>
          {todayDay?.oneThingTaskId ? <OneThingTitle id={todayDay.oneThingTaskId} /> : null}
        </Button>
      </div>
    </div>
  )
}

function OneThingTitle({ id }: { id: string }) {
  const task = useLiveQuery(() => db.tasks.get(id), [id])
  return <>{task?.title}</>
}

/** One field, saved to the inbox by default. Triage walks through the urgency test. */
export function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onClose={onClose} title={t('capture.title')}>
      <CaptureBody onClose={onClose} />
    </Sheet>
  )
}
