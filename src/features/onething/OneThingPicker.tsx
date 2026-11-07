import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../../app/context'
import { Button, Field, Note, Select, TextInput } from '../../components/ui'
import { decideSlide, pickOneThing } from '../../db/days'
import { db } from '../../db/db'
import type { LocalDate, PickedVia, Project, Task } from '../../db/types'
import { addDays } from '../../domain/dates'
import { defaultCandidate, needsSlideDecision } from '../../domain/oneThing'
import { activeProjects } from '../../domain/projects'
import { cn } from '../../lib/browser'
import { fmtDay } from '../../lib/format'

type Selection =
  | { kind: 'task'; task: Task; via: PickedVia; slides: boolean; reason?: string }
  | { kind: 'project'; project: Project; via: PickedVia; reason?: string }
  | { kind: 'new' }

const selKey = (s: Selection | null) => (!s ? '' : s.kind === 'task' ? `t:${s.task.id}` : s.kind === 'project' ? `p:${s.project.id}` : 'new')

function Choice({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition',
        checked ? 'border-accent bg-accent-soft' : 'border-line hover:bg-muted',
      )}
    >
      <input type="radio" className="mt-1 accent-accent" checked={checked} onChange={onSelect} />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

/**
 * Picks the One Thing for `target`. Shows the default first (so there's nothing to deliberate),
 * asks for a tiny first step, and forces a decision on tasks that keep sliding.
 */
