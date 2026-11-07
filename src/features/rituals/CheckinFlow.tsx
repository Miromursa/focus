import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp, useToast } from '../../app/context'
import { Flow } from '../../components/Flow'
import { markCheckin } from '../../db/days'
import { captureTasks, splitLines } from '../../db/tasks'
import type { LocalDate } from '../../db/types'
import { fmtDay } from '../../lib/format'
import { OneThingPicker } from '../onething/OneThingPicker'
import { BrainDump, GateSkip, Glance } from './shared'

const TOTAL = 3

/** The shutdown didn't happen, so it happens now, in the morning, before anything else. */
export function CheckinFlow({ missedDate }: { missedDate: LocalDate }) {
  const { t, i18n } = useTranslation()
  const { today } = useApp()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [dump, setDump] = useState('')
  const [busy, setBusy] = useState(false)
  const aside = <GateSkip rule="gate:checkin" />

  if (step === 0) {
    return (
      <Flow
        title={t('rituals.checkin.title')}
        subtitle={t('rituals.checkin.subtitle', { day: fmtDay(missedDate, i18n.language) })}
        step={0}
        total={TOTAL}
        aside={aside}
        busy={busy}
        onNext={async () => {
          setBusy(true)
          const lines = splitLines(dump)
          if (lines.length) {
            await captureTasks(lines, 'checkin')
            toast(t('rituals.dump.added', { count: lines.length }))
          }
          setDump('')
          setBusy(false)
          setStep(1)
        }}
      >
        <p className="text-ink-2">{t('rituals.dump.body')}</p>
        <BrainDump value={dump} onChange={setDump} />
      </Flow>
    )
  }

  if (step === 1) {
    return (
      <Flow title={t('rituals.checkin.pickTitle')} step={1} total={TOTAL} aside={aside} onBack={() => setStep(0)}>
        <OneThingPicker target={today} carryFrom={missedDate} onPicked={() => setStep(2)} />
      </Flow>
    )
  }

  return (
    <Flow
      title={t('rituals.checkin.glanceTitle')}
      step={2}
      total={TOTAL}
      aside={aside}
      onBack={() => setStep(1)}
      nextLabel={t('rituals.checkin.finish')}
      busy={busy}
      onNext={async () => {
        setBusy(true)
        await markCheckin(today)
      }}
    >
      <Glance date={today} />
    </Flow>
  )
}
