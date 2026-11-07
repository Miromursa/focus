import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join } from 'node:path'

// Paths are relative to baseURL (no leading slash), so the suite also runs under a base path such as /focus/.

// November 2026 in Berlin (CET, UTC+1). 2026-11-02 is a Monday.
const at = (date: string, time = '09:00') => new Date(`${date}T${time}:00+01:00`)

/** Runs the first-run setup with one Active project and a daily routine. */
async function setup(page: Page, url = './') {
  await page.goto(url)
  await page.getByRole('button', { name: 'Start setup' }).click()
  await page.getByRole('textbox', { name: 'Every project you have going' }).fill('Thesis\nJob applications\nClub newsletter')
  await page.getByRole('button', { name: 'Next' }).click()
  const thesis = page.getByRole('listitem').filter({ hasText: 'Thesis' })
  await thesis.getByRole('radio', { name: 'Active' }).click()
  await thesis.getByRole('textbox', { name: 'Next action' }).fill('Email Prof. Weber')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('textbox', { name: 'After…' }).fill('After coffee')
  await page.getByRole('textbox', { name: 'e.g. Take vitamins' }).fill('Take vitamins')
  await page.getByRole('button', { name: 'Next' }).click() // routine → schedule
  await page.getByRole('button', { name: 'Next' }).click() // schedule → rest
  await page.getByRole('button', { name: 'Next' }).click() // rest → One Thing
  await page.getByRole('textbox', { name: 'Tiny first step' }).fill('Open the mail app')
  await page.getByRole('button', { name: 'Finish setup' }).click()
  // Today renders only after the setup transaction has committed. Navigating away earlier aborts it.
  await expect(page.getByText('The One Thing')).toBeVisible()
}

/** Moves the app's clock and opens the app fresh, as if it was opened at that time. Data stays in IndexedDB. */
async function openAt(page: Page, when: Date) {
  await page.clock.setSystemTime(when)
  await page.goto('./')
}

test('setup leads to Today with the One Thing and its first step', async ({ page }) => {
  await page.clock.install({ time: at('2026-11-02') })
  await setup(page)
  await expect(page.getByText('The One Thing')).toBeVisible()
  await expect(page.getByText('Email Prof. Weber')).toBeVisible()
  await expect(page.getByText('First step: Open the mail app')).toBeVisible()
  await expect(page.getByText('After coffee')).toBeVisible()
})

test('captures from the keyboard alone in under 5 seconds', async ({ page }) => {
  await page.clock.install({ time: at('2026-11-02') })
  await setup(page)
  await expect(page.getByText('The One Thing')).toBeVisible()
  const started = Date.now()
  await page.keyboard.press('c')
  await page.keyboard.type('Call the bank')
  await page.keyboard.press('Enter')
  await expect(page.getByText('In the inbox.')).toBeVisible()
  expect(Date.now() - started).toBeLessThan(5000)
  await page.getByRole('link', { name: 'Inbox' }).click()
  await expect(page.getByRole('button', { name: 'Call the bank', exact: true })).toBeVisible()
})

test('urgent triage moves the One Thing to the next workday', async ({ page }) => {
  await page.clock.install({ time: at('2026-11-06') }) // Friday
  await setup(page)
  await page.getByRole('button', { name: 'Capture (C)' }).click()
  await page.getByRole('textbox', { name: 'Capture' }).fill('Server is down')
  await page.getByRole('button', { name: 'Triage' }).click()
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await page.getByRole('button', { name: "Yes, it can't wait" }).click()
  await page.getByRole('button', { name: 'Move it and do this now' }).click()
  await expect(page.getByText('Moved to Mon 9 Nov for something urgent.')).toBeVisible()
  await expect(page.getByText('Server is down')).toBeVisible()
})

