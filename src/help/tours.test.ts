/**
 * help-views' own checks on the tours (docs/PLAN.md 14.2, 14.3; docs/CONTRACTS-M4.md section 3):
 * every tour id is written with a summary, a length and its steps; each `view-<key>` tour has 4 to 6
 * steps and keeps every one of them in every mode that shows it, through per-mode wording rather than
 * skipped steps; every step and wording points at a `[data-tour]` or a Figure id found in the source
 * and opens a real page; each kept step's page, figure and condition are shown; titles are sentence
 * case and every string keeps the copy rules; no kept step names what the mode hides, and Manager
 * mode reads no amount. The first tours fit their modes: `getting-started` (HR admin),
 * `home-start` on each mode's own home (Manager's on My team), `requests-start` (draft, submit,
 * track, Manager's wording first), `own-data` ending on certification, and `view-whatif` on the
 * Levers tab with the lever list before the result strip.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { HELP_TOUR_IDS, VIEW_TABS } from '@/access/ids'
import { HOME_OF, MODES, type Mode } from '@/access/modes'
import { routeShown } from '@/access/policy'
import { PAGE_KEYS, VIEW_KEYS, type ViewKey } from '@/data/schema'
import { defaultMetrics } from '@/metrics/api'
import { amountsIn } from '@/testkit/leaks'
import { parseDataTab } from '@/views/data/engine/links'
import { type HelpAccess, holds, homeTourOf, stepShown, tourInMode, tourShown } from './access'
import { MANAGER } from './articles/when'
import { copyProblems, sentenceCaseProblem } from './check'
import { namesHidden } from './names'
import { TOURS, targetName, tourById, tourForRoute } from './tours'
import type { Tour, TourStep } from './types'

const SRC = join(__dirname, '..')

/**
 * Every source file under src but tests, test kits and the help content itself: where targets and
 * Figure ids live. The tours and articles are left out, so a tour never counts as drawing its own
 * target.
 */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (p === join(SRC, 'help', 'articles') || p === join(SRC, 'testkit')) continue
      sourceFiles(p, out)
    } else if (
      /\.tsx?$/.test(name) &&
      !/\.(test|testkit)\./.test(name) &&
      p !== join(SRC, 'help', 'tours.ts')
    )
      out.push(p)
  }
  return out
}
const ALL_SOURCE = sourceFiles()
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')

const BARE = Object.fromEntries(MODES.map((m) => [m, accessFor(m, null, defaultMetrics())])) as Record<
  Mode,
  AccessContext
>
const EVERY: { name: string; mode: Mode; access: HelpAccess }[] = MODES.flatMap((m) => [
  { name: `${m} (no scope)`, mode: m, access: BARE[m] },
  { name: `${m} (scope held)`, mode: m, access: { mode: m, can: BARE[m].can } },
])

/** Targets on every page (the masthead and the folder tabs): a step there needs no page. */
const EVERYWHERE = new Set([
  'folder-tabs',
  'masthead-mode',
  'masthead-help',
  'masthead-settings',
  'masthead-data',
  'masthead-audit',
  'masthead-actions',
  'masthead-workspace',
  'masthead-more',
])

/** Every way a step can read: as written, and in each wording (with its own target and page). */
function wordings(s: TourStep): TourStep[] {
  const { wording, ...rest } = s
  return [
    rest,
    ...(wording ?? []).map((w) => ({
      ...rest,
      title: w.title ?? s.title,
      body: w.body,
      ...(w.target ? { target: w.target } : {}),
      ...(w.view ? { view: w.view, tab: w.tab ?? '' } : {}),
    })),
  ]
}

/** Null when a step's page is a real view or page, and its tab a real tab; otherwise why not. */
function routeProblem(view: string, tab: string): string | null {
  if (view === 'data') return !tab || parseDataTab(tab).tab ? null : `no Data room tab ${tab}`
  if ((PAGE_KEYS as readonly string[]).includes(view)) return tab ? `page ${view} has no tabs` : null
  if (!(VIEW_KEYS as readonly string[]).includes(view)) return `no page ${view}`
  if (!tab) return null
  return VIEW_TABS[view as ViewKey].some((t) => t.key === tab.split(/[:/]/)[0]) ? null : `no tab ${tab}`
}

const VIEW_TOURS = TOURS.filter((t) => t.id.startsWith('view-'))
const shownIn = (t: Tour) => EVERY.filter((e) => tourShown(e.access, t.id))

