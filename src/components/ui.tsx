import {
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/browser'
import { WEEK_ORDER, weekdayNames } from '../lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 disabled:opacity-40',
  secondary: 'border border-line bg-surface text-ink hover:bg-muted disabled:opacity-40',
  ghost: 'text-ink-2 hover:bg-muted hover:text-ink disabled:opacity-40',
  quiet: 'text-ink-2 underline decoration-line underline-offset-4 hover:text-ink disabled:opacity-40',
}
const SIZES: Record<Size, string> = {
  sm: 'min-h-8 px-3 text-sm',
  md: 'min-h-10 px-4 text-[15px]',
  lg: 'min-h-12 px-5 text-base',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed',
        VARIANTS[variant],
        variant !== 'quiet' && SIZES[size],
        className,
      )}
      {...rest}
    />
  )
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-2xl border border-line bg-surface p-5', className)} {...rest} />
}

export function Page({ title, intro, actions, children }: { title?: ReactNode; intro?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-6">
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
            {intro && <p className="mt-1 text-ink-2">{intro}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  className?: string
  children: (id: string, describedBy?: string) => ReactNode
}) {
  const id = useId()
  const hintId = hint || error ? `${id}-hint` : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">
        {label}
      </label>
      {children(id, hintId)}
      {(hint || error) && (
        <p id={hintId} className={cn('text-sm', error ? 'text-note-ink' : 'text-ink-3')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...rest} />
}

export function TextArea({ className, minRows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const lines = typeof rest.value === 'string' ? rest.value.split('\n').length + 1 : minRows
  return <textarea rows={Math.min(14, Math.max(minRows, lines))} className={cn(inputClass, 'resize-y leading-relaxed', className)} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, 'appearance-auto', className)} {...rest} />
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm transition',
            value === o.value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
            o.disabled && 'cursor-not-allowed opacity-40',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function WeekdayPicker({ label, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  const { i18n } = useTranslation()
  const names = weekdayNames(i18n.language)
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {WEEK_ORDER.map((d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={cn(
              'h-9 min-w-12 rounded-lg border px-2 text-sm transition',
              on ? 'border-accent bg-accent-soft font-medium text-ink' : 'border-line text-ink-2 hover:bg-muted',
            )}
          >
            {names[d]}
          </button>
        )
      })}
    </div>
  )
}

/** A calm notice. Never red. */
export function Note({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('rounded-xl bg-note px-3 py-2 text-sm text-note-ink', className)} {...rest} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-ink-3">{children}</p>
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-sm font-semibold uppercase tracking-wide text-ink-3', className)}>{children}</h2>
}