test('shutdown carries the unfinished One Thing to the next workday', async ({ page }) => {
  await page.clock.install({ time: at('2026-11-06') }) // Friday
  await setup(page)
  await openAt(page, at('2026-11-06', '18:00'))
  await page.getByRole('link', { name: 'Start shutdown' }).click()
  await page.getByRole('textbox', { name: 'Brain dump' }).fill('Reply to Mia')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('One Thing: not done.')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Not finished on Fri 6 Nov. Carried over.')).toBeVisible()
  await page.getByRole('button', { name: 'Set as One Thing' }).click()
  await expect(page.getByText('Monday 9 November is a workday.')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Done for today' }).click()
  await expect(page.getByRole('heading', { name: 'Done for today.' })).toBeVisible()

  await openAt(page, at('2026-11-09')) // Monday: no gate, the One Thing is waiting
  await expect(page.getByText('The One Thing')).toBeVisible()
  await expect(page.getByText('Email Prof. Weber')).toBeVisible()
})

test('a skipped shutdown opens the check-in; skipping needs a reason that shows up in the review', async ({ page }) => {
  await page.clock.install({ time: at('2026-11-02') }) // Monday
  await setup(page)

  await openAt(page, at('2026-11-04')) // Wednesday: Tuesday had no shutdown
  await expect(page.getByRole('heading', { name: 'Morning check-in' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip for now' }).click()
  const confirm = page.getByRole('button', { name: 'Skip with this reason' })
  await expect(confirm).toBeDisabled()
  await page.getByRole('textbox', { name: 'Reason' }).fill('Train delayed')
  await confirm.click()
  await expect(page.getByText('The One Thing')).toBeVisible()

  await openAt(page, at('2026-11-05')) // Thursday: do the check-in this time
  await expect(page.getByRole('heading', { name: 'Morning check-in' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('textbox', { name: 'Tiny first step' }).fill('Open the mail app')
  await page.getByRole('button', { name: 'Set as One Thing' }).click()
  await page.getByRole('button', { name: 'Start the day' }).click()
  await expect(page.getByText('The One Thing')).toBeVisible()

  await openAt(page, at('2026-11-09')) // Monday: Sunday's review was skipped
  await expect(page.getByRole('heading', { name: 'Last 7 days in facts' })).toBeVisible()
  await expect(page.getByText('Overrides: 1.')).toBeVisible()
  await expect(page.getByText('skipped check-in: “Train delayed”')).toBeVisible()
})

test('after a gap the restart flow appears, without a list of what was missed', async ({ page }) => {
  await page.clock.install({ time: at('2026-11-02') })
  await setup(page)
  await openAt(page, at('2026-11-06')) // Friday: no shutdown on Tue, Wed, Thu
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.getByText('No catching up needed.')).toBeVisible()
  await expect(page.getByText(/missed/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('textbox', { name: 'Tiny first step' }).fill('Open the mail app')
  await page.getByRole('button', { name: 'Restart from today' }).click()
  await expect(page.getByText('The One Thing')).toBeVisible()
})

test('the weekly review does not move on until the inbox is empty', async ({ page }) => {
  await page.clock.install({ time: at('2026-11-02') })
  await setup(page)
  await expect(page.getByText('The One Thing')).toBeVisible()
  await page.keyboard.press('c')
  await page.keyboard.type('Buy stamps')
  await page.keyboard.press('Enter')
  await expect(page.getByText('In the inbox.')).toBeVisible()
  await page.goto('review')
  await page.getByRole('button', { name: 'Next' }).click()
  const next = page.getByRole('button', { name: 'Next' })
  await expect(next).toBeDisabled()
  await expect(page.getByText('1 left')).toBeVisible()
  await page.getByRole('button', { name: 'Done: Buy stamps' }).click()
  await expect(next).toBeEnabled()
})

test('a fourth Active project needs another one parked in the same step', async ({ page }) => {
  await page.clock.install({ time: at('2026-11-02') })
  await setup(page)
  for (const [name, action] of [
    ['Job hunt', 'Update CV'],
    ['Club', 'Book the room'],
  ]) {
    await page.goto('projects/new')
    await page.getByRole('textbox', { name: 'Name' }).fill(name)
    await page.getByRole('textbox', { name: 'Next action' }).fill(action)
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  }
  await page.goto('projects/new')
  await expect(page.getByRole('radio', { name: 'Parked' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('textbox', { name: 'Name' }).fill('Spanish')
  await page.getByRole('radio', { name: 'Active' }).click()
  await page.getByRole('textbox', { name: 'Next action' }).fill('Book a course')
  await expect(page.getByText('3 projects are Active. Park one to make room.')).toBeVisible()
  await page.getByRole('button', { name: 'Create project' }).click()
  const room = page.getByRole('dialog', { name: '3 projects are Active' })
  await room.getByText('Club').click()
  await room.getByRole('button', { name: 'Park it and continue' }).click()
  await expect(page.getByText('Active · 3/3')).toBeVisible()
  await page.getByRole('radio', { name: 'Parked' }).click()
  await expect(page.getByRole('link', { name: 'Club', exact: true })).toBeVisible()
})

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

/** A throwaway static server for dist/ under the app's base path, so the test can switch the network off for real. */
function serveDist(port: number, base: string): Promise<Server> {
  const root = join(process.cwd(), 'dist')
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    if (!pathname.startsWith(base)) {
      res.writeHead(404)
      res.end()
      return
    }
    const path = pathname.slice(base.length)
    const file = extname(path) ? join(root, path) : join(root, 'index.html')
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

test('works offline after the first visit, including a refresh on Today', async ({ page, baseURL }) => {
  const base = baseURL ? new URL(baseURL).pathname : '/'
  const port = 4180 + test.info().parallelIndex
  const server = await serveDist(port, base)
  const app = `http://localhost:${port}${base}`
  await page.clock.install({ time: at('2026-11-02') })
  await page.goto(app)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await setup(page, app)

  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))

  // Back to Today through the app, then refresh. The address has to stay inside the service worker's scope.
  await page.getByRole('link', { name: 'Inbox', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page).toHaveURL(app)
  await page.reload()
  await expect(page.getByText('The One Thing')).toBeVisible()
  await page.goto(`${app}inbox`)
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible()
})
