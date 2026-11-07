import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../../app/context'
import { Flow } from '../../components/Flow'
import { Card, Field, Note, Segmented, TextInput } from '../../components/ui'
import { db } from '../../db/db'
import { RuleError, updateProject } from '../../db/projects'
import { completeReview } from '../../db/reviews'
import type { ProjectDecision, ProjectStatus } from '../../db/types'
import { addDays, pickTargetDate } from '../../domain/dates'
import { activeProjects, validateProject } from '../../domain/projects'
import { fmtDay } from '../../lib/format'
import { OneThingPicker } from '../onething/OneThingPicker'
import { GateSkip } from './shared'

type Draft = { status: ProjectStatus; nextAction: string; reconsiderDate: string }

/** After a gap: no catching up, no list of what was missed. Fifteen minutes and a fresh start from today. */
export function RestartFlow() {
  const { t, i18n } = useTranslation()
  const { settings, now, today } = useApp()
  const [startedAt] = useState(() => Date.now())
  const [step, setStep] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [decisions, setDecisions] = useState<ProjectDecision[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ids, setIds] = useState<string[] | null>(null)
  const projects = useLiveQuery(async () => (await db.projects.toArray()).filter((p) => !p.deletedAt), [])
  if (!projects) return null
  // Freeze the list on first load so projects don't disappear while you edit them.
  if (ids === null) setIds(activeProjects(projects).map((p) => p.id))
  const list = projects.filter((p) => ids?.includes(p.id))

  const draftOf = (id: string): Draft => {
    const p = projects.find((x) => x.id === id)!
    return drafts[id] ?? { status: p.status, nextAction: p.nextAction, reconsiderDate: p.reconsiderDate ?? addDays(today, 14) }
  }
  const problems = list.flatMap((p) => {
    const d = draftOf(p.id)
    return validateProject({ name: p.name, status: d.status, nextAction: d.nextAction, reconsiderDate: d.status === 'parked' ? d.reconsiderDate : undefined })
  })
  const aside = <GateSkip rule="gate:restart" />

  if (step === 0) {
    return (
      <Flow
        title={t('rituals.restart.title')}
        subtitle={t('rituals.restart.subtitle')}
        step={0}
        total={2}
        aside={aside}
        busy={busy}
        nextDisabled={problems.length > 0}
        nextHint={problems.length ? t(`projects.errors.${problems[0]}`) : undefined}
        onNext={async () => {
          setBusy(true)
          setError('')
          try {
            const made: ProjectDecision[] = []
            for (const p of list) {
              const d = draftOf(p.id)
              await updateProject(p.id, { status: d.status, nextAction: d.nextAction, reconsiderDate: d.status === 'parked' ? d.reconsiderDate : undefined })
              if (d.status !== p.status || d.nextAction.trim() !== p.nextAction) {
                made.push({ projectId: p.id, name: p.name, from: p.status, to: d.status, nextAction: d.nextAction.trim() || undefined })
              }
            }
            setDecisions(made)
            setStep(1)
          } catch (e) {
            setError(e instanceof RuleError ? t(`projects.errors.${e.code}`) : String(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <h2 className="font-semibold">{t('rituals.restart.projectsTitle')}</h2>
        <p className="text-ink-2">{t('rituals.restart.projectsBody')}</p>
        <ul className="space-y-3">
          {list.map((p) => {
            const d = draftOf(p.id)
            const set = (patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [p.id]: { ...d, ...patch } }))
            return (
              <li key={p.id}>
                <Card className="space-y-3">
                  <p className="font-semibold">{p.name}</p>
                  <Segmented<ProjectStatus>
                    label={p.name}
                    value={d.status}
                    onChange={(status) => set({ status })}
                    options={(['active', 'parked', 'dead'] as const).map((s) => ({ value: s, label: t(`projects.status.${s}`) }))}
                  />
                  {d.status === 'active' && (
                    <Field label={t('projects.nextAction')}>{(id) => <TextInput id={id} value={d.nextAction} onChange={(e) => set({ nextAction: e.target.value })} />}</Field>
                  )}
                  {d.status === 'parked' && (
                    <Field label={t('projects.reconsider')}>
                      {(id) => <TextInput id={id} type="date" value={d.reconsiderDate} onChange={(e) => set({ reconsiderDate: e.target.value })} />}
                    </Field>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
        {error && <Note>{error}</Note>}
      </Flow>
    )
  }

  const target = pickTargetDate(now, settings)
  return (
    <Flow title={t('rituals.restart.pickTitle')} subtitle={fmtDay(target, i18n.language)} step={1} total={2} aside={aside} onBack={() => setStep(0)}>
      <OneThingPicker target={target} submitLabel={t('rituals.restart.finish')} onPicked={() => void completeReview({ kind: 'restart', startedAt, decisions })} />
    </Flow>
  )
}
