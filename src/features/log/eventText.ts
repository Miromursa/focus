import type { TFunction } from 'i18next'
import type { Day, LogEvent, OverrideRule, ProjectStatus, ReviewKind } from '../../db/types'
import { dayResult } from '../../domain/oneThing'
import { fmtDay, fmtTime } from '../../lib/format'

/** "One Thing: done at 10:41." and friends. */
export function oneThingLine(day: Pick<Day, 'oneThingTaskId' | 'outcome' | 'doneAt'> | undefined, t: TFunction, lng: string): string {
  const time = day?.doneAt ? fmtTime(day.doneAt, lng) : ''
  switch (dayResult(day)) {
    case 'done':
      return t('rituals.facts.oneThingDone', { time })
    case 'tiny':
      return t('rituals.facts.oneThingTiny', { time })
    case 'bumped':
      return t('rituals.facts.oneThingBumped')
    case 'open':
      return t('rituals.facts.oneThingOpen')
    default:
      return t('rituals.facts.oneThingNone')
  }
}

export function ruleLabel(rule: OverrideRule | string, t: TFunction): string {
  switch (rule) {
    case 'gate:checkin':
      return t('facts.rules.checkin')
    case 'gate:review':
      return t('facts.rules.review')
    case 'gate:restart':
      return t('facts.rules.restart')
    case 'review:no-active':
      return t('facts.rules.noActive')
    default:
      return t('facts.rules.gatesOff')
  }
}

const STATUSES: ProjectStatus[] = ['active', 'parked', 'dead', 'finished']
const status = (v: string, t: TFunction) => (STATUSES.includes(v as ProjectStatus) ? t(`projects.status.${v as ProjectStatus}`) : v)

/** One plain sentence per log event. */
export function eventText(e: LogEvent, t: TFunction, lng: string): string {
  const d = e.data ?? {}
  const s = (k: string) => (d[k] === undefined || d[k] === null ? '' : String(d[k]))
  const title = s('title')
  const day = (k: string) => (s(k) ? fmtDay(s(k), lng, 'short') : '')
  switch (e.type) {
    case 'setup.done':
      return t('log.events.setup_done')
    case 'task.captured':
      return t('log.events.task_captured', { title })
    case 'task.triaged': {
      const path = s('path') as 'two-min' | 'not-urgent' | 'urgent'
      return t('log.events.task_triaged', { title, path: t(`log.paths.${path}`) })
    }
    case 'task.done':
      return d.beforeOneThing ? t('log.events.task_done_early', { title }) : t('log.events.task_done', { title })
    case 'task.reopened':
      return t('log.events.task_reopened', { title })
    case 'task.deleted':
      return t('log.events.task_deleted', { title })
    case 'task.moved':
      return d.project ? t('log.events.task_moved_project', { title, project: s('project') }) : t('log.events.task_moved', { title })
    case 'task.edited':
      return t('log.events.task_edited', { title })
    case 'onething.picked':
      return t('log.events.onething_picked', { title, day: day('forDate') })
    case 'onething.done':
      return t('log.events.onething_done', { title })
    case 'onething.tiny':
      return t('log.events.onething_tiny', { title: s('firstStep') || title })
    case 'onething.reopened':
      return t('log.events.onething_reopened', { title })
    case 'onething.bumped':
      return d.toDate
        ? t('log.events.onething_bumped', { title, day: day('toDate'), by: s('by') })
        : t('log.events.onething_bumped_kept', { title, by: s('by') })
    case 'onething.slide-decision': {
      const decision = s('decision') as 'shrink' | 'recommit' | 'park' | 'let-go'
      return t('log.events.onething_slide_decision', { title, slides: s('slides'), decision: t(`log.decisions.${decision}`) })
    }
    case 'focus.started':
      return t('log.events.focus_started', { title, minutes: s('minutes') })
    case 'focus.extended':
      return t('log.events.focus_extended', { minutes: s('minutes') })
    case 'focus.ended':
      return d.early ? t('log.events.focus_ended_early', { minutes: s('minutes') }) : t('log.events.focus_ended', { minutes: s('minutes') })
    case 'routine.marked':
      return d.mark === 'tiny' ? t('log.events.routine_marked_tiny', { title }) : t('log.events.routine_marked', { title })
    case 'routine.unmarked':
      return t('log.events.routine_unmarked', { title })
    case 'lowenergy.on':
      return d.note ? t('log.events.lowenergy_on_note', { note: s('note') }) : t('log.events.lowenergy_on')
    case 'lowenergy.off':
      return t('log.events.lowenergy_off')
    case 'overwhelm.used':
      return t('log.events.overwhelm_used')
    case 'rest.taken':
      return t('log.events.rest_taken')
    case 'shutdown.done':
      return t('log.events.shutdown_done')
    case 'checkin.done':
      return t('log.events.checkin_done')
    case 'review.done':
      return t('log.events.review_done', { kind: t(`log.kinds.${s('kind') as ReviewKind}`), minutes: s('minutes') })
    case 'project.created':
      return t('log.events.project_created', { name: s('name') })
    case 'project.status':
      return t('log.events.project_status', { name: s('name'), from: status(s('from'), t), to: status(s('to'), t) })
    case 'project.next-action':
      return d.to
        ? t('log.events.project_next_action', { name: s('name'), to: s('to') })
        : t('log.events.project_next_action_cleared', { name: s('name') })
    case 'project.edited':
      return t('log.events.project_edited', { name: s('name') })
    case 'project.reordered':
      return t('log.events.project_reordered', { name: s('name'), position: s('position') })
    case 'override':
      return t('log.events.override', { rule: ruleLabel(s('rule'), t), reason: s('reason') })
    case 'settings.changed':
      return t('log.events.settings_changed')
    case 'data.exported':
      return t('log.events.data_exported')
    case 'data.imported':
      return t('log.events.data_imported')
  }
}
