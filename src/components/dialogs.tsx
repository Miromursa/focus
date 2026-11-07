import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/browser'
import { Button, Field, TextArea, TextInput } from './ui'

/** Native modal dialog: a bottom sheet on phones, a centered card on wider screens. */
export function Sheet({
  open,
  onClose,
  title,
  wide,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  wide?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={cn(
        'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border border-line bg-surface p-0 text-ink shadow-2xl',
        'sm:inset-0 sm:m-auto sm:h-fit sm:rounded-3xl',
        wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
      )}
    >
      {open && (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="-m-1 rounded-lg p-1 text-ink-3 hover:bg-muted hover:text-ink"
            >
              <X size={20} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

function ReasonBody({
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  body: ReactNode
  confirmLabel: string
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-4">
      <p className="text-ink-2">{body}</p>
      <Field label={t('rituals.skip.label')}>
        {(id) => (
          <TextArea
            id={id}
            data-autofocus
            minRows={2}
            value={reason}
            placeholder={t('rituals.skip.placeholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={reason.trim().length < 3 || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm(reason.trim())
            } finally {
              setBusy(false)
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

/** Getting past a rule takes a written reason, which is logged. */
export function ReasonDialog(props: {
  open: boolean
  onClose: () => void
  title: string
  body: ReactNode
  confirmLabel: string
  onConfirm: (reason: string) => Promise<void>
}) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title}>
      <ReasonBody body={props.body} confirmLabel={props.confirmLabel} onConfirm={props.onConfirm} onClose={props.onClose} />
    </Sheet>
  )
}

function TypedBody({
  body,
  word,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  body: ReactNode
  word: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-4">
      <p className="text-ink-2">{body}</p>
      <TextInput data-autofocus aria-label={word} value={value} autoComplete="off" onChange={(e) => setValue(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={value.trim().toUpperCase() !== word.toUpperCase() || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

/** For destructive actions: the user types a confirmation word. */
export function TypedConfirm(props: {
  open: boolean
  onClose: () => void
  title: string
  body: ReactNode
  word: string
  confirmLabel: string
  onConfirm: () => Promise<void>
}) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title}>
      <TypedBody body={props.body} word={props.word} confirmLabel={props.confirmLabel} onConfirm={props.onConfirm} onClose={props.onClose} />
    </Sheet>
  )
}
