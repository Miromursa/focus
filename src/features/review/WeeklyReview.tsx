import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, Download, Mail, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useApp, useToast } from '../../app/context'
import { ReasonDialog } from '../../components/dialogs'
import { Flow } from '../../components/Flow'
import { Button, Card, Empty, Field, Note, Segmented, TextArea, TextInput } from '../../components/ui'
import { db } from '../../db/db'
import { RuleError, updateProject } from '../../db/projects'
import { addOverride, completeReview } from '../../db/reviews'
import type { Project, ProjectDecision, ProjectStatus } from '../../db/types'
import { addDays, isPastTime, isWorkday, nextWorkday, prevWorkday } from '../../domain/dates'
import { activeProjects, MAX_ACTIVE, projectsWith, resurfacedParked, validateProject } from '../../domain/projects'
import { fmtDate, fmtDay, fmtTimestamp } from '../../lib/format'
import { InboxList } from '../inbox/InboxList'
import { useInboxItems } from '../inbox/useInboxItems'
import { FactsView } from '../log/facts'
import { factLines, loadFacts } from '../log/factsData'
import { OneThingPicker } from '../onething/OneThingPicker'
import { ProjectFacts } from '../projects/ProjectsScreen'
import { GateSkip } from '../rituals/shared'
import { downloadBackup } from '../settings/backup'

const TOTAL = 9

type Draft = { status: ProjectStatus; nextAction: string; deadline: string; accountabilityPerson: string; reconsiderDate: string }

function ReviewCard({
  p,
  draft,
  set,
  statuses,
  note,
}: {
  p: Project
  draft: Draft
  set: (patch: Partial<Draft>) => void
  statuses: ProjectStatus[]
  note?: string
}) {
  const { t } = useTranslation()
  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <p className="font-semibold">{p.name}</p>
        {note && <p className="text-sm text-note-ink">{note}</p>}
        <ProjectFacts p={p} />
      </div>
      <Segmented<ProjectStatus>
        label={p.name}
        value={draft.status}
        onChange={(status) => set({ status })}
        options={statuses.map((s) => ({ value: s, label: t(`projects.status.${s}`) }))}
      />
      {draft.status === 'active' && (
        <Field label={t('projects.nextAction')} hint={p.nextActionDone ? t('projects.nextActionDone') : t('projects.nextActionHint')}>
          {(id, hintId) => <TextInput id={id} aria-describedby={hintId} value={draft.nextAction} onChange={(e) => set({ nextAction: e.target.value })} />}
        </Field>
      )}
      {draft.status === 'parked' && (
        <Field label={t('projects.reconsider')}>
          {(id) => <TextInput id={id} type="date" value={draft.reconsiderDate} onChange={(e) => set({ reconsiderDate: e.target.value })} />}
        </Field>
      )}
      {draft.status === 'active' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('projects.deadline')}>
            {(id) => <TextInput id={id} type="date" value={draft.deadline} onChange={(e) => set({ deadline: e.target.value })} />}
          </Field>
          <Field label={t('projects.person')}>
            {(id) => <TextInput id={id} value={draft.accountabilityPerson} onChange={(e) => set({ accountabilityPerson: e.target.value })} />}
          </Field>
        </div>
      )}
    </Card>
  )
}

