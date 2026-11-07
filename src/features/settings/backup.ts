import { exportBackup } from '../../db/backup'
import type { LocalDate } from '../../db/types'
import { downloadText } from '../../lib/browser'

export async function downloadBackup(today: LocalDate): Promise<void> {
  const file = await exportBackup()
  downloadText(`focus-backup-${today}.json`, JSON.stringify(file, null, 1), 'application/json')
}
