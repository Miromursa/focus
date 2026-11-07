import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { useApp, useToast } from '../../app/context'
import { Sheet } from '../../components/dialogs'
import { Button, Card, Field, Note, Page, Segmented, SectionTitle, TextInput } from '../../components/ui'
import { byTime } from '../../db/core'
import { db } from '../../db/db'
import { createProject, RuleError, updateProject, type MakeRoom, type ProjectInput } from '../../db/projects'
import type { Project, ProjectStatus } from '../../db/types'
import { addDays } from '../../domain/dates'
import { activeProjects, validateProject, wouldExceedActive } from '../../domain/projects'
import { cn } from '../../lib/browser'
import { fmtTimestamp } from '../../lib/format'
import { eventText } from '../log/eventText'
import { ProjectFacts } from './ProjectsScreen'

const blank: ProjectInput = { name: '', status: 'active', nextAction: '' }

function toInput(p: Project): ProjectInput {
  return {
    name: p.name,
    status: p.status,
    nextAction: p.nextAction,
    goal: p.goal ?? '',
    deadline: p.deadline ?? '',
    accountabilityPerson: p.accountabilityPerson ?? '',
    reconsiderDate: p.reconsiderDate ?? '',
    obstacle: p.obstacle ?? '',
    ifThenPlan: p.ifThenPlan ?? '',
  }
}

