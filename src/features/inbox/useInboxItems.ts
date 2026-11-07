import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'

/** Inbox items: captured, no project yet, not decided. */
export function useInboxItems() {
  return useLiveQuery(
    async () =>
      (await db.tasks.where('status').equals('inbox').toArray())
        .filter((x) => !x.projectId && !x.deletedAt)
        .sort((a, b) => a.createdAt - b.createdAt),
    [],
  )
}
