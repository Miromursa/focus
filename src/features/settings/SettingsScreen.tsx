import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarPlus, ChevronDown, ChevronUp, Download, Trash, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp, useToast } from '../../app/context'
import { APP_VERSION } from '../../app/version'
import { ReasonDialog, TypedConfirm } from '../../components/dialogs'
import { Button, Card, Field, Segmented, SectionTitle, Select, TextInput, WeekdayPicker } from '../../components/ui'
import { deleteEverything, importBackup } from '../../db/backup'
import { db } from '../../db/db'
import { deleteRoutine, deleteRoutineItem, moveRoutineItem, saveRoutine, saveRoutineItem } from '../../db/routines'
import { addRestActivity, deleteRestActivity, turnGatesOff, updateSettings, type SettingsPatch } from '../../db/settings'
import type { Locale, Routine, RoutineItem } from '../../db/types'
import { buildIcs, type IcsEvent } from '../../domain/ics'
import { itemsOf } from '../../domain/routines'
import { downloadText } from '../../lib/browser'
import { fmtTimestamp, WEEK_ORDER, weekdayNames } from '../../lib/format'
import { downloadBackup } from './backup'

const save = (patch: SettingsPatch) => void updateSettings(patch)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </Card>
  )
}

/** Text that saves when you leave the field, so typing doesn't write a log entry per keystroke. */
function BlurInput({ value, onSave, ...rest }: { value: string; onSave: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  // null = not editing, so the field shows the saved value.
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <TextInput
      {...rest}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onSave(draft)
        setDraft(null)
      }}
    />
  )
}

