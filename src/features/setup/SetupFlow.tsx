import { Trash } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flow } from '../../components/Flow'
import { Button, Field, Note, Segmented, Select, TextArea, TextInput, WeekdayPicker } from '../../components/ui'
import { DEFAULT_DAY_START } from '../../db/core'
import { RuleError } from '../../db/projects'
import { useNow } from '../../hooks/data'
import { completeSetup, type SetupProject } from '../../db/setup'
import { splitLines } from '../../db/tasks'
import type { Locale } from '../../db/types'
import { addDays, pickTargetDate, toLocalDate } from '../../domain/dates'
import { MAX_ACTIVE, validateProject } from '../../domain/projects'
import { resolveLocale } from '../../i18n'
import { cn } from '../../lib/browser'
import { fmtDay, WEEK_ORDER, weekdayNames } from '../../lib/format'

const TOTAL = 7

/** First run: about ten minutes from nothing to a working system. Writes everything at the end. */
export function SetupFlow() {
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const [step, setStep] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [locale, setLocale] = useState<Locale>('auto')
  const [dump, setDump] = useState('')
  const [projects, setProjects] = useState<SetupProject[]>([])
  const [anchor, setAnchor] = useState('')
  const [items, setItems] = useState([{ title: '', tinyVersion: '' }])
  const [schedule, setSchedule] = useState({
    energyStart: '09:00',
    energyEnd: '11:00',
    shutdownTime: '17:30',
    workdays: [1, 2, 3, 4, 5],
    reviewWeekday: 0,
    reviewTime: '18:00',
  })
  const [rest, setRest] = useState('')
  const [person, setPerson] = useState('')
  const [pick, setPick] = useState<number | 'new' | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [firstStep, setFirstStep] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const now = useNow()
  const today = toLocalDate(now, DEFAULT_DAY_START)
  const reconsiderDefault = addDays(today, 14)
  const activeCount = projects.filter((p) => p.status === 'active').length
  const sortProblems = projects.flatMap((p) => validateProject(p))
  const target = pickTargetDate(now, { ...schedule, dayStartHour: DEFAULT_DAY_START })
  const days = weekdayNames(lng, 'long')

  const activeIdx = projects.map((p, i) => (p.status === 'active' && p.nextAction.trim() ? i : -1)).filter((i) => i >= 0)
  const chosen = pick ?? (activeIdx.length ? activeIdx[0] : 'new')
  const oneThingTitle = chosen === 'new' ? newTitle : (projects[chosen]?.nextAction ?? '')

  const setProject = (i: number, patch: Partial<SetupProject>) => setProjects((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const toSort = () => {
    const names = splitLines(dump)
    setProjects((prev) =>
      names.map((name) => prev.find((p) => p.name === name) ?? { name, status: 'parked', nextAction: '', reconsiderDate: reconsiderDefault }),
    )
    setPick(null)
    setStep(2)
  }

  const finish = async () => {
    setBusy(true)
    setError('')
    try {
      await completeSetup(
        {
          locale,
          projects,
          routine: { name: t('setup.routineName'), anchor, items },
          schedule,
          restActivities: splitLines(rest),
          accountabilityPerson: person,
          oneThing: { date: target, projectIndex: chosen === 'new' ? undefined : chosen, title: oneThingTitle, firstStep },
        },
        startedAt,
      )
      void navigator.storage?.persist?.()
    } catch (e) {
      setError(e instanceof RuleError ? t(`projects.errors.${e.code}`) : String(e))
    } finally {
      setBusy(false)
    }
  }

  const back = () => setStep((s) => Math.max(0, s - 1))

  if (step === 0) {
    return (
      <Flow title={t('setup.welcomeTitle')} step={0} total={TOTAL} onNext={() => setStep(1)} nextLabel={t('setup.start')}>
        <p className="text-lg">{t('setup.welcomeBody')}</p>
        <p className="text-ink-2">{t('setup.welcomeRules')}</p>
        <p className="text-ink-2">{t('setup.welcomeTime')}</p>
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-2">{t('setup.language')}</p>
          <Segmented<Locale>
            label={t('setup.language')}
            value={locale}
            onChange={(v) => {
              setLocale(v)
              void i18n.changeLanguage(resolveLocale(v))
            }}
            options={[
              { value: 'auto', label: t('setup.langAuto') },
              { value: 'en', label: 'English' },
              { value: 'de', label: 'Deutsch' },
            ]}
          />
        </div>
      </Flow>
    )
  }

  if (step === 1) {
    return (
      <Flow title={t('setup.projectsTitle')} subtitle={t('setup.projectsBody')} step={1} total={TOTAL} onBack={back} onNext={toSort} nextDisabled={!splitLines(dump).length}>
        <TextArea aria-label={t('setup.projectsTitle')} minRows={8} value={dump} placeholder={t('setup.projectsPlaceholder')} onChange={(e) => setDump(e.target.value)} />
      </Flow>
    )
  }

  if (step === 2) {
    return (
      <Flow
        title={t('setup.sortTitle')}
        subtitle={t('setup.sortBody')}
        step={2}
        total={TOTAL}
        onBack={back}
        onNext={() => setStep(3)}
        nextDisabled={sortProblems.length > 0 || activeCount > MAX_ACTIVE}
        nextHint={sortProblems.length ? t(`projects.errors.${sortProblems[0]}`) : t('projects.activeCount', { n: activeCount })}
      >
        <ul className="space-y-3">
          {projects.map((p, i) => (
            <li key={p.name} className={cn('space-y-3 rounded-2xl border bg-surface p-4', p.status === 'active' ? 'border-accent' : 'border-line')}>
              <p className="font-medium">{p.name}</p>
              <Segmented<SetupProject['status']>
                label={p.name}
                value={p.status}
                onChange={(status) => setProject(i, { status })}
                options={[
                  { value: 'active', label: t('projects.status.active'), disabled: p.status !== 'active' && activeCount >= MAX_ACTIVE },
                  { value: 'parked', label: t('projects.status.parked') },
                  { value: 'dead', label: t('projects.status.dead') },
                ]}
              />
              {p.status === 'active' && (
                <Field label={t('projects.nextAction')} hint={t('projects.nextActionHint')}>
                  {(id, hintId) => (
                    <TextInput id={id} aria-describedby={hintId} value={p.nextAction} onChange={(e) => setProject(i, { nextAction: e.target.value })} />
                  )}
                </Field>
              )}
              {p.status === 'parked' && (
                <Field label={t('projects.reconsider')}>
                  {(id) => (
                    <TextInput id={id} type="date" value={p.reconsiderDate ?? ''} onChange={(e) => setProject(i, { reconsiderDate: e.target.value || undefined })} />
                  )}
                </Field>
              )}
            </li>
          ))}
        </ul>
      </Flow>
    )
  }

  if (step === 3) {
    return (
      <Flow title={t('setup.routineTitle')} subtitle={t('setup.routineBody')} step={3} total={TOTAL} onBack={back} onNext={() => setStep(4)}>
        <Field label={t('setup.anchor')}>
          {(id) => <TextInput id={id} value={anchor} placeholder={t('setup.anchorPlaceholder')} onChange={(e) => setAnchor(e.target.value)} />}
        </Field>
        <ul className="space-y-3">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <TextInput
                  aria-label={t('setup.itemPlaceholder')}
                  value={it.title}
                  placeholder={t('setup.itemPlaceholder')}
                  onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                />
                <TextInput
                  aria-label={t('setup.tinyPlaceholder')}
                  className="text-sm"
                  value={it.tinyVersion}
                  placeholder={t('setup.tinyPlaceholder')}
                  onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, tinyVersion: e.target.value } : x)))}
                />
              </div>
              <Button variant="ghost" size="sm" aria-label={t('common.remove')} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                <Trash size={16} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <Button size="sm" onClick={() => setItems((xs) => [...xs, { title: '', tinyVersion: '' }])}>
          {t('setup.addItem')}
        </Button>
      </Flow>
    )
  }

  if (step === 4) {
    const set = (patch: Partial<typeof schedule>) => setSchedule((s) => ({ ...s, ...patch }))
    return (
      <Flow title={t('setup.scheduleTitle')} step={4} total={TOTAL} onBack={back} onNext={() => setStep(5)} nextDisabled={!schedule.workdays.length}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('setup.energy')}>
            {(id) => <TextInput id={id} type="time" value={schedule.energyStart} onChange={(e) => set({ energyStart: e.target.value })} />}
          </Field>
          <Field label="–">
            {(id) => <TextInput id={id} type="time" value={schedule.energyEnd} onChange={(e) => set({ energyEnd: e.target.value })} />}
          </Field>
        </div>
        <Field label={t('setup.shutdownTime')}>
          {(id) => <TextInput id={id} type="time" value={schedule.shutdownTime} onChange={(e) => set({ shutdownTime: e.target.value })} />}
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink-2">{t('setup.workdays')}</p>
          <WeekdayPicker label={t('setup.workdays')} value={schedule.workdays} onChange={(workdays) => set({ workdays })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('setup.reviewDay')}>
            {(id) => (
              <Select id={id} value={schedule.reviewWeekday} onChange={(e) => set({ reviewWeekday: Number(e.target.value) })}>
                {WEEK_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {days[d]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('setup.reviewTime')}>
            {(id) => <TextInput id={id} type="time" value={schedule.reviewTime} onChange={(e) => set({ reviewTime: e.target.value })} />}
          </Field>
        </div>
      </Flow>
    )
  }

  if (step === 5) {
    return (
      <Flow title={t('setup.restTitle')} step={5} total={TOTAL} onBack={back} onNext={() => setStep(6)}>
        <Field label={t('setup.restBody')}>
          {(id) => <TextArea id={id} minRows={3} value={rest} placeholder={t('setup.restPlaceholder')} onChange={(e) => setRest(e.target.value)} />}
        </Field>
        <Field label={t('setup.person')} hint={t('setup.personBody')}>
          {(id, hintId) => (
            <TextInput id={id} aria-describedby={hintId} value={person} placeholder={t('setup.personPlaceholder')} onChange={(e) => setPerson(e.target.value)} />
          )}
        </Field>
      </Flow>
    )
  }

  return (
    <Flow
      title={t('setup.oneThingTitle')}
      subtitle={t('setup.oneThingFor', { day: fmtDay(target, lng) })}
      step={6}
      total={TOTAL}
      onBack={back}
      onNext={() => void finish()}
      nextLabel={t('setup.finish')}
      nextDisabled={!oneThingTitle.trim() || !firstStep.trim()}
      busy={busy}
    >
      <div className="space-y-2" role="radiogroup" aria-label={t('setup.oneThingTitle')}>
        {activeIdx.map((i) => (
          <label key={i} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5', chosen === i ? 'border-accent bg-accent-soft' : 'border-line')}>
            <input type="radio" className="mt-1 accent-accent" checked={chosen === i} onChange={() => setPick(i)} />
            <span>
              <span className="block">{projects[i].nextAction}</span>
              <span className="block text-sm text-ink-3">{t('setup.pickFromProject', { project: projects[i].name })}</span>
            </span>
          </label>
        ))}
        <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5', chosen === 'new' ? 'border-accent bg-accent-soft' : 'border-line')}>
          <input type="radio" className="mt-1 accent-accent" checked={chosen === 'new'} onChange={() => setPick('new')} />
          <span className="flex-1 space-y-2">
            <span className="block">{t('setup.somethingElse')}</span>
            {chosen === 'new' && (
              <TextInput aria-label={t('setup.somethingElse')} value={newTitle} placeholder={t('picker.newPlaceholder')} onChange={(e) => setNewTitle(e.target.value)} />
            )}
          </span>
        </label>
      </div>
      <Field label={t('picker.firstStep')} hint={t('picker.firstStepHint')}>
        {(id, hintId) => <TextInput id={id} aria-describedby={hintId} value={firstStep} onChange={(e) => setFirstStep(e.target.value)} />}
      </Field>
      {error && <Note>{error}</Note>}
    </Flow>
  )
}
