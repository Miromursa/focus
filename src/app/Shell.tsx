import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router'
import { toLocalDate } from '../domain/dates'
import type { Gate } from '../domain/gates'
import { CaptureProvider } from '../features/capture/CaptureProvider'
import { FocusProvider } from '../features/focus/FocusProvider'
import { InboxScreen } from '../features/inbox/InboxScreen'
import { LogScreen } from '../features/log/LogScreen'
import { ProjectEditor } from '../features/projects/ProjectEditor'
import { ProjectsScreen } from '../features/projects/ProjectsScreen'
import { WeeklyReview } from '../features/review/WeeklyReview'
import { CheckinFlow } from '../features/rituals/CheckinFlow'
import { OverwhelmFlow } from '../features/rituals/OverwhelmFlow'
import { RestartFlow } from '../features/rituals/RestartFlow'
import { ShutdownFlow } from '../features/rituals/ShutdownFlow'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { SetupFlow } from '../features/setup/SetupFlow'
import { TodayScreen } from '../features/today/TodayScreen'
import { useGate, useNow, useSettings } from '../hooks/data'
import { resolveLocale } from '../i18n'
import { AppCtx } from './context'
import { FlowShell, Layout } from './Layout'

function Splash() {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-dvh place-items-center text-ink-3" role="status">
      {t('app.loading')}
    </div>
  )
}

/** A ritual that has to happen before the rest of the app opens. */
function GateView({ gate }: { gate: Gate }) {
  if (gate.kind === 'restart') return <RestartFlow />
  if (gate.kind === 'review') return <WeeklyReview gated />
  return <CheckinFlow missedDate={gate.missedDate ?? ''} />
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayScreen />} />
        <Route path="inbox" element={<InboxScreen />} />
        <Route path="projects" element={<ProjectsScreen />} />
        <Route path="projects/:id" element={<ProjectEditor />} />
        <Route path="log" element={<LogScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
      </Route>
      <Route path="shutdown" element={<FlowShell><ShutdownFlow /></FlowShell>} />
      <Route path="review" element={<FlowShell><WeeklyReview /></FlowShell>} />
      <Route path="overwhelm" element={<FlowShell><OverwhelmFlow /></FlowShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Loads settings, applies the language, and decides between setup, a ritual gate and the app. */
export function Shell() {
  const { i18n } = useTranslation()
  const settings = useSettings()
  const now = useNow()
  const gate = useGate(settings, now)
  const locale = settings?.locale

  useEffect(() => {
    const lng = resolveLocale(locale)
    if (locale && i18n.language !== lng) void i18n.changeLanguage(lng)
    document.documentElement.lang = i18n.language
  }, [locale, i18n, i18n.language])

  if (settings === undefined || gate === undefined) return <Splash />
  if (!settings || gate.kind === 'setup') return <SetupFlow />

  return (
    <AppCtx.Provider value={{ settings, now, today: toLocalDate(now, settings.dayStartHour) }}>
      <CaptureProvider>
        <FocusProvider>
          {gate.kind === 'none' ? (
            <AppRoutes />
          ) : (
            <FlowShell>
              <GateView gate={gate} />
            </FlowShell>
          )}
        </FocusProvider>
      </CaptureProvider>
    </AppCtx.Provider>
  )
}