function Schedule() {
  const { t, i18n } = useTranslation()
  const { settings: s } = useApp()
  const days = weekdayNames(i18n.language, 'long')
  return (
    <Section title={t('settings.scheduleTitle')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('settings.energy')}>{(id) => <BlurInput id={id} type="time" value={s.energyStart} onSave={(v) => save({ energyStart: v })} />}</Field>
        <Field label="–">{(id) => <BlurInput id={id} type="time" value={s.energyEnd} onSave={(v) => save({ energyEnd: v })} />}</Field>
      </div>
      <Field label={t('settings.shutdownTime')}>{(id) => <BlurInput id={id} type="time" value={s.shutdownTime} onSave={(v) => save({ shutdownTime: v })} />}</Field>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-ink-2">{t('settings.workdays')}</p>
        <WeekdayPicker label={t('settings.workdays')} value={s.workdays} onChange={(workdays) => save({ workdays })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('settings.reviewDay')}>
          {(id) => (
            <Select id={id} value={s.reviewWeekday} onChange={(e) => save({ reviewWeekday: Number(e.target.value) })}>
              {WEEK_ORDER.map((d) => (
                <option key={d} value={d}>
                  {days[d]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('settings.reviewTime')}>{(id) => <BlurInput id={id} type="time" value={s.reviewTime} onSave={(v) => save({ reviewTime: v })} />}</Field>
      </div>
      <Field label={t('settings.dayStart')} hint={t('settings.dayStartHint')}>
        {(id, hintId) => (
          <Select id={id} aria-describedby={hintId} value={s.dayStartHour} onChange={(e) => save({ dayStartHour: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </Select>
        )}
      </Field>
    </Section>
  )
}

function RoutineEditor({ routine, items }: { routine: Routine; items: RoutineItem[] }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const list = itemsOf(routine.id, items)
  const meta = (patch: Partial<Pick<Routine, 'name' | 'anchor' | 'weekdays'>>) =>
    void saveRoutine({ id: routine.id, name: routine.name, anchor: routine.anchor, weekdays: routine.weekdays, ...patch })
  return (
    <div className="space-y-3 rounded-2xl border border-line p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('settings.routineName')}>{(id) => <BlurInput id={id} value={routine.name} onSave={(name) => meta({ name })} />}</Field>
        <Field label={t('settings.anchor')}>{(id) => <BlurInput id={id} value={routine.anchor} onSave={(anchor) => meta({ anchor })} />}</Field>
      </div>
      <WeekdayPicker label={t('settings.days')} value={routine.weekdays} onChange={(weekdays) => meta({ weekdays })} />
      <ul className="space-y-2">
        {list.map((it, i) => (
          <li key={it.id} className="flex items-start gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <BlurInput aria-label={t('settings.newItem')} value={it.title} onSave={(v) => void saveRoutineItem({ id: it.id, routineId: routine.id, title: v || it.title, tinyVersion: it.tinyVersion })} />
              <BlurInput
                aria-label={t('settings.tiny')}
                placeholder={t('settings.tiny')}
                value={it.tinyVersion ?? ''}
                onSave={(v) => void saveRoutineItem({ id: it.id, routineId: routine.id, title: it.title, tinyVersion: v })}
              />
            </div>
            <Button size="sm" variant="ghost" aria-label={t('common.moveUp')} disabled={i === 0} onClick={() => void moveRoutineItem(it.id, -1)}>
              <ChevronUp size={16} aria-hidden />
            </Button>
            <Button size="sm" variant="ghost" aria-label={t('common.moveDown')} disabled={i === list.length - 1} onClick={() => void moveRoutineItem(it.id, 1)}>
              <ChevronDown size={16} aria-hidden />
            </Button>
            <Button size="sm" variant="ghost" aria-label={`${t('common.remove')}: ${it.title}`} onClick={() => void deleteRoutineItem(it.id)}>
              <X size={16} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <TextInput aria-label={t('settings.newItem')} placeholder={t('settings.newItem')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button
          disabled={!title.trim()}
          onClick={async () => {
            await saveRoutineItem({ routineId: routine.id, title })
            setTitle('')
          }}
        >
          {t('settings.addItem')}
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={() => void deleteRoutine(routine.id)}>
        <Trash size={16} aria-hidden />
        {t('settings.deleteRoutine')}
      </Button>
    </div>
  )
}

function Routines() {
  const { t } = useTranslation()
  const data = useLiveQuery(async () => {
    const [routines, items] = await Promise.all([db.routines.toArray(), db.routineItems.toArray()])
    return { routines: routines.filter((r) => !r.deletedAt).sort((a, b) => a.order - b.order), items }
  }, [])
  if (!data) return null
  return (
    <Section title={t('settings.routinesTitle')}>
      {data.routines.map((r) => (
        <RoutineEditor key={r.id} routine={r} items={data.items} />
      ))}
      <Button size="sm" onClick={() => void saveRoutine({ name: t('settings.newRoutine'), anchor: '', weekdays: [0, 1, 2, 3, 4, 5, 6] })}>
        {t('settings.addRoutine')}
      </Button>
    </Section>
  )
}

function Rest() {
  const { t } = useTranslation()
  const { settings: s } = useApp()
  const [title, setTitle] = useState('')
  const rest = useLiveQuery(async () => (await db.restActivities.orderBy('order').toArray()).filter((r) => !r.deletedAt), [])
  return (
    <Section title={t('settings.restTitle')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('settings.restMinutes')}>
          {(id) => <BlurInput id={id} type="number" min={0} value={String(s.restBlockMinutes)} onSave={(v) => save({ restBlockMinutes: Math.max(0, Number(v) || 0) })} />}
        </Field>
        <Field label={t('settings.bufferMinutes')}>
          {(id) => <BlurInput id={id} type="number" min={0} value={String(s.bufferMinutes)} onSave={(v) => save({ bufferMinutes: Math.max(0, Number(v) || 0) })} />}
        </Field>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink-2">{t('settings.recharging')}</p>
        <div className="flex flex-wrap gap-1.5">
          {rest?.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 rounded-lg bg-muted py-1 pl-2.5 pr-1 text-sm">
              {r.title}
              <button type="button" aria-label={`${t('common.remove')}: ${r.title}`} className="rounded p-0.5 text-ink-3 hover:text-ink" onClick={() => void deleteRestActivity(r.id)}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <TextInput aria-label={t('settings.recharging')} placeholder={t('settings.activityPlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button
            disabled={!title.trim()}
            onClick={async () => {
              await addRestActivity(title)
              setTitle('')
            }}
          >
            {t('common.add')}
          </Button>
        </div>
      </div>
    </Section>
  )
}

function Enforcement() {
  const { t } = useTranslation()
  const { settings: s } = useApp()
  const [offOpen, setOffOpen] = useState(false)
  return (
    <Section title={t('settings.gatesTitle')}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 accent-accent"
          checked={s.gatesEnabled}
          onChange={(e) => (e.target.checked ? save({ gatesEnabled: true }) : setOffOpen(true))}
        />
        <span>
          <span className="block font-medium">{t('settings.gatesLabel')}</span>
          <span className="block text-sm text-ink-3">{t('settings.gatesBody')}</span>
        </span>
      </label>
      <ReasonDialog
        open={offOpen}
        onClose={() => setOffOpen(false)}
        title={t('settings.gatesOffTitle')}
        body={t('settings.gatesOffBody')}
        confirmLabel={t('settings.gatesOffConfirm')}
        onConfirm={async (reason) => {
          await turnGatesOff(reason)
          setOffOpen(false)
        }}
      />
    </Section>
  )
}

function Reminders() {
  const { t } = useTranslation()
  const { settings: s, today } = useApp()
  const download = () => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}`
    const open = t('settings.openApp', { url })
    const events: IcsEvent[] = [
      { uid: 'focus-one-thing@focus.app', summary: t('settings.reminderOneThing'), description: `${t('settings.reminderOneThingBody')}\n${open}`, time: s.energyStart, durationMin: 15, byDay: s.workdays },
      { uid: 'focus-shutdown@focus.app', summary: t('settings.reminderShutdown'), description: `${t('settings.reminderShutdownBody')}\n${open}`, time: s.shutdownTime, durationMin: 5, byDay: s.workdays },
      { uid: 'focus-review@focus.app', summary: t('settings.reminderReview'), description: `${t('settings.reminderReviewBody')}\n${open}`, time: s.reviewTime, durationMin: 20, byDay: [s.reviewWeekday] },
    ]
    downloadText('focus-reminders.ics', buildIcs(events, today, Date.now()), 'text/calendar')
  }
  return (
    <Section title={t('settings.remindersTitle')}>
      <p className="text-ink-2">{t('settings.remindersBody')}</p>
      <Button onClick={download}>
        <CalendarPlus size={16} aria-hidden />
        {t('settings.remindersButton')}
      </Button>
    </Section>
  )
}

function Notifications() {
  const { t } = useTranslation()
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported')
  return (
    <Section title={t('settings.notificationsTitle')}>
      <p className="text-ink-2">
        {perm === 'unsupported'
          ? t('settings.notificationsUnsupported')
          : perm === 'granted'
            ? t('settings.notificationsOn')
            : perm === 'denied'
              ? t('settings.notificationsBlocked')
              : t('settings.notificationsOff')}
      </p>
      {perm === 'default' && <Button onClick={() => void Notification.requestPermission().then(setPerm)}>{t('settings.notificationsAsk')}</Button>}
    </Section>
  )
}

function Data() {
  const { t, i18n } = useTranslation()
  const { settings: s, today } = useApp()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ raw: unknown; exportedAt: number } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])
  return (
    <Section title={t('settings.dataTitle')}>
      <p className="text-ink-2">{t('settings.dataBody')}</p>
      <p className="text-sm text-ink-3">
        {s.lastBackupAt ? t('settings.lastBackup', { date: fmtTimestamp(s.lastBackupAt, i18n.language) }) : t('settings.lastBackupNever')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void downloadBackup(today)}>
          <Download size={16} aria-hidden />
          {t('settings.export')}
        </Button>
        <Button onClick={() => fileRef.current?.click()}>
          <Upload size={16} aria-hidden />
          {t('settings.import')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const raw = JSON.parse(await file.text()) as { app?: string; exportedAt?: number }
              if (raw.app !== 'focus' || typeof raw.exportedAt !== 'number') throw new Error('not a backup')
              setPending({ raw, exportedAt: raw.exportedAt })
            } catch {
              toast(t('settings.importFailed'))
            }
          }}
        />
      </div>
      {persisted !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <div>
            <p className="text-sm font-medium text-ink-2">{t('settings.storage')}</p>
            <p className="text-sm text-ink-3">{persisted ? t('settings.storagePersisted') : t('settings.storageNotPersisted')}</p>
          </div>
          {!persisted && (
            <Button size="sm" onClick={() => void navigator.storage.persist().then(setPersisted)}>
              {t('settings.storageAsk')}
            </Button>
          )}
        </div>
      )}
      <div className="border-t border-line pt-4">
        <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
          <Trash size={16} aria-hidden />
          {t('settings.deleteButton')}
        </Button>
      </div>
      <TypedConfirm
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t('settings.importTitle')}
        body={t('settings.importBody', { date: pending ? fmtTimestamp(pending.exportedAt, i18n.language) : '', word: t('settings.importWord') })}
        word={t('settings.importWord')}
        confirmLabel={t('settings.importConfirm')}
        onConfirm={async () => {
          try {
            await importBackup(pending?.raw)
            toast(t('settings.imported'))
          } catch {
            toast(t('settings.importFailed'))
          }
          setPending(null)
        }}
      />
      <TypedConfirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('settings.deleteTitle')}
        body={t('settings.deleteBody', { word: t('settings.deleteWord') })}
        word={t('settings.deleteWord')}
        confirmLabel={t('settings.deleteButton')}
        onConfirm={async () => {
          await deleteEverything()
          window.location.reload()
        }}
      />
    </Section>
  )
}

export function SettingsScreen() {
  const { t } = useTranslation()
  const { settings: s } = useApp()
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
      <Schedule />
      <Routines />
      <Rest />
      <Section title={t('settings.personTitle')}>
        <Field label={t('settings.person')}>{(id) => <BlurInput id={id} value={s.accountabilityPerson ?? ''} onSave={(v) => save({ accountabilityPerson: v.trim() || undefined })} />}</Field>
      </Section>
      <Section title={t('settings.languageTitle')}>
        <Segmented<Locale>
          label={t('settings.languageTitle')}
          value={s.locale}
          onChange={(locale) => save({ locale })}
          options={[
            { value: 'auto', label: t('settings.langAuto') },
            { value: 'en', label: 'English' },
            { value: 'de', label: 'Deutsch' },
          ]}
        />
      </Section>
      <Enforcement />
      <Reminders />
      <Notifications />
      <Data />
      <p className="px-1 text-sm text-ink-3">{t('settings.about', { version: APP_VERSION })}</p>
    </div>
  )
}
