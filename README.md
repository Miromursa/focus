# FOCUS

A calm, strict web app that runs a personal productivity system: one trusted place for your projects, your One Thing and your daily rituals. You decide in advance, then act by default.

**Open it at https://miromursa.github.io/focus/**

This is **Phase 1**, the core loop. It is an installable, offline-first PWA. Everything stays in your browser on this device: no account, no server, no AI.

## What it does

- **Today:** the One Thing, with its tiny first step, a *Start 10 minutes* timer and the obstacle plan of its project. Below it are your routine with its anchor ("After coffee"), a protected rest block, other tasks and the buffer.
- **Capture** (the **+** button or the **C** key): one field, and Enter saves to the inbox. *Triage* walks you through the urgency test. If something is genuinely urgent, today's One Thing moves to the first slot of the next workday.
- **Projects:** at most 3 Active, and an Active project must have a next action. Parked projects need a reconsider date; Dead and Finished projects are archived.
- **Rituals:**
  - **Shutdown:** brain dump, today in facts, tomorrow's One Thing, a glance ahead, done for today.
  - **Weekly review:** facts, inbox to zero, project decisions, 1 to 3 Active, obstacle plans, first One Thing, an optional summary for your accountability person, backup.
  - **Restart:** after a gap, with no catching up.
- **Low-energy day:** the first step counts, routines switch to tiny versions and the rest block gets longer.
- **"Keeps sliding":** a task that slides three times forces a decision: shrink it, keep it, park its project or let it go.
- **Overwhelm reset:** a one-minute brain dump, one tiny step, then ten minutes.
- **Log:** every action with a timestamp, plus a weekly summary in plain facts.

### How strict it is

- If yesterday's shutdown or this week's review was skipped, FOCUS opens straight into it. Capture still works.
- Getting past a gate takes a typed reason. The reason is logged and listed at the next weekly review.
- Gates can be switched off only during a weekly review, or elsewhere with a logged reason.
- Misses are reported as plain facts. There is no red, no streaks, no points and no guilt copy.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check and production build (with service worker and icons) in `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (rules, gates, facts, database, translations) |
| `npm run test:e2e` | End-to-end tests against the production build, at desktop and phone width |
| `npm run lint` | oxlint |

The end-to-end tests use the installed Microsoft Edge. In CI they use Playwright's Chromium (`npx playwright install chromium`). Set `BASE_PATH=/focus/` to run them against the deployed base path.

## Use it on your phone

Open https://miromursa.github.io/focus/ on your phone and install it:

- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** menu → **Install app**

After the first visit it works offline. When a new version is out, FOCUS says so and offers to reload.

## Deploy

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml) on GitHub Actions:

1. typecheck, lint and unit tests
2. the end-to-end tests, against a build made with the GitHub Pages base path (`/focus/`)
3. if all of them pass, it publishes that same build to GitHub Pages

To build for a sub-path yourself:

```bash
BASE_PATH=/focus/ npm run build
```

## Your data

- Everything lives in IndexedDB in the browser where you use FOCUS. Nothing is sent anywhere: GitHub Pages only serves the app's files and never sees your entries.
- **Back up:** use *Settings → Export backup* (JSON), which the weekly review also offers. Restore with *Import backup*.
- **Storage protection:** *Settings → Storage protection* asks the browser not to clear the data when space runs low.
- **Reminders:** *Settings → Reminders* downloads an `.ics` file with repeating calendar alerts for the One Thing window, the shutdown and the weekly review. Push notifications come with Phase 2.
- **Moving address:** the data belongs to the web address you open FOCUS at. Before switching to another one (for example a custom domain), export a backup and import it there.

## Structure

```
src/
  domain/      pure rules: dates, gates, One Thing, projects, routines, facts, .ics  (unit-tested)
  db/          Dexie schema and repositories; every change writes a log event in the same transaction
  features/    one folder per screen or flow
  components/  shared UI (buttons, fields, sheets, step frames)
  i18n/        en.json and de.json (keys are type-checked; a test keeps them in sync)
e2e/           Playwright tests
```

## Later phases

These are not built yet; each gets its own plan:

1. Accounts and sync (EU-hosted, ideally end-to-end encrypted)
2. Calendar, timeline and recurring tasks
3. Opt-in AI that only sees text you send it
4. Accountability partners
5. Capture from everywhere
