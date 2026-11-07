import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp, useToast } from '../../app/context'
import { ReasonDialog } from '../../components/dialogs'
import { Button, TextArea } from '../../components/ui'
import { db } from '../../db/db'
import { addOverride } from '../../db/reviews'
import type { LocalDate, OverrideRule } from '../../db/types'
import { addDays, dayStartTs, isWorkday } from '../../domain/dates'
import { sessionMinutes } from '../../domain/facts'
import { dayResult } from '../../domain/oneThing'
import { itemsOf, routinesOn } from '../../domain/routines'
import { fmtDate, fmtDay, fmtMinutes, fmtTime } from '../../lib/format'

/** "Skip for now" on a gate: needs a typed reason, which is logged and shown at the weekly review. */
export function GateSkip({ rule }: { rule: OverrideRule }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="quiet" className="text-sm" onClick={() => setOpen(true)}>
        {t('common.skipForNow')}
      </Button>
      <ReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('rituals.skip.title')}
        body={t('rituals.skip.body')}
        confirmLabel={t('rituals.skip.confirm')}
        onConfirm={async (reason) => {
          await addOverride(rule, reason)
          setOpen(false)
          toast(t('rituals.skip.done'))
        }}
      />
    </>
  )
}

export function BrainDump({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <TextArea
      aria-label={t('rituals.dump.title')}
      minRows={6}
      value={value}
      placeholder={t('rituals.dump.placeholder')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** What happened on a day, as plain facts. */
export function DayFacts({ date }: { date: LocalDate }) {
  const { t, i18n } = useTranslation()
  const { settings } = useApp()
  const lng = i18n.language
  const data = useLiveQuery(async () => {
    const start = dayStartTs(date, settings.dayStartHour)
    const end = start + 86_400_000
    const [day, done, sessions, routines, items, logs] = await Promise.all([
      db.days.get(date),
      db.tasks.where('status').equals('done').filter((x) => !!x.doneAt && x.doneAt >= start && x.doneAt < end).toArray(),
      db.sessions.where('date').equals(date).toArray(),
      db.routines.toArray(),
      db.routineItems.toArray(),
      db.routineLogs.where('date').equals(date).toArray(),
    ])
    const scheduled = routinesOn(date, routines).flatMap((r) => itemsOf(r.id, items))
    return {
      day,
      done: done.filter((x) => x.id !== day?.oneThingTaskId),
      focus: sessions.reduce((m, s) => m + sessionMinutes(s, Date.now()), 0),
      routineTotal: scheduled.length,
      routineDone: logs.filter((l) => !l.deletedAt && scheduled.some((i) => i.id === l.routineItemId)).length,
    }
  }, [date, settings.dayStartHour])
  if (!data) return null
  const result = dayResult(data.day)
  const time = data.day?.doneAt ? fmtTime(data.day.doneAt, lng) : ''
  const oneThingLine = {
    done: t('rituals.facts.oneThingDone', { time }),
    tiny: t('rituals.facts.oneThingTiny', { time }),
    bumped: t('rituals.facts.oneThingBumped'),
    open: t('rituals.facts.oneThingOpen'),
    none: t('rituals.facts.oneThingNone'),
  }[result]
  return (
    <ul className="space-y-2 text-lg">
      <li>{oneThingLine}</li>
      <li>{t('rituals.facts.focus', { time: fmtMinutes(data.focus, t) })}</li>
      {data.routineTotal > 0 && <li>{t('rituals.facts.routine', { done: data.routineDone, total: data.routineTotal })}</li>}
      <li>
        {data.done.length ? (
          <>
            <span>{t('rituals.facts.doneList')}</span>
            <ul className="mt-1 list-inside list-disc text-base text-ink-2">
              {data.done.map((x) => (
                <li key={x.id}>{x.title}</li>
              ))}
            </ul>
          </>
        ) : (
          <span className="text-ink-2">{t('rituals.facts.nothingDone')}</span>
        )}
      </li>
    </ul>
  )
}

/** A short look at a coming day: workday, energy window, rest, deadlines. */
export function Glance({ date }: { date: LocalDate }) {
  const { t, i18n } = useTranslation()
  const { settings } = useApp()
  const lng = i18n.language
  const data = useLiveQuery(async () => {
    const [projects, routines, items] = await Promise.all([db.projects.toArray(), db.routines.toArray(), db.routineItems.toArray()])
    const until = addDays(date, 7)
    return {
      deadlines: projects
        .filter((p) => !p.deletedAt && (p.status === 'active' || p.status === 'parked') && p.deadline && p.deadline >= date && p.deadline <= until)
        .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '')),
      routineCount: routinesOn(date, routines).flatMap((r) => itemsOf(r.id, items)).length,
    }
  }, [date])
  if (!data) return null
  const day = fmtDay(date, lng)
  return (
    <ul className="space-y-2 text-lg">
      <li>{isWorkday(date, settings.workdays) ? t('rituals.glance.workday', { day }) : t('rituals.glance.dayOff', { day })}</li>
      <li>{t('rituals.glance.energy', { from: settings.energyStart, to: settings.energyEnd })}</li>
      <li>{t('rituals.glance.rest', { minutes: settings.restBlockMinutes })}</li>
      {data.routineCount > 0 && <li>{t('rituals.glance.routine', { count: data.routineCount })}</li>}
      <li>
        {data.deadlines.length ? (
          <>
            <span>{t('rituals.glance.deadlines')}</span>
            <ul className="mt-1 list-inside list-disc text-base text-ink-2">
              {data.deadlines.map((p) => (
                <li key={p.id}>
                  {p.name}: {fmtDate(p.deadline!, lng)}
                  {p.accountabilityPerson ? ` (${p.accountabilityPerson})` : ''}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <span className="text-ink-2">{t('rituals.glance.noDeadlines')}</span>
        )}
      </li>
    </ul>
  )
}