describe('every tour is written', () => {
  it('holds every tour id with a summary, a length and its steps', () => {
    expect(TOURS.map((t) => t.id)).toEqual([...HELP_TOUR_IDS])
    for (const t of TOURS) {
      expect(t.summary.length, t.id).toBeGreaterThan(20)
      expect(t.length, t.id).toMatch(/^\d+ minutes?$/)
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(4)
    }
    for (const v of VIEW_KEYS) expect(tourForRoute(v)?.id, v).toBe(`view-${v}`)
    expect(tourForRoute('data')?.id).toBe('own-data')
    for (const id of ['getting-started', 'home-start', 'requests-start'])
      expect(tourById(id)?.route, id).toBeUndefined()
  })

  it('gives each view tour 4 to 6 steps', () => {
    expect(VIEW_TOURS.map((t) => t.id).sort()).toEqual(VIEW_KEYS.map((v) => `view-${v}`).sort())
    for (const t of VIEW_TOURS) {
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(4)
      expect(t.steps.length, t.id).toBeLessThanOrEqual(6)
    }
  })
})

describe('steps point at real things', () => {
  it('finds every step’s and every wording’s target in the source', () => {
    expect(ALL_SOURCE).toContain('data-tour={`figure-$' + '{id}`}')
    const missing: string[] = []
    for (const t of TOURS)
      for (const s of t.steps.flatMap(wordings)) {
        if (!s.target) continue
        const name = targetName(s)
        if (!name) {
          missing.push(`${t.id}: ${s.target} is not [data-tour="..."]`)
          continue
        }
        const figure = name.startsWith('figure-') ? name.slice('figure-'.length) : null
        const found = figure
          ? ALL_SOURCE.includes(`"${figure}"`) || ALL_SOURCE.includes(`'${figure}'`)
          : ALL_SOURCE.includes(`data-tour="${name}"`) || ALL_SOURCE.includes(`'${name}'`)
        if (!found) missing.push(`${t.id}: ${name}`)
      }
    expect(missing).toEqual([])
    // Not vacuous: the tours' own file is not where a target is found.
    expect(ALL_SOURCE.includes("figureTarget('whatif-levers')")).toBe(false)
  })

  it('opens a real page and tab for every step on a page, and only masthead steps go without one', () => {
    const problems: string[] = []
    for (const t of TOURS)
      for (const s of t.steps.flatMap(wordings)) {
        if (s.view) {
          const why = routeProblem(s.view, s.tab ?? '')
          if (why) problems.push(`${t.id} ${s.title}: ${why}`)
        } else if (s.target && !EVERYWHERE.has(targetName(s) ?? ''))
          problems.push(`${t.id} ${s.title}: needs a page`)
      }
    expect(problems).toEqual([])
  })
})

describe('each mode runs the tours it shows', () => {
  it('keeps every step of each view tour in every mode that shows it, by wording rather than skipping', () => {
    for (const t of VIEW_TOURS) {
      expect(shownIn(t).length, t.id).toBeGreaterThan(0)
      for (const { name, access } of shownIn(t)) {
        const run = tourInMode(access, t)
        expect(run?.steps.length, `${name} ${t.id}`).toBe(t.steps.length)
      }
    }
  })

  it('keeps at least 3 steps of every tour in every mode that shows it', () => {
    for (const t of TOURS)
      for (const { name, access } of shownIn(t))
        expect(tourInMode(access, t)?.steps.length ?? 0, `${name} ${t.id}`).toBeGreaterThanOrEqual(3)
  })

  it('puts each kept step on a page, figure and condition the mode shows, with its wording applied', () => {
    for (const t of TOURS)
      for (const { name, mode, access } of shownIn(t))
        for (const s of tourInMode(access, t)?.steps ?? []) {
          const where = `${name} ${t.id} ${s.title}`
          expect(s.wording, where).toBeUndefined()
          expect(stepShown(access, s), where).toBe(true)
          expect(holds(access, s), where).toBe(true)
          if (s.view) expect(routeShown(mode, s.view, s.tab ?? ''), where).toBe(true)
          const figure = s.target?.match(/^\[data-tour="figure-([^"]+)"\]$/)?.[1]
          if (figure) {
            expect(s.view, where).toBeTruthy()
            expect(access.can(`figure:${figure}`, { view: s.view ?? 'home', tab: s.tab ?? '' }), where).toBe(
              true,
            )
          }
        }
  })

  it('runs no tour a mode hides', () => {
    for (const t of TOURS)
      for (const { name, access } of EVERY)
        if (!tourShown(access, t.id)) expect(tourInMode(access, t), `${name} ${t.id}`).toBeNull()
  })
})