/** Picks which Active project gets parked so another can become Active. */
export function MakeRoomSheet({
  open,
  onClose,
  exceptId,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  exceptId?: string
  onConfirm: (room: MakeRoom) => Promise<void>
}) {
  const { t } = useTranslation()
  const { today } = useApp()
  const active = useLiveQuery(async () => activeProjects(await db.projects.toArray()).filter((p) => p.id !== exceptId), [exceptId])
  const [parkId, setParkId] = useState('')
  const [date, setDate] = useState(addDays(today, 14))
  return (
    <Sheet open={open} onClose={onClose} title={t('projects.room.title')}>
      <div className="space-y-4">
        <p className="text-ink-2">{t('projects.room.body')}</p>
        <div className="space-y-2" role="radiogroup" aria-label={t('projects.room.title')}>
          {active?.map((p) => (
            <label key={p.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5', parkId === p.id ? 'border-accent bg-accent-soft' : 'border-line')}>
              <input type="radio" className="accent-accent" checked={parkId === p.id} onChange={() => setParkId(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
        <Field label={t('projects.reconsider')}>{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <div className="flex justify-end">
          <Button variant="primary" disabled={!parkId || !date} onClick={() => void onConfirm({ parkId, reconsiderDate: date })}>
            {t('projects.room.confirm')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function EditorForm({ project, all }: { project: Project | null; all: Project[] }) {
  const { t, i18n } = useTranslation()
  const { today } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState<ProjectInput>(project ? toInput(project) : { ...blank, status: wouldExceedActive(all) ? 'parked' : 'active', reconsiderDate: addDays(today, 14) })
  const [roomOpen, setRoomOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const history = useLiveQuery(
    async () => (project ? (await db.events.where('projectId').equals(project.id).toArray()).sort(byTime).reverse().slice(0, 40) : []),
    [project?.id],
  )
  const tasks = useLiveQuery(
    async () => (project ? (await db.tasks.where('projectId').equals(project.id).toArray()).filter((x) => x.status === 'inbox' || x.status === 'today') : []),
    [project?.id],
  )

  const set = (patch: Partial<ProjectInput>) => setForm((f) => ({ ...f, ...patch }))
  const problems = validateProject({ ...form, reconsiderDate: form.reconsiderDate || undefined })
  const needsRoom = form.status === 'active' && project?.status !== 'active' && wouldExceedActive(all, project?.id)

  const save = async (room?: MakeRoom) => {
    setBusy(true)
    setError('')
    try {
      const input = { ...form, reconsiderDate: form.status === 'parked' ? form.reconsiderDate : '' }
      if (project) await updateProject(project.id, input, room)
      else await createProject(input, room)
      toast(t('common.saved'))
      nav('/projects')
    } catch (e) {
      if (e instanceof RuleError) {
        if (e.code === 'max-active') setRoomOpen(true)
        else setError(t(`projects.errors.${e.code}`))
      } else setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const statuses: ProjectStatus[] = ['active', 'parked', 'dead', 'finished']
  return (
    <Page
      title={
        <span className="flex items-center gap-2">
          <Link to="/projects" aria-label={t('projects.allProjects')} className="rounded-lg p-1 text-ink-3 hover:bg-muted hover:text-ink">
            <ChevronLeft size={22} />
          </Link>
          {project ? t('projects.editTitle') : t('projects.newTitle')}
        </span>
      }
    >
      {project && <ProjectFacts p={project} />}
      <Card className="space-y-5">
        <Field label={t('projects.name')}>{(id) => <TextInput id={id} value={form.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <Segmented<ProjectStatus> label={t('projects.title')} value={form.status} onChange={(status) => set({ status })} options={statuses.map((s) => ({ value: s, label: t(`projects.status.${s}`) }))} />
        {needsRoom && <Note>{t('projects.errors.max-active')}</Note>}
        <Field label={t('projects.nextAction')} hint={t('projects.nextActionHint')}>
          {(id, hintId) => <TextInput id={id} aria-describedby={hintId} value={form.nextAction} onChange={(e) => set({ nextAction: e.target.value })} />}
        </Field>
        {form.status === 'parked' && (
          <Field label={t('projects.reconsider')}>
            {(id) => <TextInput id={id} type="date" value={form.reconsiderDate ?? ''} onChange={(e) => set({ reconsiderDate: e.target.value })} />}
          </Field>
        )}
        <Field label={`${t('projects.goal')} (${t('common.optional')})`}>{(id) => <TextInput id={id} value={form.goal ?? ''} onChange={(e) => set({ goal: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('projects.deadline')}>
            {(id) => <TextInput id={id} type="date" value={form.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value })} />}
          </Field>
          <Field label={t('projects.person')} hint={t('projects.personHint')}>
            {(id, hintId) => (
              <TextInput id={id} aria-describedby={hintId} value={form.accountabilityPerson ?? ''} onChange={(e) => set({ accountabilityPerson: e.target.value })} />
            )}
          </Field>
        </div>
        {form.status === 'active' && (
          <>
            <Field label={t('projects.obstacle')}>{(id) => <TextInput id={id} value={form.obstacle ?? ''} onChange={(e) => set({ obstacle: e.target.value })} />}</Field>
            <Field label={t('projects.ifThen')}>{(id) => <TextInput id={id} value={form.ifThenPlan ?? ''} onChange={(e) => set({ ifThenPlan: e.target.value })} />}</Field>
          </>
        )}
        {error && <Note>{error}</Note>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {problems.length > 0 && <span className="text-sm text-ink-3">{t(`projects.errors.${problems[0]}`)}</span>}
          <Button variant="primary" disabled={problems.length > 0 || busy} onClick={() => (needsRoom ? setRoomOpen(true) : void save())}>
            {project ? t('projects.save') : t('projects.create')}
          </Button>
        </div>
      </Card>

      {project && tasks && (
        <section className="space-y-2">
          <SectionTitle>{t('projects.tasks')}</SectionTitle>
          {tasks.length ? (
            <ul className="space-y-1">
              {tasks.map((x) => (
                <li key={x.id} className="text-ink-2">
                  {x.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3">{t('projects.noTasks')}</p>
          )}
        </section>
      )}

      {project && history && history.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>{t('projects.history')}</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {history.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-28 shrink-0 tabular-nums text-ink-3">{fmtTimestamp(e.at, i18n.language)}</span>
                <span className="text-ink-2">{eventText(e, t, i18n.language)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MakeRoomSheet
        open={roomOpen}
        onClose={() => setRoomOpen(false)}
        exceptId={project?.id}
        onConfirm={async (room) => {
          setRoomOpen(false)
          await save(room)
        }}
      />
    </Page>
  )
}

export function ProjectEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const data = useLiveQuery(async () => {
    const all = (await db.projects.toArray()).filter((p) => !p.deletedAt)
    return { all, project: isNew ? null : (all.find((p) => p.id === id) ?? null) }
  }, [id, isNew])
  if (!data) return null
  if (!isNew && !data.project) return null
  return <EditorForm key={data.project?.id ?? 'new'} project={data.project} all={data.all} />
}
