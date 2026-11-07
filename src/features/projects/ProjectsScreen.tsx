import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useApp } from '../../app/context'
import { Button, Card, Empty, Note, Page, Segmented } from '../../components/ui'
import { db } from '../../db/db'
import { moveProject } from '../../db/projects'
import type { Project } from '../../db/types'
import { addDays, toLocalDate } from '../../domain/dates'
import { sessionMinutes } from '../../domain/facts'
import { activeProjects, daysSince, MAX_ACTIVE, projectsWith } from '../../domain/projects'
import { fmtDate, fmtMinutes } from '../../lib/format'

type Tab = 'active' | 'parked' | 'archive'

/** Fact lines under a project. Plain, no colors. */
export function ProjectFacts({ p, focusMinutes }: { p: Project; focusMinutes?: number }) {
  const { t, i18n } = useTranslation()
  const { now, today, settings } = useApp()
  const lng = i18n.language
  const lines: string[] = []
  const unchanged = daysSince(p.nextActionChangedAt, now)
  if (p.status === 'active' && p.nextActionChangedAt && unchanged !== undefined && unchanged >= 5) {
    lines.push(t('projects.factUnchanged', { date: fmtDate(toLocalDate(p.nextActionChangedAt, settings.dayStartHour), lng) }))
  }
  if (p.deadline) {
    lines.push(
      p.accountabilityPerson
        ? t('projects.factDeadline', { date: fmtDate(p.deadline, lng), person: p.accountabilityPerson })
        : t('projects.factDeadlineOnly', { date: fmtDate(p.deadline, lng) }),
    )
  }
  if (p.status === 'parked' && p.reconsiderDate) {
    lines.push(
      p.reconsiderDate <= today
        ? t('projects.factResurfaced', { date: fmtDate(p.reconsiderDate, lng) })
        : t('projects.factReconsider', { date: fmtDate(p.reconsiderDate, lng) }),
    )
  }
  if (focusMinutes) lines.push(t('projects.factFocus', { time: fmtMinutes(focusMinutes, t) }))
  if (!lines.length) return null
  return (
    <ul className="space-y-0.5 text-sm text-ink-3">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  )
}

export function ProjectsScreen() {
  const { t } = useTranslation()
  const { now, today } = useApp()
  const [tab, setTab] = useState<Tab>('active')
  const data = useLiveQuery(async () => {
    const [projects, sessions] = await Promise.all([
      db.projects.toArray(),
      db.sessions.where('date').between(addDays(today, -6), today, true, true).toArray(),
    ])
    return { projects: projects.filter((p) => !p.deletedAt), sessions }
  }, [today])
  if (!data) return null

  const active = activeProjects(data.projects)
  const parked = projectsWith(data.projects, 'parked').sort((a, b) => (a.reconsiderDate ?? '').localeCompare(b.reconsiderDate ?? ''))
  const archive = projectsWith(data.projects, 'dead', 'finished').sort((a, b) => b.statusChangedAt - a.statusChangedAt)
  const focusOf = (id: string) => data.sessions.filter((s) => s.projectId === id).reduce((m, s) => m + sessionMinutes(s, now), 0)

  return (
    <Page
      title={t('projects.title')}
      actions={
        <Link to="/projects/new" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-ink">
          <Plus size={18} aria-hidden />
          {t('projects.new')}
        </Link>
      }
    >
      <Segmented<Tab>
        label={t('projects.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'active', label: `${t('projects.active')} · ${active.length}/${MAX_ACTIVE}` },
          { value: 'parked', label: t('projects.parked') },
          { value: 'archive', label: t('projects.archive') },
        ]}
      />

      {tab === 'active' &&
        (active.length === 0 ? (
          <Empty>{t('projects.emptyActive')}</Empty>
        ) : (
          <ol className="space-y-3">
            {active.map((p, i) => (
              <li key={p.id}>
                <Card className="flex gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Link to={`/projects/${p.id}`} className="block text-lg font-semibold hover:text-accent">
                      {p.name}
                    </Link>
                    {p.nextActionDone ? (
                      <Note>{t('projects.nextActionDone')}</Note>
                    ) : (
                      <p className="text-ink-2">
                        <span className="text-ink-3">{t('projects.nextAction')}: </span>
                        {p.nextAction}
                      </p>
                    )}
                    <ProjectFacts p={p} focusMinutes={focusOf(p.id)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" aria-label={t('projects.up', { name: p.name })} disabled={i === 0} onClick={() => void moveProject(p.id, -1)}>
                      <ChevronUp size={18} aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('projects.down', { name: p.name })}
                      disabled={i === active.length - 1}
                      onClick={() => void moveProject(p.id, 1)}
                    >
                      <ChevronDown size={18} aria-hidden />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        ))}

      {tab === 'parked' &&
        (parked.length === 0 ? (
          <Empty>{t('projects.empty')}</Empty>
        ) : (
          <ul className="space-y-3">
            {parked.map((p) => (
              <li key={p.id}>
                <Card className="space-y-1.5">
                  <Link to={`/projects/${p.id}`} className="block font-semibold hover:text-accent">
                    {p.name}
                  </Link>
                  <ProjectFacts p={p} />
                </Card>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'archive' &&
        (archive.length === 0 ? (
          <Empty>{t('projects.empty')}</Empty>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {archive.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
                  <span>{p.name}</span>
                  <span className="text-sm text-ink-3">{t(`projects.status.${p.status}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </Page>
  )
}
