import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useApp, useToast } from '../../app/context'
import { Flow } from '../../components/Flow'
import { Button } from '../../components/ui'
import { markShutdown } from '../../db/days'
import { db } from '../../db/db'
import { captureTasks, splitLines } from '../../db/tasks'
import { nextWorkday } from '../../domain/dates'
import { fmtDay, fmtTime } from '../../lib/format'
import { OneThingPicker } from '../onething/OneThingPicker'
import { BrainDump, DayFacts, Glance } from './shared'

const TOTAL = 5

function EndState({ at }: { at: number }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t('rituals.shutdown.endTitle')}</h1>
      <p className="text-lg text-ink-2">{t('rituals.shutdown.endBody', { time: fmtTime(at, i18n.language) })}</p>
      <Link to="/" className="mt-4 rounded-xl border border-line px-4 py-2.5 hover:bg-muted">
        {t('rituals.shutdown.backToToday')}
      </Link>
    </div>
  )
}

/** About five minutes: brain dump, today in facts, tomorrow's One Thing, a glance ahead, done for today. */
export function ShutdownFlow() {
  const { t, i18n } = useTranslation()
  const { settings, today } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [dump, setDump] = useState('')
  const [busy, setBusy] = useState(false)
  const [rerun, setRerun] = useState(false)
  const day = useLiveQuery(async () => (await db.days.get(today)) ?? null, [today])
  if (day === undefined) return null

  const next = nextWorkday(today, settings.workdays)
  const nextLabel = fmtDay(next, i18n.language)
  const aside = (
    <Button variant="quiet" className="text-sm" onClick={() => nav('/')}>
      {t('common.close')}
    </Button>
  )

  if (day?.shutdownAt && (step === TOTAL || (!rerun && step === 0))) return <EndState at={day.shutdownAt} />

  if (step === 0) {
    return (
      <Flow
        title={t('rituals.dump.title')}
        subtitle={t('rituals.dump.body')}
        step={0}
        total={TOTAL}
        aside={aside}
        busy={busy}
        onNext={async () => {
          setBusy(true)
          const lines = splitLines(dump)
          if (lines.length) {
            await captureTasks(lines, 'shutdown')
            toast(t('rituals.dump.added', { count: lines.length }))
          }
          setDump('')
          setBusy(false)
          setRerun(true)
          setStep(1)
        }}
      >
        <BrainDump value={dump} onChange={setDump} />
      </Flow>
    )
  }

  if (step === 1) {
    return (
      <Flow title={t('rituals.shutdown.todayTitle')} step={1} total={TOTAL} aside={aside} onBack={() => setStep(0)} onNext={() => setStep(2)}>
        <DayFacts date={today} />
      </Flow>
    )
  }

  if (step === 2) {
    return (
      <Flow
        title={t('rituals.shutdown.pickTitle')}
        subtitle={t('rituals.shutdown.pickSubtitle', { day: nextLabel })}
        step={2}
        total={TOTAL}
        aside={aside}
        onBack={() => setStep(1)}
      >
        <OneThingPicker target={next} carryFrom={today} onPicked={() => setStep(3)} />
      </Flow>
    )
  }

  if (step === 3) {
    return (
      <Flow title={t('rituals.shutdown.glanceTitle', { day: nextLabel })} step={3} total={TOTAL} aside={aside} onBack={() => setStep(2)} onNext={() => setStep(4)}>
        <Glance date={next} />
      </Flow>
    )
  }

  return (
    <Flow
      title={t('rituals.shutdown.finishTitle')}
      subtitle={t('rituals.shutdown.finishBody')}
      step={4}
      total={TOTAL}
      aside={aside}
      onBack={() => setStep(3)}
      nextLabel={t('rituals.shutdown.finish')}
      busy={busy}
      onNext={async () => {
        setBusy(true)
        await markShutdown(today)
        setBusy(false)
        setStep(TOTAL)
      }}
    >
      <p className="text-ink-2">{t('today.rest.body', { minutes: settings.restBlockMinutes })}</p>
    </Flow>
  )
}
