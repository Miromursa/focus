import { useLiveQuery } from 'dexie-react-hooks'
import { BatteryLow, Check, Play, Wind } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useApp, useFocus, useToast } from '../../app/context'
import { Sheet } from '../../components/dialogs'
import { Button, Card, Field, Note, SectionTitle, TextInput } from '../../components/ui'
import { completeOneThing, markRestTaken, reopenOneThing, setLowEnergy } from '../../db/days'
import { db } from '../../db/db'
import { updateProject } from '../../db/projects'
import { setRoutineMark } from '../../db/routines'
import { completeTask, reopenTask } from '../../db/tasks'
import type { Day, LocalDate, Project, RoutineLog, Settings, Task } from '../../db/types'
import { addDays, dayStartTs, isPastTime, isWorkday, prevWorkday, toLocalDate } from '../../domain/dates'
import { reviewStatus } from '../../domain/gates'
import { activeProjects } from '../../domain/projects'
import { itemsOf, logKey, missedInARow, routinesOn } from '../../domain/routines'
import { cn } from '../../lib/browser'
import { fmtDay, fmtTime } from '../../lib/format'
import { OneThingPicker } from '../onething/OneThingPicker'

async function loadToday(today: LocalDate, s: Settings) {
  const start = dayStartTs(today, s.dayStartHour)
  const [day, open, done, routines, items, logs, rest, projects, last] = await Promise.all([
    db.days.get(today),
    db.tasks.where('status').equals('today').toArray(),
    db.tasks.where('status').equals('done').filter((x) => !!x.doneAt && x.doneAt >= start).toArray(),
    db.routines.toArray(),
    db.routineItems.toArray(),
    db.routineLogs.where('date').between(addDays(today, -14), today, true, true).toArray(),
    db.restActivities.orderBy('order').toArray(),
    db.projects.toArray(),
    db.reviews.orderBy('completedAt').last(),
  ])
  const oneThing = day?.oneThingTaskId ? await db.tasks.get(day.oneThingTaskId) : undefined
  const backlog = await db.tasks.where('status').equals('inbox').filter((x) => !!x.projectId && !x.deletedAt).toArray()
  return {
    day,
    oneThing,
    open: open.filter((x) => !x.deletedAt),
    done,
    routines,
    items,
    logs: logs.filter((l) => !l.deletedAt),
    rest: rest.filter((r) => !r.deletedAt),
    projects: projects.filter((p) => !p.deletedAt),
    backlog,
    lastReviewDate: last?.date,
  }
}

