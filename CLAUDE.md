# FOCUS

PWA that runs the system in `focus-system.md` (Part 1 is the reasoning, Part 2 the app spec). That file holds personal notes, so it is gitignored: never commit it, because the repo (`Miromursa/focus`) is public. Phase 1 is built: local-only, offline, no backend. Later phases get their own plans.

## Commands

- `npm run dev` (port 5173)
- `npm run build`
- `npm test` (Vitest)
- `npm run test:e2e` (Playwright, installed Edge, production build on port 4173)
- `npm run lint` (oxlint)
- `npm run typecheck`
- Deploy: push to `main`. `.github/workflows/deploy.yml` runs typecheck, lint, unit and e2e with `BASE_PATH` set to the Pages path, then publishes that build to https://miromursa.github.io/focus/.

Keep typecheck, lint, unit and e2e green.

## Architecture rules

- **Pure rules:** `src/domain/` holds pure functions that take `now` and state as arguments, with no Dexie and no `Date.now()`. Put new rules here, with tests.
- **Repositories:** `src/db/` functions wrap each state change in `tx()` and call `logEvent()` in the same transaction. The events table is the user's hard log, so never change state without an event.
- **Soft deletes:** records keep `createdAt`/`updatedAt`/`deletedAt` so a Phase 2 sync can merge them. Use soft deletes.
- **Dates:** `LocalDate` is `YYYY-MM-DD` in the device timezone, shifted by `settings.dayStartHour` (default 04:00). Use `toLocalDate`, never raw `toISOString()`.
- **UI:** read data with `useLiveQuery`. Get `settings`, `now` and `today` from `useApp()`. Don't call `Date.now()` during render.
- **Copy:** all of it lives in `src/i18n/en.json` and `de.json`, with type-checked keys. `i18n.test.ts` fails if the two files diverge in keys or placeholders. Use `_one`/`_other` plus `count` for plurals.

## Product rules (the user chose these; don't loosen them without asking)

- **Gates:** rituals gate the app, in the order setup → restart → weekly review → morning check-in (`domain/gates.ts`). Capture stays available behind every gate.
- **Overrides:** getting past any gate or rule takes a typed reason, which is logged (`overrides` table) and shown in the weekly review facts. Gates can be turned off only during a review or with a reason.
- **Projects:** at most 3 Active, and Active requires a next action (blocked, not just warned). Parked requires a reconsider date.
- **One Thing:** one per date, and picking it requires a tiny first step. At 3+ slides, the next pick needs a decision.
- **Tone:** plain facts. No red, no streaks, points, badges or confetti, and no guilt copy. The restart flow never lists what was missed.
- **Privacy:** nothing leaves the device. Any future AI must be opt-in, per request and limited to the text the user sends.

## Gotchas

- `vite.config.ts`: keep `webmanifest` out of `workbox.globPatterns`. The plugin adds the manifest itself, and a duplicate precache entry makes Workbox refuse to install, so the app silently stops working offline.
- The Claude browser pane can't register service workers. Test offline with `npm run test:e2e` (the offline test serves `dist/` itself and then shuts the server down).
- On Windows the Vite dev watcher can miss rapid successive edits. If the browser runs stale code, `touch` the file.
- `App.tsx` gives the router `BASE_URL` with its trailing slash. Stripped, Today's address becomes `/focus`, which is outside the service worker's scope, so refreshing Today offline fails. The offline e2e test covers this.
- E2E paths are relative to `baseURL` (`page.goto('./')`, `page.goto('inbox')`), so the suite runs under `/focus/` in CI. A leading slash would skip the base path. To run it locally under the base path, set `BASE_PATH=/focus/` from PowerShell; Git Bash rewrites `/focus/` into a Windows path unless you prefix `MSYS_NO_PATHCONV=1`.
- The repo is public. Commits use the GitHub no-reply address (repo-local `user.email`); keep it, and keep personal data out of commits, test data included.
