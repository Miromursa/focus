import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'

/** Frame for the step-by-step rituals: title, progress, one step at a time, back and next. */
export function Flow({
  title,
  subtitle,
  step,
  total,
  aside,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextHint,
  busy,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  step: number
  total: number
  aside?: ReactNode
  onBack?: () => void
  onNext?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  nextHint?: ReactNode
  busy?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-32 pt-8 sm:pt-12">
      <header className="mb-6">
        <div className="flex min-h-8 items-center justify-between gap-3 text-sm text-ink-3">
          <span>{t('common.stepOf', { n: step + 1, total })}</span>
          {aside}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </header>
      <div className="flex-1 space-y-5">{children}</div>
      {(onBack || onNext) && (
        <footer className="mt-8 flex items-end justify-between gap-3">
          {onBack ? (
            <Button variant="ghost" onClick={onBack}>
              {t('common.back')}
            </Button>
          ) : (
            <span />
          )}
          {onNext && (
            <div className="flex flex-col items-end gap-1.5">
              {nextHint && <span className="text-right text-sm text-ink-3">{nextHint}</span>}
              <Button variant="primary" size="lg" disabled={nextDisabled || busy} onClick={onNext}>
                {nextLabel ?? t('common.next')}
              </Button>
            </div>
          )}
        </footer>
      )}
    </div>
  )
}