export function OneThingPicker({
  target,
  carryFrom,
  submitLabel,
  onPicked,
}: {
  target: LocalDate
  /** The day an unfinished One Thing carries over from. Omit for no carry-over (restart). */
  carryFrom?: LocalDate
  submitLabel?: string
  onPicked: (task: Task) => void
}) {
  const { t, i18n } = useTranslation()
  const { today } = useApp()
  const lng = i18n.language
  const [excluded, setExcluded] = useState<string[]>([])
  const [choosing, setChoosing] = useState(false)
  const [manual, setManual] = useState<Selection | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [firstStep, setFirstStep] = useState<{ key: string; value: string } | null>(null)
  const [slideAnswer, setSlideAnswer] = useState<{ key: string; answer: 'shrink' | 'recommit' } | null>(null)
  const [smaller, setSmaller] = useState('')
  const [busy, setBusy] = useState(false)

  const data = useLiveQuery(async () => {
    const [targetDay, sourceDay, projects, open] = await Promise.all([
      db.days.get(target),
      carryFrom ? db.days.get(carryFrom) : Promise.resolve(undefined),
      db.projects.toArray(),
      db.tasks.where('status').anyOf('today', 'inbox').toArray(),
    ])
    const ids = [targetDay?.oneThingTaskId, sourceDay?.oneThingTaskId].filter((x): x is string => !!x)
    const special = (await db.tasks.bulkGet(ids)).filter((x): x is Task => !!x)
    return {
      targetDay,
      sourceDay,
      projects: projects.filter((p) => !p.deletedAt),
      open: open.filter((x) => !x.deletedAt),
      byId: new Map(special.map((x) => [x.id, x])),
    }
  }, [target, carryFrom])
  if (!data) return null

  const sourceTask = data.sourceDay?.oneThingTaskId ? data.byId.get(data.sourceDay.oneThingTaskId) : undefined
  const candidate = defaultCandidate({
    targetDay: data.targetDay,
    sourceDay: data.sourceDay,
    sourceTask,
    projects: data.projects,
    exclude: excluded,
  })
  const active = activeProjects(data.projects)

  let auto: Selection | null = null
  if (candidate.kind === 'existing') {
    const task = data.byId.get(candidate.taskId)
    if (task) {
      auto = {
        kind: 'task',
        task,
        via: candidate.via,
        slides: false,
        reason: candidate.via === 'bumped' ? t('picker.reasonBumped') : t('picker.reasonExisting'),
      }
    }
  } else if (candidate.kind === 'carry' && sourceTask) {
    auto = {
      kind: 'task',
      task: sourceTask,
      via: 'carried',
      slides: candidate.slides,
      reason: t(candidate.slides ? 'picker.reasonCarried' : 'picker.reasonCarriedTiny', { day: fmtDay(candidate.fromDate, lng, 'short') }),
    }
  } else if (candidate.kind === 'project') {
    const project = data.projects.find((p) => p.id === candidate.projectId)
    if (project) auto = { kind: 'project', project, via: 'default', reason: t('picker.reasonProject', { project: project.name }) }
  }

  const sel = choosing || !auto ? manual : auto
  const key = selKey(sel)
  const prefill = sel?.kind === 'task' ? (sel.task.firstStep ?? '') : ''
  const stepValue = firstStep?.key === key ? firstStep.value : prefill
  const slides = sel?.kind === 'task' ? sel.task.slideCount + (sel.slides ? 1 : 0) : 0
  const slideDue = sel?.kind === 'task' && needsSlideDecision(sel.task, slides)
  const answer = slideAnswer?.key === key ? slideAnswer.answer : null
  const taskProject = sel?.kind === 'task' ? data.projects.find((p) => p.id === sel.task.projectId) : undefined

  const ready =
    !!sel &&
    !!stepValue.trim() &&
    (sel.kind !== 'new' || !!newTitle.trim()) &&
    (!slideDue || (answer === 'recommit' || (answer === 'shrink' && !!smaller.trim())))

  const choose = (s: Selection) => {
    setManual(s)
    setChoosing(true)
  }

  const dropTask = async (decision: 'park' | 'let-go') => {
    if (sel?.kind !== 'task') return
    await decideSlide(sel.task.id, decision, slides, { reconsiderDate: addDays(today, 14) })
    setExcluded((e) => [...e, sel.task.id])
    setManual(null)
    setChoosing(false)
  }

  const submit = async () => {
    if (!sel || !ready) return
    setBusy(true)
    try {
      let task: Task
      const fs = stepValue.trim()
      if (sel.kind === 'task') {
        if (slideDue && answer) {
          await decideSlide(sel.task.id, answer, slides, answer === 'shrink' ? { title: smaller, firstStep: fs } : {})
        }
        task = await pickOneThing({ date: target, via: sel.via, firstStep: fs, taskId: sel.task.id, slide: sel.slides })
      } else if (sel.kind === 'project') {
        task = await pickOneThing({ date: target, via: sel.via, firstStep: fs, fromProjectId: sel.project.id })
      } else {
        task = await pickOneThing({ date: target, via: 'manual', firstStep: fs, newTitle, newProjectId: newProjectId || undefined })
      }
      onPicked(task)
    } finally {
      setBusy(false)
    }
  }

  const otherTasks = data.open
    .filter((x) => !excluded.includes(x.id) && !(x.status === 'inbox' && x.projectId))
    .slice(0, 12)

  return (
    <div className="space-y-5">
      {!choosing && auto ? (
        <div className="rounded-2xl border border-accent bg-accent-soft p-4">
          <p className="text-lg font-semibold">{auto.kind === 'task' ? auto.task.title : auto.kind === 'project' ? auto.project.nextAction : ''}</p>
          <p className="mt-1 text-sm text-ink-2">{auto.reason}</p>
          <Button variant="quiet" className="mt-3 text-sm" onClick={() => setChoosing(true)}>
            {t('picker.chooseOther')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {!auto && <Note>{t('picker.reasonNone')}</Note>}
          {active.some((p) => p.nextAction.trim() && !p.nextActionDone) && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-ink-2">{t('picker.nextActions')}</legend>
              {active
                .filter((p) => p.nextAction.trim() && !p.nextActionDone)
                .map((p) => (
                  <Choice key={p.id} checked={key === `p:${p.id}`} onSelect={() => choose({ kind: 'project', project: p, via: 'manual' })}>
                    <span className="block">{p.nextAction}</span>
                    <span className="block text-sm text-ink-3">{p.name}</span>
                  </Choice>
                ))}
            </fieldset>
          )}
          {otherTasks.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-ink-2">{t('picker.openTasks')}</legend>
              {otherTasks.map((x) => (
                <Choice
                  key={x.id}
                  checked={key === `t:${x.id}`}
                  onSelect={() => choose({ kind: 'task', task: x, via: 'manual', slides: false })}
                >
                  {x.title}
                </Choice>
              ))}
            </fieldset>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-ink-2">{t('picker.somethingElse')}</legend>
            <Choice checked={key === 'new'} onSelect={() => choose({ kind: 'new' })}>
              <TextInput
                aria-label={t('picker.somethingElse')}
                value={newTitle}
                placeholder={t('picker.newPlaceholder')}
                onFocus={() => choose({ kind: 'new' })}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              {key === 'new' && active.length > 0 && (
                <Select
                  aria-label={t('picker.project')}
                  className="mt-2"
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                >
                  <option value="">{t('common.noProject')}</option>
                  {active.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </Choice>
          </fieldset>
          {auto && (
            <Button
              variant="quiet"
              className="text-sm"
              onClick={() => {
                setChoosing(false)
                setManual(null)
              }}
            >
              {t('picker.useDefault')}
            </Button>
          )}
        </div>
      )}

      {slideDue && sel?.kind === 'task' && (
        <div className="space-y-3 rounded-2xl bg-note p-4 text-note-ink">
          <p className="font-medium">{t('picker.slide.title', { count: slides })}</p>
          <p className="text-sm">{t('picker.slide.body')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={answer === 'shrink' ? 'primary' : 'secondary'}
              onClick={() => {
                setSlideAnswer({ key, answer: 'shrink' })
                setSmaller(sel.task.title)
              }}
            >
              {t('picker.slide.shrink')}
            </Button>
            <Button size="sm" variant={answer === 'recommit' ? 'primary' : 'secondary'} onClick={() => setSlideAnswer({ key, answer: 'recommit' })}>
              {t('picker.slide.keep')}
            </Button>
            {taskProject?.status === 'active' && (
              <Button size="sm" onClick={() => void dropTask('park')}>
                {t('picker.slide.park')}
              </Button>
            )}
            <Button size="sm" onClick={() => void dropTask('let-go')}>
              {t('picker.slide.letGo')}
            </Button>
          </div>
          {answer === 'shrink' && (
            <Field label={t('picker.slide.smaller')}>
              {(id) => <TextInput id={id} value={smaller} onChange={(e) => setSmaller(e.target.value)} />}
            </Field>
          )}
        </div>
      )}

      {sel && (
        <Field label={t('picker.firstStep')} hint={t('picker.firstStepHint')}>
          {(id, hintId) => (
            <TextInput
              id={id}
              aria-describedby={hintId}
              value={stepValue}
              onChange={(e) => setFirstStep({ key, value: e.target.value })}
            />
          )}
        </Field>
      )}

      <div className="flex justify-end">
        <Button variant="primary" size="lg" disabled={!ready || busy} onClick={() => void submit()}>
          {submitLabel ?? t('picker.confirm')}
        </Button>
      </div>
    </div>
  )
}
