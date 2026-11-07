import { useTranslation } from 'react-i18next'
import type { PeriodFacts } from '../../domain/facts'
import { factLines } from './factsData'

export function FactsView({ facts }: { facts: PeriodFacts }) {
  const { t, i18n } = useTranslation()
  const { main, routines, overrides } = factLines(facts, t, i18n.language)
  if (!facts.workdays && !facts.tasksDone && !facts.focusMinutes && !overrides.length) {
    return <p className="text-ink-3">{t('facts.noData')}</p>
  }
  return (
    <div className="space-y-4">
      <ul className="space-y-1.5">
        {main.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {routines.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink-2">{t('facts.routines')}</p>
          <ul className="space-y-1">
            {routines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-2">{overrides.length ? t('facts.overrides', { n: overrides.length }) : t('facts.noOverrides')}</p>
        {overrides.length > 0 && (
          <ul className="space-y-1">
            {overrides.map((line, i) => (
              <li key={i} className="text-ink-2">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
