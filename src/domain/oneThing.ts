import type { Day, ID, LocalDate, PickedVia, Project, Task } from '../db/types'
import { activeProjects } from './projects'

/** After this many slides, the next pick needs an explicit decision. */
export const SLIDE_LIMIT = 3

export type Candidate =
  | { kind: 'existing'; taskId: ID; via: PickedVia }
  | { kind: 'carry'; taskId: ID; fromDate: LocalDate; slides: boolean }
  | { kind: 'project'; projectId: ID; title: string }
  | { kind: 'none' }

export interface CandidateInput {
  /** The day being picked for. */
  targetDay?: Pick<Day, 'oneThingTaskId' | 'pickedVia'>
  /** The day an unfinished One Thing would carry over from. */
  sourceDay?: Pick<Day, 'date' | 'oneThingTaskId' | 'outcome'>
  sourceTask?: Pick<Task, 'id' | 'status'>
  projects: readonly Project[]
  /** Tasks the user just parked or let go. */
  exclude?: readonly ID[]
}

/**
 * The default One Thing, so picking needs no deliberation:
 * 1. whatever is already set for that day (for example, bumped there),
 * 2. the previous day's unfinished One Thing (carried over),
 * 3. the next action of the top Active project,
 * 4. nothing, which means a manual pick.
 */
export function defaultCandidate(i: CandidateInput): Candidate {
  const excluded = new Set(i.exclude ?? [])
  const existing = i.targetDay?.oneThingTaskId
  if (existing && !excluded.has(existing)) {
    return { kind: 'existing', taskId: existing, via: i.targetDay?.pickedVia ?? 'manual' }
  }
  const src = i.sourceDay
  const open = i.sourceTask && (i.sourceTask.status === 'today' || i.sourceTask.status === 'inbox')
  if (
    src?.oneThingTaskId &&
    i.sourceTask?.id === src.oneThingTaskId &&
    open &&
    !excluded.has(src.oneThingTaskId) &&
    (src.outcome === undefined || src.outcome === 'tiny')
  ) {
    // A low-energy "tiny" day counted as done, so carrying it on isn't a slide.
    return { kind: 'carry', taskId: src.oneThingTaskId, fromDate: src.date, slides: src.outcome === undefined }
  }
  const top = activeProjects(i.projects).find((p) => p.nextAction.trim() && !p.nextActionDone)
  if (top) return { kind: 'project', projectId: top.id, title: top.nextAction.trim() }
  return { kind: 'none' }
}

export function needsSlideDecision(
  task: Pick<Task, 'slideCount' | 'slideDecidedCount'>,
  effectiveSlides: number = task.slideCount,
): boolean {
  return effectiveSlides >= SLIDE_LIMIT && task.slideDecidedCount !== effectiveSlides
}

export type DayResult = 'done' | 'tiny' | 'bumped' | 'open' | 'none'

export function dayResult(day?: Pick<Day, 'oneThingTaskId' | 'outcome'>): DayResult {
  if (!day?.oneThingTaskId) return 'none'
  return day.outcome ?? 'open'
}
