import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useApp, useFocus, useToast } from '../../app/context'
import { Flow } from '../../components/Flow'
import { Button, TextInput } from '../../components/ui'
import { markOverwhelm } from '../../db/days'
import { db } from '../../db/db'
import { captureTasks, splitLines } from '../../db/tasks'
import { useNow } from '../../hooks/data'
import { BrainDump } from './shared'

/** For stress spikes: empty the head, pick one tiny step, start ten minutes. */
export function OverwhelmFlow() {
  const { t } = useTranslation()
  const { today } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const focus = useFocus()
  const now = useNow(1000)
  const [startedAt] = useState(() => Date.now())
  const [step, setStep] = useState(0)
  const [dump, setDump] = useState('')
  const [tiny, setTiny] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const oneThing = useLiveQuery(async () => {
    const day = await db.days.get(today)
    if (!day?.oneThingTaskId || day.outcome) return null
    return (await db.tasks.get(day.oneThingTaskId)) ?? null
  }, [today])
  if (oneThing === undefined) return null

  const close = (
    <Button variant="quiet" className="text-sm" onClick={() => nav('/')}>
      {t('common.close')}
    </Button>
  )

  if (step === 0) {
    const left = Math.max(0, 60 - Math.floor((now - startedAt) / 1000))
    return (
      <Flow
        title={t('rituals.overwhelm.title')}
        subtitle={t('rituals.overwhelm.dumpBody')}
        step={0}
        total={2}
        aside={close}
        busy={busy}
        onNext={async () => {
          setBusy(true)
          const lines = splitLines(dump)
          if (lines.length) {
            await captureTasks(lines, 'overwhelm')
            toast(t('rituals.dump.added', { count: lines.length }))
          }
          setBusy(false)
          setStep(1)
        }}
      >
        <p className="text-right text-sm tabular-nums text-ink-3" aria-hidden>
          {t('rituals.overwhelm.secondsLeft', { s: left })}
        </p>
        <BrainDump value={dump} onChange={setDump} />
      </Flow>
    )
  }

  const value = tiny ?? oneThing?.firstStep ?? ''
  return (
    <Flow
      title={t('rituals.overwhelm.stepTitle')}
      subtitle={t('rituals.overwhelm.stepBody')}
      step={1}
      total={2}
      aside={close}
      onBack={() => setStep(0)}
      nextLabel={t('rituals.overwhelm.start')}
      nextDisabled={!value.trim()}
      busy={busy}
      onNext={async () => {
        setBusy(true)
        const linked = !!oneThing && value.trim() === (oneThing.firstStep ?? '').trim()
        await markOverwhelm()
        await focus.start({
          taskId: linked ? oneThing.id : undefined,
          projectId: linked ? oneThing.projectId : undefined,
          title: value.trim(),
          kind: 'overwhelm',
          plannedMin: 10,
        })
        nav('/')
      }}
    >
      <TextInput aria-label={t('rituals.overwhelm.stepTitle')} value={value} placeholder={t('rituals.overwhelm.stepPlaceholder')} onChange={(e) => setTiny(e.target.value)} />
    </Flow>
  )
}
