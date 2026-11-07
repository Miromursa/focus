import { CircleDot, Inbox, Layers, Plus, ScrollText, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { cn } from '../lib/browser'
import { useCapture } from './context'

const NAV = [
  { to: '/', key: 'today', icon: CircleDot },
  { to: '/inbox', key: 'inbox', icon: Inbox },
  { to: '/projects', key: 'projects', icon: Layers },
  { to: '/log', key: 'log', icon: ScrollText },
  { to: '/settings', key: 'settings', icon: Settings },
] as const

export function CaptureButton() {
  const { t } = useTranslation()
  const { open } = useCapture()
  return (
    <button
      type="button"
      onClick={open}
      aria-label={t('nav.capture')}
      title={t('nav.capture')}
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 grid size-14 place-items-center rounded-full bg-accent text-accent-ink shadow-lg transition hover:brightness-110 md:bottom-8 md:right-8"
    >
      <Plus size={26} />
    </button>
  )
}

/** The main app frame: navigation, content and the always-visible capture button. */
export function Layout() {
  const { t } = useTranslation()
  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        {t('app.skipLink')}
      </a>
      <nav
        aria-label={t('nav.main')}
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line px-3 py-6 md:flex"
      >
        <div className="mb-6 flex items-center gap-2 px-3 text-lg font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-accent">
            <span className="size-2.5 rounded-full bg-bg" />
          </span>
          {t('app.name')}
        </div>
        {NAV.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition', isActive ? 'bg-muted font-medium text-ink' : 'text-ink-2 hover:bg-muted hover:text-ink')
            }
          >
            <Icon size={18} aria-hidden />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
      </nav>
      <main id="main" className="mx-auto w-full max-w-2xl px-4 pb-40 pt-6 sm:px-6 md:pb-20 md:pt-10">
        <Outlet />
      </main>
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-2.5 text-[11px]', isActive ? 'font-medium text-ink' : 'text-ink-3')
            }
          >
            <Icon size={20} aria-hidden />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
      </nav>
      <CaptureButton />
    </div>
  )
}

/** Frame for full-screen rituals: no navigation, capture still available. */
export function FlowShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      {children}
      <CaptureButton />
    </div>
  )
}