function OneThingCard({ day, task, project, onPick }: { day?: Day; task?: Task; project?: Project; onPick: () => void }) {
  const { t, i18n } = useTranslation()
  const { settings, today } = useApp()
  const focus = useFocus()
  const lng = i18n.language
  const workday = isWorkday(today, settings.workdays)
  const lowEnergy = !!day?.lowEnergyAt

  if (!day?.oneThingTaskId || !task) {
    return (
      <Card className="space-y-4">
        <SectionTitle>{t('today.oneThing.label')}</SectionTitle>
        <p className="text-lg">{workday ? t('today.oneThing.none') : t('today.oneThing.dayOffNone')}</p>
        <Button variant={workday ? 'primary' : 'secondary'} onClick={onPick}>
          {t('today.oneThing.pickNow')}
        </Button>
      </Card>
    )
  }

  if (day.outcome === 'done' || day.outcome === 'tiny') {
    return (
      <Card className="space-y-2 border-accent bg-accent-soft">
        <SectionTitle>{t('today.oneThing.label')}</SectionTitle>
        <p className="text-lg font-medium">{task.title}</p>
        <p className="text-ink-2">
          {t(day.outcome === 'done' ? 'today.oneThing.doneState' : 'today.oneThing.tinyState', { time: day.doneAt ? fmtTime(day.doneAt, lng) : '' })}
        </p>
        <Button variant="quiet" className="text-sm" onClick={() => void reopenOneThing(today)}>
          {t('today.oneThing.undo')}
        </Button>
      </Card>
    )
  }

  if (day.outcome === 'bumped') {
    return (
      <Card className="space-y-2">
        <SectionTitle>{t('today.oneThing.label')}</SectionTitle>
        <p className="text-lg font-medium">{task.title}</p>
        <p className="text-ink-2">
          {day.bumpedTo ? t('today.oneThing.bumpedState', { day: fmtDay(day.bumpedTo, lng, 'short') }) : t('today.oneThing.bumpedKept')}
        </p>
      </Card>
    )
  }

  const start = () => void focus.start({ taskId: task.id, projectId: task.projectId, title: task.title, kind: 'start10', plannedMin: 10 })
  return (
    <Card className="space-y-4 border-accent p-6">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{t('today.oneThing.label')}</SectionTitle>
        <Button variant="quiet" className="text-sm" onClick={onPick}>
          {t('today.oneThing.change')}
        </Button>
      </div>
      <div className="space-y-1.5">
        <p className={cn('font-semibold leading-snug', lowEnergy ? 'text-lg text-ink-2' : 'text-2xl')}>{task.title}</p>
        {project && <p className="text-sm text-ink-3">{project.name}</p>}
      </div>
      {task.firstStep && (
        <p className={cn('rounded-xl bg-muted px-3 py-2', lowEnergy && 'text-xl font-semibold')}>
          {t('today.oneThing.firstStep', { step: task.firstStep })}
        </p>
      )}
      {project?.obstacle && project.ifThenPlan && (
        <p className="text-sm text-ink-2">{t('today.oneThing.ifThen', { obstacle: project.obstacle, plan: project.ifThenPlan })}</p>
      )}
      <p className="text-sm text-ink-3">{t('today.energyHint', { from: settings.energyStart, to: settings.energyEnd })}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={start}>
          <Play size={18} aria-hidden />
          {t('today.oneThing.start')}
        </Button>
        {lowEnergy ? (
          <>
            <Button size="lg" onClick={() => void completeOneThing(today, 'tiny')}>
              {t('today.oneThing.tinyDone')}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => void completeOneThing(today, 'done')}>
              {t('today.oneThing.allDone')}
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={() => void completeOneThing(today, 'done')}>
            <Check size={18} aria-hidden />
            {t('today.oneThing.done')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function NextActionPrompt({ project, backlog }: { project: Project; backlog: Task[] }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  return (
    <Card className="space-y-3">
      <p className="font-medium">{t('today.nextAction.title', { project: project.name })}</p>
      <Field label={t('today.nextAction.body')}>
        {(id) => <TextInput id={id} value={value} placeholder={t('today.nextAction.placeholder')} onChange={(e) => setValue(e.target.value)} />}
      </Field>
      {backlog.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm text-ink-3">{t('today.nextAction.fromList')}</p>
          <div className="flex flex-wrap gap-1.5">
            {backlog.slice(0, 6).map((b) => (
              <button key={b.id} type="button" className="rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-muted" onClick={() => setValue(b.title)}>
                {b.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!value.trim()} onClick={() => void updateProject(project.id, { nextAction: value })}>
          {t('today.nextAction.save')}
        </Button>
        <Button variant="ghost" onClick={() => void updateProject(project.id, { status: 'finished' })}>
          {t('today.nextAction.finished')}
        </Button>
      </div>
    </Card>
  )
}

function Routines({ data, lowEnergy }: { data: Awaited<ReturnType<typeof loadToday>>; lowEnergy: boolean }) {
  const { t } = useTranslation()
  const { settings, today } = useApp()
  const routines = routinesOn(today, data.routines)
  if (!routines.length) return null
  const marks = new Map<string, RoutineLog>(data.logs.map((l) => [l.id, l]))
  const marked = new Set(marks.keys())
  const onboard = settings.onboardedDate ?? today
  return (
    <>
      {routines.map((r) => {
        const items = itemsOf(r.id, data.items)
        if (!items.length) return null
        return (
          <Card key={r.id} className="space-y-3">
            <SectionTitle>{r.anchor || r.name}</SectionTitle>
            <ul className="space-y-2">
              {items.map((item) => {
                const mark = marks.get(logKey(today, item.id))?.mark
                const created = toLocalDate(item.createdAt, settings.dayStartHour)
                const missed = mark ? 0 : missedInARow(item.id, r, marked, today, created > onboard ? created : onboard)
                const useTiny = (lowEnergy || missed >= 2) && !!item.tinyVersion
                const label = useTiny ? item.tinyVersion! : item.title
                return (
                  <li key={item.id} className="space-y-1">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`r-${item.id}`}
                        className="size-5 accent-accent"
                        checked={!!mark}
                        onChange={(e) => void setRoutineMark(today, item.id, e.target.checked ? (useTiny ? 'tiny' : 'done') : null)}
                      />
                      <label htmlFor={`r-${item.id}`} className={cn('flex-1', mark && 'text-ink-3 line-through decoration-line')}>
                        {label}
                        {useTiny && <span className="ml-2 text-sm text-ink-3">({item.title})</span>}
                        {mark === 'tiny' && !useTiny && <span className="ml-2 text-sm text-ink-3">({t('today.routine.tiny')})</span>}
                      </label>
                      {!mark && !useTiny && item.tinyVersion && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('today.routine.markTiny', { text: item.tinyVersion })}
                          onClick={() => void setRoutineMark(today, item.id, 'tiny')}
                        >
                          {t('today.routine.tiny')}
                        </Button>
                      )}
                    </div>
                    {missed > 0 && <p className="pl-8 text-sm text-note-ink">{missed >= 2 ? t('today.routine.missed2') : t('today.routine.missed1')}</p>}
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
    </>
  )
}

export function TodayScreen() {
  const { t, i18n } = useTranslation()
  const { settings, now, today } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const lng = i18n.language
  const data = useLiveQuery(() => loadToday(today, settings), [today, settings.dayStartHour])
  const [picking, setPicking] = useState(false)
  const [lowOpen, setLowOpen] = useState(false)
  const [lowNote, setLowNote] = useState('')
  if (!data) return null

  const { day, oneThing } = data
  const workday = isWorkday(today, settings.workdays)
  const lowEnergy = !!day?.lowEnergyAt
  const oneThingOpen = !!oneThing && !day?.outcome
  const project = oneThing?.projectId ? data.projects.find((p) => p.id === oneThing.projectId) : undefined
  const review = reviewStatus(today, settings, data.lastReviewDate)
  const reviewToday = review.due === today && !review.satisfied
  const shutdownTime = workday && isPastTime(now, settings.shutdownTime, settings.dayStartHour)
  const prompts = activeProjects(data.projects).filter((p) => p.nextActionDone)
  const others = data.open.filter((x) => x.id !== oneThing?.id)
  const restMinutes = settings.restBlockMinutes + (lowEnergy ? 30 : 0)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{fmtDay(today, lng)}</h1>
        <p className="mt-1 text-ink-2">{workday ? t('today.workday') : t('today.dayOff')}</p>
      </header>

      {lowEnergy && (
        <Note className="flex items-center justify-between gap-3">
          <span>{t('today.lowEnergy.on')}</span>
          <button type="button" className="underline underline-offset-4" onClick={() => void setLowEnergy(today, false)}>
            {t('today.lowEnergy.turnOff')}
          </button>
        </Note>
      )}

      <OneThingCard day={day} task={oneThing} project={project} onPick={() => setPicking(true)} />

      {prompts.map((p) => (
        <NextActionPrompt key={p.id} project={p} backlog={data.backlog.filter((b) => b.projectId === p.id)} />
      ))}

      {reviewToday && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t('today.rituals.reviewTitle')}</p>
            <p className="text-sm text-ink-2">{t('today.rituals.reviewBody')}</p>
          </div>
          <Link to="/review" className="rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-ink">
            {t('today.rituals.reviewStart')}
          </Link>
        </Card>
      )}

      {shutdownTime &&
        (day?.shutdownAt ? (
          <p className="px-1 text-ink-2">{t('today.rituals.shutdownDone', { time: fmtTime(day.shutdownAt, lng) })}</p>
        ) : (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{t('today.rituals.shutdownTitle')}</p>
              <p className="text-sm text-ink-2">{t('today.rituals.shutdownBody')}</p>
            </div>
            <Link to="/shutdown" className="rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-ink">
              {t('today.rituals.shutdownStart')}
            </Link>
          </Card>
        ))}

      <Routines data={data} lowEnergy={lowEnergy} />

      <Card className="space-y-3">
        <SectionTitle>{t('today.rest.title')}</SectionTitle>
        <p className="text-ink-2">{t('today.rest.body', { minutes: restMinutes })}</p>
        {data.rest.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm text-ink-3">{t('today.rest.ideas')}</p>
            <div className="flex flex-wrap gap-1.5">
              {data.rest.map((r) => (
                <span key={r.id} className="rounded-lg bg-muted px-2.5 py-1 text-sm">
                  {r.title}
                </span>
              ))}
            </div>
          </div>
        )}
        {day?.restTakenAt ? (
          <p className="text-sm text-ink-3">{t('today.rest.takenAt', { time: fmtTime(day.restTakenAt, lng) })}</p>
        ) : (
          <Button size="sm" onClick={() => void markRestTaken(today)}>
            {t('today.rest.taken')}
          </Button>
        )}
      </Card>

      <details className="group rounded-2xl border border-line bg-surface px-5 py-4" open={others.length > 0 && others.length < 4}>
        <summary className="font-medium">{t('today.other.title')}</summary>
        <div className="mt-3 space-y-3">
          {others.length === 0 && data.done.length === 0 && <p className="text-ink-3">{t('today.other.empty')}</p>}
          <ul className="space-y-2">
            {others.map((x) => (
              <li key={x.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`t-${x.id}`}
                  className="size-5 accent-accent"
                  checked={false}
                  onChange={async () => {
                    await completeTask(x.id, { beforeOneThing: oneThingOpen })
                    if (oneThingOpen) toast(t('today.other.guard'))
                  }}
                />
                <label htmlFor={`t-${x.id}`} className="flex-1">
                  {x.title}
                </label>
              </li>
            ))}
            {data.done
              .filter((x) => x.id !== oneThing?.id)
              .map((x) => (
                <li key={x.id} className="flex items-center gap-3 text-ink-3">
                  <input type="checkbox" id={`t-${x.id}`} className="size-5 accent-accent" checked onChange={() => void reopenTask(x.id)} />
                  <label htmlFor={`t-${x.id}`} className="flex-1 line-through decoration-line">
                    {x.title}
                  </label>
                </li>
              ))}
          </ul>
          <p className="text-sm text-ink-3">{t('today.other.buffer', { minutes: settings.bufferMinutes })}</p>
        </div>
      </details>

      <div className="flex flex-wrap gap-2 pt-1">
        {!lowEnergy && (
          <Button onClick={() => setLowOpen(true)}>
            <BatteryLow size={18} aria-hidden />
            {t('today.lowEnergy.button')}
          </Button>
        )}
        <Button onClick={() => nav('/overwhelm')}>
          <Wind size={18} aria-hidden />
          {t('today.overwhelm')}
        </Button>
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title={t('today.oneThing.changeTitle')} wide>
        <OneThingPicker target={today} carryFrom={prevWorkday(today, settings.workdays)} onPicked={() => setPicking(false)} />
      </Sheet>

      <Sheet open={lowOpen} onClose={() => setLowOpen(false)} title={t('today.lowEnergy.title')}>
        <div className="space-y-4">
          <p className="text-ink-2">{t('today.lowEnergy.body')}</p>
          <Field label={`${t('today.lowEnergy.note')} (${t('common.optional')})`}>
            {(id) => (
              <TextInput id={id} data-autofocus value={lowNote} placeholder={t('today.lowEnergy.notePlaceholder')} onChange={(e) => setLowNote(e.target.value)} />
            )}
          </Field>
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={async () => {
                await setLowEnergy(today, true, lowNote)
                setLowNote('')
                setLowOpen(false)
              }}
            >
              {t('today.lowEnergy.turnOn')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
