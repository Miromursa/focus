import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Trash } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp, useToast } from '../../app/context'
import { Sheet } from '../../components/dialogs'
import { Button, Empty, Field, Select, TextInput } from '../../components/ui'
import { db } from '../../db/db'
import { completeTask, deleteTask, editTask, moveTask, parkTaskAsProject, taskToNextAction } from '../../db/tasks'
import { addDays } from '../../domain/dates'
import { byOrder } from '../../domain/projects'
import { fmtDate } from '../../lib/format'
import { useInboxItems } from './useInboxItems'

function ItemBody({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const { today } = useApp()
  const toast = useToast()
  const task = useLiveQuery(() => db.tasks.get(id), [id])
  const projects = useLiveQuery(
    async () => (await db.projects.toArray()).filter((p) => !p.deletedAt && (p.status === 'active' || p.status === 'parked')).sort(byOrder),
    [],
  )
  const [title, setTitle] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('')
  if (!task || !projects) return null
  const projectName = projects.find((p) => p.id === projectId)?.name ?? ''
  const parkUntil = addDays(today, 30)

  const act = async (fn: () => Promise<void>, message: string) => {
    if (title !== null && title.trim() && title.trim() !== task.title) await editTask(task.id, { title })
    await fn()
    toast(message)
    onClose()
  }

  return (
    <div className="space-y-5">
      <Field label={t('inbox.itemTitle')}>
        {(fid) => (
          <TextInput
            id={fid}
            value={title ?? task.title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== null && title.trim() && title.trim() !== task.title) void editTask(task.id, { title })
            }}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => act(() => moveTask(task.id, { status: 'today' }), t('inbox.movedToday'))}>{t('inbox.toToday')}</Button>
        <Button onClick={() => act(() => completeTask(task.id), t('inbox.doneToast'))}>
          <Check size={16} aria-hidden />
          {t('inbox.markDone')}
        </Button>
      </div>
      <fieldset className="space-y-3 rounded-2xl border border-line p-4">
        <legend className="px-1 text-sm font-medium text-ink-2">{t('inbox.toProject')}</legend>
        {projects.length === 0 ? (
          <p className="text-sm text-ink-3">{t('inbox.noProjects')}</p>
        ) : (
          <>
            <Select aria-label={t('inbox.chooseProject')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!projectId}
                onClick={() => act(() => moveTask(task.id, { projectId }), t('inbox.assignedToast', { project: projectName }))}
              >
                {t('inbox.asTask')}
              </Button>
              <Button
                size="sm"
                disabled={!projectId}
                onClick={() => act(() => taskToNextAction(task.id, projectId), t('inbox.nextActionToast', { project: projectName }))}
              >
                {t('inbox.asNextAction')}
              </Button>
            </div>
          </>
        )}
      </fieldset>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => act(() => parkTaskAsProject(task.id, parkUntil), t('inbox.parkedToast', { date: fmtDate(parkUntil, i18n.language) }))}
        >
          {t('inbox.parkIdea')}
        </Button>
        <Button variant="ghost" onClick={() => act(() => deleteTask(task.id), t('inbox.deletedToast'))}>
          <Trash size={16} aria-hidden />
          {t('inbox.delete')}
        </Button>
      </div>
    </div>
  )
}

/** The inbox with one-tap decisions. Used on the Inbox screen and in the weekly review. */
export function InboxList() {
  const { t } = useTranslation()
  const toast = useToast()
  const items = useInboxItems()
  const [selected, setSelected] = useState<string | null>(null)
  if (!items) return null
  return (
    <>
      {items.length === 0 ? (
        <Empty>{t('inbox.empty')}</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1 py-1 pl-4 pr-2">
              <button type="button" className="min-w-0 flex-1 break-words py-2 text-left hover:text-accent" onClick={() => setSelected(item.id)}>
                {item.title}
              </button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await moveTask(item.id, { status: 'today' })
                  toast(t('inbox.movedToday'))
                }}
              >
                {t('inbox.toToday')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`${t('inbox.markDone')}: ${item.title}`}
                onClick={async () => {
                  await completeTask(item.id)
                  toast(t('inbox.doneToast'))
                }}
              >
                <Check size={18} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={t('inbox.itemTitle')}>
        {selected && <ItemBody id={selected} onClose={() => setSelected(null)} />}
      </Sheet>
    </>
  )
}
