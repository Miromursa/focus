import type { PeriodFacts } from '../domain/facts'

export type ID = string
/** 'YYYY-MM-DD' in device time, shifted by the day-start hour (see domain/dates). */
export type LocalDate = string

/** Every record carries these so a later sync layer can merge by updatedAt and see soft deletes. */
export interface Stamped {
  createdAt: number
  updatedAt: number
  deletedAt?: number
}
export interface Base extends Stamped {
  id: ID
}

export type Locale = 'auto' | 'en' | 'de'

export interface Settings extends Stamped {
  id: 'settings'
  energyStart: string // 'HH:mm'
  energyEnd: string
  shutdownTime: string
  /** Weekday numbers as in Date.getDay(): 0 = Sunday. */
  workdays: number[]
  /** Before this hour, the clock still counts as the previous day. */
  dayStartHour: number
  reviewWeekday: number
  reviewTime: string
  bufferMinutes: number
  restBlockMinutes: number
  locale: Locale
  accountabilityPerson?: string
  gatesEnabled: boolean
  onboardedAt?: number
  onboardedDate?: LocalDate
  lastBackupAt?: number
}

export type ProjectStatus = 'active' | 'parked' | 'dead' | 'finished'

export interface Project extends Base {
  name: string
  status: ProjectStatus
  order: number
  nextAction: string
  nextActionChangedAt?: number
  /** The next action was finished; the project needs a new one. */
  nextActionDone?: boolean
  goal?: string
  deadline?: LocalDate
  accountabilityPerson?: string
  reconsiderDate?: LocalDate
  obstacle?: string
  ifThenPlan?: string
  statusChangedAt: number
}

export type TaskStatus = 'inbox' | 'today' | 'done' | 'deleted'
export type TaskSource = 'capture' | 'shutdown' | 'checkin' | 'review' | 'overwhelm' | 'project' | 'setup' | 'manual'

export interface Task extends Base {
  title: string
  projectId?: ID
  status: TaskStatus
  firstStep?: string
  urgent?: boolean
  /** How often this task moved on as the One Thing without being done. */
  slideCount: number
  slideDecidedAt?: number
  slideDecidedCount?: number
  source: TaskSource
  /** Created from its project's next action. */
  fromNextAction?: boolean
  doneAt?: number
}

export type PickedVia = 'default' | 'manual' | 'carried' | 'bumped'
export type Outcome = 'done' | 'tiny' | 'bumped'

export interface Day extends Stamped {
  date: LocalDate
  oneThingTaskId?: ID
  pickedAt?: number
  pickedVia?: PickedVia
  outcome?: Outcome
  doneAt?: number
  bumpedAt?: number
  bumpedTo?: LocalDate
  lowEnergyAt?: number
  lowEnergyNote?: string
  shutdownAt?: number
  checkinAt?: number
  restTakenAt?: number
}

export interface Routine extends Base {
  name: string
  anchor: string
  weekdays: number[]
  order: number
}

export interface RoutineItem extends Base {
  routineId: ID
  title: string
  tinyVersion?: string
  order: number
  active: boolean
}

export type RoutineMark = 'done' | 'tiny'

/** id is `${date}|${routineItemId}`. */
export interface RoutineLog extends Base {
  date: LocalDate
  routineItemId: ID
  mark: RoutineMark
}

export type SessionKind = 'start10' | 'overwhelm'

export interface FocusSession extends Base {
  taskId?: ID
  projectId?: ID
  title: string
  date: LocalDate
  startedAt: number
  plannedMin: number
  endedAt?: number
  endedEarly?: boolean
  kind: SessionKind
}

export type ReviewKind = 'weekly' | 'restart' | 'onboarding'

export interface ProjectDecision {
  projectId: ID
  name: string
  from: ProjectStatus
  to: ProjectStatus
  nextAction?: string
  obstacle?: string
  ifThenPlan?: string
}

export interface Review extends Base {
  kind: ReviewKind
  date: LocalDate
  startedAt: number
  completedAt?: number
  decisions: ProjectDecision[]
  facts?: PeriodFacts
}

export type OverrideRule = 'gate:restart' | 'gate:review' | 'gate:checkin' | 'review:no-active' | 'settings:gates-off'

export interface Override extends Base {
  date: LocalDate
  at: number
  rule: OverrideRule
  reason: string
}

export interface RestActivity extends Base {
  title: string
  order: number
}

export type EventType =
  | 'setup.done'
  | 'task.captured'
  | 'task.triaged'
  | 'task.done'
  | 'task.reopened'
  | 'task.deleted'
  | 'task.moved'
  | 'task.edited'
  | 'onething.picked'
  | 'onething.done'
  | 'onething.tiny'
  | 'onething.reopened'
  | 'onething.bumped'
  | 'onething.slide-decision'
  | 'focus.started'
  | 'focus.extended'
  | 'focus.ended'
  | 'routine.marked'
  | 'routine.unmarked'
  | 'lowenergy.on'
  | 'lowenergy.off'
  | 'overwhelm.used'
  | 'rest.taken'
  | 'shutdown.done'
  | 'checkin.done'
  | 'review.done'
  | 'project.created'
  | 'project.status'
  | 'project.next-action'
  | 'project.edited'
  | 'project.reordered'
  | 'override'
  | 'settings.changed'
  | 'data.exported'
  | 'data.imported'

export type EventData = Record<string, string | number | boolean | null | undefined>

/** Append-only activity log. Every state change writes one in the same transaction. */
export interface LogEvent {
  id: ID
  at: number
  /** Tiebreaker so events written in the same millisecond keep their order. */
  seq?: number
  date: LocalDate
  type: EventType
  refId?: ID
  projectId?: ID
  data?: EventData
}