describe('copy and names', () => {
  it('keeps every title sentence case and every string free of em dashes, "!", nagging verbs and banned words', () => {
    const found: string[] = []
    for (const t of TOURS) {
      for (const x of [t.title, t.summary]) found.push(...copyProblems(x).map((p) => `${t.id}: ${p}`))
      const title = sentenceCaseProblem(t.title)
      if (title) found.push(`${t.id}: ${title}`)
      for (const s of t.steps.flatMap(wordings)) {
        const st = sentenceCaseProblem(s.title)
        if (st) found.push(`${t.id} ${s.title}: ${st}`)
        for (const x of [s.title, s.body])
          found.push(...copyProblems(x).map((p) => `${t.id} ${s.title}: ${p}`))
      }
    }
    expect(found).toEqual([])
  })

  it('names nothing a mode hides in any kept step', () => {
    const found: string[] = []
    for (const t of TOURS)
      for (const { name, access } of shownIn(t)) {
        const run = tourInMode(access, t)
        if (!run) continue
        found.push(...namesHidden(access, `tour ${t.id} summary`, run.summary).map((x) => `${name}: ${x}`))
        for (const s of run.steps)
          found.push(
            ...namesHidden(access, `tour ${t.id}`, `${s.title}. ${s.body}`).map((x) => `${name}: ${x}`),
          )
      }
    expect([...new Set(found)]).toEqual([])
  })

  it('is not vacuous: the steps as written would name hidden things in some mode', () => {
    const found: string[] = []
    for (const t of TOURS)
      for (const { access } of shownIn(t))
        for (const s of t.steps) found.push(...namesHidden(access, `tour ${t.id}`, `${s.title}. ${s.body}`))
    expect(found.length).toBeGreaterThan(5)
  })

  it('holds no amount in any step Manager mode runs, while a rounded mode reads one', () => {
    const manager = EVERY.filter((e) => e.mode === 'manager')
    for (const t of TOURS)
      for (const { name, access } of manager) {
        const run = tourInMode(access, t)
        for (const s of run?.steps ?? [])
          expect(amountsIn(`${s.title}. ${s.body}`), `${name} ${t.id} ${s.title}`).toEqual([])
        if (run) expect(amountsIn(run.summary), `${name} ${t.id}`).toEqual([])
      }
    const plan = tourInMode(BARE.hrbp, tourById('view-plan'))
    expect(plan?.steps.some((s) => amountsIn(s.body).length > 0)).toBe(true)
  })
})

