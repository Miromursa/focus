import Dexie, { type Table } from 'dexie'
import type {
  Day,
  FocusSession,
  LogEvent,
  Override,
  Project,
  RestActivity,
  Review,
  Routine,
  RoutineItem,
  RoutineLog,
  Settings,
  Task,
} from './types'

export class FocusDB extends Dexie {
  declare settings: Table<Settings, string>
  declare projects: Table<Project, string>
  declare tasks: Table<Task, string>
  declare days: Table<Day, string>
  declare routines: Table<Routine, string>
  declare routineItems: Table<RoutineItem, string>
  declare routineLogs: Table<RoutineLog, string>
  declare sessions: Table<FocusSession, string>
  declare reviews: Table<Review, string>
  declare overrides: Table<Override, string>
  declare restActivities: Table<RestActivity, string>
  declare events: Table<LogEvent, string>

  constructor(name = 'focus') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      projects: 'id, status, order',
      tasks: 'id, status, projectId',
      days: 'date',
      routines: 'id, order',
      routineItems: 'id, routineId',
      routineLogs: 'id, date, routineItemId',
      sessions: 'id, date, startedAt',
      reviews: 'id, date, completedAt',
      overrides: 'id, date',
      restActivities: 'id, order',
      events: 'id, at, date, type, projectId',
    })
  }
}

export const db = new FocusDB()

export const TABLE_NAMES = [
  'settings',
  'projects',
  'tasks',
  'days',
  'routines',
  'routineItems',
  'routineLogs',
  'sessions',
  'reviews',
  'overrides',
  'restActivities',
  'events',
] as const

export type TableName = (typeof TABLE_NAMES)[number]