/** About twenty minutes, on a fixed day. Everything gets decided here so the week runs on defaults. */
export function WeeklyReview({ gated = false }: { gated?: boolean }) {
  const { t, i18n } = useTranslation()
  const { settings, now, today } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const lng = i18n.language
  const [startedAt] = useState(() => Date.now())
  const [step, setStep] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [plans, setPlans] = useState<Record<string, { obstacle: string; ifThenPlan: string }>>({})
  const [decisions, setDecisions] = useState<ProjectDecision[]>([])
  const [reviewed, setReviewed] = useState<string[]>([])
  const [noActiveOk, setNoActiveOk] = useState(false)
  const [noActiveOpen, setNoActiveOpen] = useState(false)
  const [gates, setGates] = useState(settings.gatesEnabled)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const from = addDays(today, -7)
  const to = addDays(today, -1)
  const facts = useLiveQuery(() => loadFacts(from, to, settings), [from, to, settings])
  const projects = useLiveQuery(async () => (await db.projects.toArray()).filter((p) => !p.deletedAt), [])
  const inbox = useInboxItems()
  const todayDay = useLiveQuery(async () => (await db.days.get(today)) ?? null, [today])
  if (!facts || !projects || !inbox || todayDay === undefined) return null

  const range = t('log.range', { from: fmtDay(from, lng, 'short'), to: fmtDay(to, lng, 'short') })
  const draftOf = (p: Project): Draft =>
    drafts[p.id] ?? {
      status: p.status,
      nextAction: p.nextActionDone ? '' : p.nextAction,
      deadline: p.deadline ?? '',
      accountabilityPerson: p.accountabilityPerson ?? '',
      reconsiderDate: p.reconsiderDate ?? addDays(today, 14),
    }
  const setDraft = (p: Project, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [p.id]: { ...draftOf(p), ...patch } }))
  const problemsOf = (list: Project[]) =>
    list.flatMap((p) => {
      const d = draftOf(p)
      return validateProject({ name: p.name, status: d.status, nextAction: d.nextAction, reconsiderDate: d.status === 'parked' ? d.reconsiderDate : undefined })
    })

  const go = (n: number) => {
    setError('')
    setStep(n)
  }

  /** Saves the drafts for `list`. Parks and kills go first so new Active projects have room. */
  const apply = async (list: Project[]): Promise<boolean> => {
    const ids = new Set(list.map((p) => p.id))
    const activeAfter =
      projects.filter((p) => !ids.has(p.id) && p.status === 'active').length + list.filter((p) => draftOf(p).status === 'active').length
    if (activeAfter > MAX_ACTIVE) {
      setError(t('review.confirmTooMany', { n: activeAfter }))
      return false
    }
    setBusy(true)
    setError('')
    try {
      const ordered = [...list.filter((p) => draftOf(p).status !== 'active'), ...list.filter((p) => draftOf(p).status === 'active')]
      const made: ProjectDecision[] = []
      for (const p of ordered) {
        const d = draftOf(p)
        await updateProject(p.id, {
          status: d.status,
          nextAction: d.nextAction,
          deadline: d.deadline,
          accountabilityPerson: d.accountabilityPerson,
          reconsiderDate: d.status === 'parked' ? d.reconsiderDate : undefined,
        })
        if (d.status !== p.status || d.nextAction.trim() !== p.nextAction) {
          made.push({ projectId: p.id, name: p.name, from: p.status, to: d.status, nextAction: d.nextAction.trim() || undefined })
        }
      }
      setDecisions((ds) => [...ds, ...made])
      return true
    } catch (e) {
      setError(e instanceof RuleError ? t(`projects.errors.${e.code}`) : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const aside = gated ? (
    <GateSkip rule="gate:review" />
  ) : (
    <Button variant="quiet" className="text-sm" onClick={() => nav('/')}>
      {t('common.close')}
    </Button>
  )
  const common = { step, total: TOTAL, aside, busy, onBack: step > 0 ? () => go(step - 1) : undefined }

  if (step === 0) {
    return (
      <Flow {...common} title={t('review.factsTitle')} subtitle={`${t('review.title')} · ${range}`} onNext={() => go(1)}>
        <FactsView facts={facts} />
      </Flow>
    )
  }

  if (step === 1) {
    return (
      <Flow
        {...common}
        title={t('review.inboxTitle')}
        subtitle={t('review.inboxBody')}
        nextDisabled={inbox.length > 0}
        nextHint={inbox.length ? t('review.inboxLeft', { count: inbox.length }) : undefined}
        onNext={() => {
          setReviewed(activeProjects(projects).map((p) => p.id))
          go(2)
        }}
      >
        <InboxList />
      </Flow>
    )
  }

  if (step === 2) {
    const list = projects.filter((p) => reviewed.includes(p.id))
    const problems = problemsOf(list)
    return (
      <Flow
        {...common}
        title={t('review.activeTitle')}
        subtitle={t('review.activeBody')}
        nextDisabled={problems.length > 0}
        nextHint={problems.length ? t(`projects.errors.${problems[0]}`) : undefined}
        onNext={async () => {
          if (await apply(list)) go(3)
        }}
      >
        {list.length === 0 && <Empty>{t('projects.emptyActive')}</Empty>}
        {list.map((p) => (
          <ReviewCard key={p.id} p={p} draft={draftOf(p)} set={(patch) => setDraft(p, patch)} statuses={['active', 'parked', 'dead', 'finished']} />
        ))}
        {error && <Note>{error}</Note>}
      </Flow>
    )
  }

  if (step === 3) {
    const parked = projectsWith(projects, 'parked').filter((p) => !reviewed.includes(p.id))
    const due = resurfacedParked(parked, today)
    const later = parked.filter((p) => !due.includes(p))
    const problems = problemsOf(parked)
    const card = (p: Project, note?: string) => (
      <ReviewCard key={p.id} p={p} note={note} draft={draftOf(p)} set={(patch) => setDraft(p, patch)} statuses={['parked', 'active', 'dead', 'finished']} />
    )
    return (
      <Flow
        {...common}
        title={t('review.parkedTitle')}
        subtitle={t('review.parkedBody')}
        nextDisabled={problems.length > 0}
        nextHint={problems.length ? t(`projects.errors.${problems[0]}`) : undefined}
        onNext={async () => {
          if (await apply(parked)) go(4)
        }}
      >
        {parked.length === 0 && <Empty>{t('review.parkedNone')}</Empty>}
        {due.map((p) => card(p, t('projects.factResurfaced', { date: fmtDate(p.reconsiderDate!, lng) })))}
        {later.length > 0 && (
          <details className="rounded-2xl border border-line px-4 py-3" open={due.length === 0 && later.length <= 3}>
            <summary className="text-ink-2">
              {t('projects.parked')} ({later.length})
            </summary>
            <div className="mt-3 space-y-3">{later.map((p) => card(p))}</div>
          </details>
        )}
        {error && <Note>{error}</Note>}
      </Flow>
    )
  }

  const activeNow = activeProjects(projects)

  if (step === 4) {
    return (
      <Flow {...common} title={t('review.confirmTitle')} nextDisabled={activeNow.length === 0 && !noActiveOk} onNext={() => go(5)}>
        {activeNow.length === 0 ? (
          <>
            <Note>{t('review.confirmNone')}</Note>
            {!noActiveOk && <Button onClick={() => setNoActiveOpen(true)}>{t('review.confirmNoneButton')}</Button>}
          </>
        ) : (
          <>
            <p className="text-ink-2">{t('review.confirmOk')}</p>
            <ol className="list-decimal space-y-2 pl-5 text-lg">
              {activeNow.map((p) => (
                <li key={p.id}>
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-base text-ink-2">{p.nextAction}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <ReasonDialog
          open={noActiveOpen}
          onClose={() => setNoActiveOpen(false)}
          title={t('review.confirmNoneTitle')}
          body={t('review.confirmNone')}
          confirmLabel={t('review.confirmNoneButton')}
          onConfirm={async (reason) => {
            await addOverride('review:no-active', reason)
            setNoActiveOk(true)
            setNoActiveOpen(false)
          }}
        />
      </Flow>
    )
  }

  if (step === 5) {
    const planOf = (p: Project) => plans[p.id] ?? { obstacle: p.obstacle ?? '', ifThenPlan: p.ifThenPlan ?? '' }
    const missing = activeNow.some((p) => !planOf(p).obstacle.trim() || !planOf(p).ifThenPlan.trim())
    return (
      <Flow
        {...common}
        title={t('review.obstacleTitle')}
        subtitle={t('review.obstacleBody')}
        nextDisabled={missing}
        onNext={async () => {
          setBusy(true)
          const made: ProjectDecision[] = []
          for (const p of activeNow) {
            const plan = planOf(p)
            await updateProject(p.id, plan)
            made.push({ projectId: p.id, name: p.name, from: 'active', to: 'active', obstacle: plan.obstacle.trim(), ifThenPlan: plan.ifThenPlan.trim() })
          }
          setDecisions((ds) => [...ds.filter((d) => !made.some((m) => m.projectId === d.projectId && d.from === 'active' && d.to === 'active')), ...made])
          setBusy(false)
          go(6)
        }}
      >
        {activeNow.map((p) => {
          const plan = planOf(p)
          const set = (patch: Partial<typeof plan>) => setPlans((all) => ({ ...all, [p.id]: { ...plan, ...patch } }))
          return (
            <Card key={p.id} className="space-y-3">
              <p className="font-semibold">{p.name}</p>
              <Field label={t('projects.obstacle')}>{(id) => <TextInput id={id} value={plan.obstacle} onChange={(e) => set({ obstacle: e.target.value })} />}</Field>
              <Field label={t('projects.ifThen')}>{(id) => <TextInput id={id} value={plan.ifThenPlan} onChange={(e) => set({ ifThenPlan: e.target.value })} />}</Field>
            </Card>
          )
        })}
      </Flow>
    )
  }

  if (step === 6) {
    const target =
      isWorkday(today, settings.workdays) && !isPastTime(now, settings.shutdownTime, settings.dayStartHour) && !todayDay?.oneThingTaskId
        ? today
        : nextWorkday(today, settings.workdays)
    return (
      <Flow {...common} title={t('review.pickTitle')} subtitle={fmtDay(target, lng)}>
        <OneThingPicker target={target} carryFrom={prevWorkday(target, settings.workdays)} onPicked={() => go(7)} />
      </Flow>
    )
  }

  if (step === 7) {
    const { main, routines } = factLines(facts, t, lng)
    const title = t('review.summary.title', { from: fmtDay(from, lng, 'short'), to: fmtDay(to, lng, 'short') })
    const projectLines = activeNow.map((p) => {
      const parts = [p.name]
      if (p.nextAction) parts.push(t('review.summary.next', { action: p.nextAction }))
      if (p.deadline) parts.push(t('review.summary.deadline', { date: fmtDate(p.deadline, lng) }))
      return `- ${parts.join(', ')}`
    })
    const text = [
      title,
      '',
      ...main,
      ...routines.map((r) => `- ${r}`),
      '',
      ...(activeNow.length ? [t('review.summary.active'), ...projectLines] : [t('review.summary.noActive')]),
    ].join('\n')
    return (
      <Flow {...common} title={t('review.shareTitle')} subtitle={t('review.shareBody')} onNext={() => go(8)}>
        <TextArea readOnly aria-label={t('review.shareTitle')} value={text} minRows={10} />
        <div className="flex flex-wrap gap-2">
          {typeof navigator.share === 'function' && (
            <Button onClick={() => void navigator.share({ title, text }).catch(() => {})}>
              <Share2 size={16} aria-hidden />
              {t('review.share')}
            </Button>
          )}
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(text)
              toast(t('review.copied'))
            }}
          >
            <Copy size={16} aria-hidden />
            {t('review.copy')}
          </Button>
          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-4 hover:bg-muted"
            href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`}
          >
            <Mail size={16} aria-hidden />
            {t('review.email')}
          </a>
        </div>
      </Flow>
    )
  }

  return (
    <Flow
      {...common}
      title={t('review.wrapTitle')}
      nextLabel={t('review.finish')}
      onNext={async () => {
        setBusy(true)
        await completeReview({ kind: 'weekly', startedAt, decisions, facts, gatesEnabled: gates })
        toast(t('review.finished', { minutes: Math.max(1, Math.round((Date.now() - startedAt) / 60_000)) }))
        nav('/')
      }}
    >
      <div className="space-y-3">
        <p>{settings.lastBackupAt ? t('review.backupFact', { date: fmtTimestamp(settings.lastBackupAt, lng) }) : t('review.backupNever')}</p>
        <Button onClick={() => void downloadBackup(today)}>
          <Download size={16} aria-hidden />
          {t('review.backupNow')}
        </Button>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4">
        <input type="checkbox" className="mt-1 size-5 accent-accent" checked={gates} onChange={(e) => setGates(e.target.checked)} />
        <span>
          <span className="block font-medium">{t('review.gatesLabel')}</span>
          <span className="block text-sm text-ink-3">{t('review.gatesHint')}</span>
        </span>
      </label>
    </Flow>
  )
}
