import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '../components/ui'

/** A new version waits until you choose to reload, so a running timer is never cut off. */
export function UpdatePrompt() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })
  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-lg"
    >
      <span className="text-sm">{t('app.updateReady')}</span>
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        {t('app.reload')}
      </Button>
    </div>
  )
}
