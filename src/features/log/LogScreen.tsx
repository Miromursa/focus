import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../../app/context'
import { Button, Card, Page, SectionTitle, Select } from '../../components/ui'
import { byTime } from '../../db/core'
import { db } from '../../db/db'
import type { Task } from '../../db/types'
import { addDays, datesBetween, isWorkday } from '../../domain/dates'
import { byOrder } from '../../domain/projects'
import { fmtDay, fmtTime } from '../../lib/format'
import { eventText, oneThingLine } from './eventText'
import { FactsView } from './facts'
import { loadFacts } from './factsData'

/** Everything FOCUS recorded, week by week, as plain facts. */
export function LogScreen() {
  const { t, i18n } = useTranslation()
  const { settings, today } = useApp()
  const lng = i18n.language
  const [offset, setOffset] = useState(0)
  const [projectId, setProjectId] = useState('')
  const to = addDays(today, -7 * offset)
  const from = addDays(to, -6)
  const data = useLiveQuery(async () => {
    const [facts, events, days, projects] = await Promise.all([
      loadFacts(from, to, settings),
      db.events.where('date').between(from, to, true, true).toArray(),
      db.days.where('date').between(from, to, true, true).toArray(),
      db.projects.toArray(),
    ])
    const ids = days.map((d) => d.oneThingTaskId).filter((x): x is string => !!x)
    const tasks = (await db.tasks.bulkGet(ids)).filter((x): x is Task => !!x)
    return { facts, events: events.sort(byTime), days, projects: projects.filter((p) => !p.deletedAt).sort(byOrder), tasks }
  }, [from, to, settings])
  if (!data) return null

  const byDate = new Map(data.days.map((d) => [d.date, d]))
  const taskById = new Map(data.tasks.map((x) => [x.id, x]))
  const events = projectId ? data.events.filter((e) => e.projectId === projectId) : data.events
  // Days before setup have nothing to show.
  const dates = datesBetween(from, to)
    .filter((d) => !settings.onboardedDate || d >= settings.onboardedDate)
    .reverse()

  return (
    <Page title={t('log.title')} intro={t('log.intro')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label={t('log.earlier')} onClick={() => setOffset((o) => o + 1)}>
            <ChevronLeft size={18} aria-hidden />
          </Button>
          <span className="tabular-nums">{t('log.range', { from: fmtDay(from, lng, 'short'), to: fmtDay(to, lng, 'short') })}</span>
          <Button size="sm" variant="ghost" aria-label={t('log.later')} disabled={offset === 0} onClick={() => setOffset((o) => o - 1)}>
            <ChevronRight size={18} aria-hidden />
          </Button>
        </div>
        <Select aria-label={t('log.project')} className="w-auto" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">{t('log.allProjects')}</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {!projectId && (
        <Card className="space-y-3">
          <SectionTitle>{t('log.summary')}</SectionTitle>
          <FactsView facts={data.facts} />
        </Card>
      )}

      <section className="space-y-3">
        <SectionTitle>{t('log.days')}</SectionTitle>
        {dates.map((date) => {
          const day = byDate.get(date)
          const dayEvents = events.filter((e) => e.date === date)
          if (projectId && !dayEvents.length) return null
          const task = day?.oneThingTaskId ? taskById.get(day.oneThingTaskId) : undefined
          return (
            <Card key={date} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{fmtDay(date, lng)}</h3>
                <span className="text-sm text-ink-3">{isWorkday(date, settings.workdays) ? t('log.workday') : t('log.dayOff')}</span>
              </div>
              {!projectId && day && (
                <p className="text-ink-2">
                  {oneThingLine(day, t, lng)}
                  {task && <span className="text-ink-3"> “{task.title}”</span>}
                </p>
              )}
              {dayEvents.length ? (
                <ul className="space-y-1 text-sm">
                  {dayEvents.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <span className="w-12 shrink-0 tabular-nums text-ink-3">{fmtTime(e.at, lng)}</span>
                      <span>{eventText(e, t, lng)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">{t('log.noEntries')}</p>
              )}
            </Card>
          )
        })}
      </section>
    </Page>
  )
}