describe('the first tours fit their modes', () => {
  it("gives HR admin getting-started and every other mode home-start, on the mode's own home", () => {
    for (const mode of MODES) {
      const run = tourInMode(BARE[mode], tourById(homeTourOf(mode)))
      expect(run, mode).not.toBeNull()
      const views = new Set(run?.steps.flatMap((s) => (s.view ? [s.view] : [])))
      if (HOME_OF[mode] === 'team') {
        expect([...views], mode).toEqual(['team'])
        expect(run?.steps[0].title, mode).toBe('Left to fill')
      }
      if (HOME_OF[mode] === 'home') expect([...views], mode).toEqual(['home'])
    }
    // Each home's hero step has its own wording.
    const heroes = MODES.filter((m) => HOME_OF[m] !== 'data').map(
      (m) => tourInMode(BARE[m], tourById('home-start'))?.steps[0].body,
    )
    expect(new Set(heroes).size).toBe(heroes.length)
  })

  it('walks requests-start through draft, submit and track, with Manager’s wording first', () => {
    const t = tourById('requests-start') as Tour
    expect(t.steps.map((s) => s.view)).toEqual([
      'requests',
      'requests',
      'requests',
      'requests',
      'requests',
      'requests',
    ])
    expect(t.steps.map((s) => s.tab)).toEqual(['new', 'new', 'new', 'new', 'mine', 'approvals'])
    expect(t.steps.some((s) => /Save draft/.test(s.body) && /Submit/.test(s.body))).toBe(true)
    for (const s of t.steps) {
      expect(s.wording?.[0]?.surface, s.title).toBe(MANAGER.surface)
    }
    const run = tourInMode(BARE.manager, t)
    expect(run?.steps.length).toBe(t.steps.length)
    expect(run?.steps.every((s, i) => s.body === t.steps[i].wording?.[0]?.body)).toBe(true)
  })

  it('ends own-data on certification, in the Data room', () => {
    const t = tourById('own-data') as Tour
    const last = t.steps.at(-1) as TourStep
    expect(last.view).toBe('data')
    expect(last.tab?.endsWith('-certify')).toBe(true)
    expect(last.title).toMatch(/^Certify/)
    expect(tourInMode(BARE['hr-admin'], t)?.steps.length).toBe(t.steps.length)
  })

  it('walks view-whatif on the Levers tab: the lever list, then the result strip of heads, cost and gap', () => {
    const t = tourById('view-whatif') as Tour
    expect(t.steps.every((s) => s.view === 'whatif' && s.tab === 'levers')).toBe(true)
    const names = t.steps.map((s) => targetName(s))
    const list = names.indexOf('figure-whatif-levers')
    const strip = names.indexOf('kpi-strip')
    expect(list).toBeGreaterThanOrEqual(0)
    expect(strip).toBeGreaterThan(list)
    const body = t.steps[strip].body
    for (const w of ['Heads change', 'cost change', 'gap change']) expect(body).toContain(w)
  })

  it('moves a step about a tab a mode hides to what that mode shows, never to another mode’s page', () => {
    const plan = tourById('view-plan') as Tour
    const manager = tourInMode(BARE.manager, plan)
    expect(manager?.steps.every((s) => s.tab !== 'overview')).toBe(true)
    const finance = tourInMode(BARE.finance, plan)
    expect(finance?.steps.every((s) => s.tab !== 'transfers')).toBe(true)
    const requests = tourById('view-requests') as Tour
    expect(tourInMode(BARE.manager, requests)?.steps.every((s) => s.tab !== 'queue')).toBe(true)
    expect(tourInMode(BARE.finance, requests)?.steps.every((s) => s.tab !== 'new')).toBe(true)
    const finance2 = tourInMode(BARE.hrbp, tourById('view-finance'))
    expect(finance2?.steps.every((s) => s.tab !== 'export')).toBe(true)
  })
})

describe('M4 review: the tours say what the app does', () => {
  it('walks the trade lever on [data-tour="whatif-trade"] in every mode that runs view-whatif (HL-9, PLAN 11.5)', () => {
    const t = tourById('view-whatif') as Tour
    expect(t.steps.length).toBeGreaterThanOrEqual(4)
    expect(t.steps.length).toBeLessThanOrEqual(6)
    const trade = t.steps.find((s) => targetName(s) === 'whatif-trade')
    expect(trade?.title).toBe('Trade seats')
    expect(trade?.body).toContain('worth no more standard heads; what is left over stays as trade credit')
    // The anchor is drawn by the lever form (src/views/whatif/ui/LeverForm.tsx).
    expect(ALL_SOURCE).toContain('data-tour="whatif-trade"')
    let runs = 0
    for (const { name, access } of EVERY) {
      const run = tourInMode(access, t)
      if (!run) continue
      runs++
      expect(
        run.steps.some((s) => targetName(s) === 'whatif-trade'),
        name,
      ).toBe(true)
    }
    expect(runs).toBeGreaterThanOrEqual(8)
  })

  it('never says a trade gets seats of equal weight (CP-7)', () => {
    const found: string[] = []
    for (const tour of TOURS)
      for (const s of tour.steps)
        for (const w of wordings(s)) if (/equal weight/.test(w.body)) found.push(`${tour.id}: ${w.title}`)
    expect(found).toEqual([])
  })

  it('folds bridge steps only while Show pay amounts is off, where the mode has the switch (SA-4)', () => {
    const t = tourById('view-forecast') as Tour
    const bridge = (access: HelpAccess) =>
      tourInMode(access, t)?.steps.find((s) => s.view === 'forecast' && s.tab === 'bridge')?.body ?? ''
    expect(bridge(BARE['hr-admin'])).toContain('with it on, every step shows')
    expect(bridge(BARE.finance)).toContain('folds into Other changes')
    expect(bridge(BARE.finance)).not.toContain('Show pay amounts')
  })
})
