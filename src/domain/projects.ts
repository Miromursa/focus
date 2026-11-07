import type { LocalDate, Project, ProjectStatus } from '../db/types'

export const MAX_ACTIVE = 3

export const byOrder = (a: Project, b: Project): number => a.order - b.order || a.createdAt - b.createdAt

export function activeProjects(ps: readonly Project[]): Project[] {
  return ps.filter((p) => p.status === 'active' && !p.deletedAt).sort(byOrder)
}

export function projectsWith(ps: readonly Project[], ...statuses: ProjectStatus[]): Project[] {
  return ps.filter((p) => statuses.includes(p.status) && !p.deletedAt).sort(byOrder)
}

export type ProjectProblem = 'name-required' | 'next-action-required' | 'reconsider-date-required' | 'max-active'

export interface ProjectShape {
  name: string
  status: ProjectStatus
  nextAction: string
  reconsiderDate?: LocalDate
}

export function validateProject(p: ProjectShape): ProjectProblem[] {
  const out: ProjectProblem[] = []
  if (!p.name.trim()) out.push('name-required')
  if (p.status === 'active' && !p.nextAction.trim()) out.push('next-action-required')
  if (p.status === 'parked' && !p.reconsiderDate) out.push('reconsider-date-required')
  return out
}

/** True if making project `id` (or a new one) Active would break the max-3 rule. */
export function wouldExceedActive(ps: readonly Project[], id?: string): boolean {
  return activeProjects(ps).filter((p) => p.id !== id).length >= MAX_ACTIVE
}

/** Parked projects whose reconsider date has come. */
export function resurfacedParked(ps: readonly Project[], today: LocalDate): Project[] {
  return projectsWith(ps, 'parked').filter((p) => !!p.reconsiderDate && p.reconsiderDate <= today)
}

export function daysSince(ts: number | undefined, now: number): number | undefined {
  if (ts === undefined) return undefined
  return Math.floor((now - ts) / 86_400_000)
}
