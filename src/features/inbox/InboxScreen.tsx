import { useTranslation } from 'react-i18next'
import { Page } from '../../components/ui'
import { InboxList } from './InboxList'

export function InboxScreen() {
  const { t } = useTranslation()
  return (
    <Page title={t('inbox.title')} intro={t('inbox.intro')}>
      <InboxList />
    </Page>
  )
}
