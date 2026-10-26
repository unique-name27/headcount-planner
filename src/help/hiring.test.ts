/**
 * Help for Plan > Hiring and its Open to hire tile, in every mode (docs/PLAN.md 9.7 "Help" and
 * "Homes", 14.2; the hiring freeze, docs/CONTRACTS-HIRING.md 3, homes-help):
 *  - the `view-plan` tour carries the step on the quarter table at `HIRING_TOUR_AT` (6 steps), and
 *    every mode runs all 6 (at least 3), on a page, tab and figure it shows;
 *  - the glossary terms 9.7 names, and every hiring metric, are in every mode's glossary, as the
 *    catalog words them, and in every mode's Settings > Formulas;
 *  - "Learn more" on a hiring tile opens `view-plan`, whose Hiring section every mode reads (My
 *    team's note in Manager mode only, the role homes' line in HRBP and Leader mode only);
 *  - `view-plan`, `view-home` and `view-team` pass `articleProblems` and name nothing a mode hides;
 *  - the homes' help names Open to hire where the tile is (Unit plan, Rollup vs target, My team) and
 *    not on Plan vs actual;
 *  - What's new tells each mode about the tab, and about its home's tile where it has one.
 * The module is heads only: no amount in anything here, and no "leave" in what Manager or Finance
 * mode reads.
 */
import { describe, expect, it } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { MODES, type Mode } from '@/access/modes'
import { routeShown } from '@/access/policy'
import { defaultMetrics } from '@/metrics/api'
import { METRICS } from '@/metrics/catalog'
import { amountsIn } from '@/testkit/leaks'
import { PLAN_FIGURES } from '@/views/plan/engine/figures'
import { HIRING_KPIS, OPEN_TO_HIRE_NOTE } from '@/views/plan/engine/hiringTab'
import { HIRING_METRIC_IDS, ID } from '@/views/plan/metrics'
import {
  articleInMode,
  articleShown,
  formulaRowShown,
  glossaryInMode,
  type HelpAccess,
  learnMoreIn,
  stepShown,
  tourInMode,
} from './access'
import { articleById } from './articles'
import { articleProblems, copyProblems } from './check'
import { buildGlossary } from './glossary'
import {
  HIRING_GLOSSARY,
  HIRING_SECTION,
  HIRING_SECTION_TITLE,
  HIRING_TOUR_AT,
  HIRING_TOUR_STEP,
} from './hiring'
import { blockTexts, plainText } from './markup'
import { namesHidden } from './names'
import { figureTarget, TOURS, tourById } from './tours'
import type { HelpArticle, Tour } from './types'
import { RELEASE_NOTES, releaseNotesIn } from './whatsNew'
import { HELP_WORLD } from './world.testkit'

const BARE = Object.fromEntries(MODES.map((m) => [m, accessFor(m, null, defaultMetrics())])) as Record<
  Mode,
  AccessContext
>

/** Each mode with no scope held (the bare policy) and with one held (a team, unit or org picked). */
const EVERY: { name: string; mode: Mode; access: HelpAccess }[] = MODES.flatMap((m) => [
  { name: `${m} (no scope)`, mode: m, access: BARE[m] },
  { name: `${m} (scope held)`, mode: m, access: { mode: m, can: BARE[m].can } },
])

const article = (id: string): HelpArticle => {
  const a = articleById(id)
  if (!a) throw new Error(`no article ${id}`)
  return a
}
const planTour = (): Tour => {
  const t = tourById('view-plan')
  if (!t) throw new Error('no view-plan tour')
  return t
}

/** What a mode reads of an article: title, summary and every shown block, as plain text. */
const shownText = (access: HelpAccess, id: string): string => {
  const a = articleInMode(access, article(id))
  return [a.title, a.summary, ...a.body.flatMap((b) => blockTexts(b))].map(plainText).join('\n')
}

/** Leave words Manager and Finance mode never read (16.1; docs/CONTRACTS-HIRING.md 4). */
const LEAVE = /\bleave\b/i

describe('the view-plan tour (9.7 Help: a step on the quarter table, 4 to 6 steps per mode)', () => {
  it('has the hiring step at HIRING_TOUR_AT, after Openings and before Transfers, 6 steps in all', () => {
    const t = planTour()
    expect(t.steps).toHaveLength(6)
    expect(t.steps[HIRING_TOUR_AT]).toBe(HIRING_TOUR_STEP)
    expect(t.steps[HIRING_TOUR_AT - 1].tab).toBe('openings')
    expect(t.steps[HIRING_TOUR_AT + 1].tab).toBe('transfers')
    expect(HIRING_TOUR_STEP.target).toBe(figureTarget(PLAN_FIGURES.hiringQuarters))
    expect(t.steps.filter((s) => s.tab === 'hiring')).toHaveLength(1)
    expect(t.summary).toContain('hiring progress')
  })

  it('keeps all 6 steps in every mode, the hiring step on a tab and figure the mode shows', () => {
    for (const { name, mode, access } of EVERY) {
      const run = tourInMode(access, planTour())
      expect(run?.steps.length, name).toBe(6)
      expect(run?.steps.length ?? 0, name).toBeGreaterThanOrEqual(3)
      const step = run?.steps[HIRING_TOUR_AT]
      expect(step?.target, name).toBe(HIRING_TOUR_STEP.target)
      expect(step && stepShown(access, step), name).toBe(true)
      expect(routeShown(mode, 'plan', 'hiring'), name).toBe(true)
      expect(access.can(`figure:${PLAN_FIGURES.hiringQuarters}`, { view: 'plan', tab: 'hiring' }), name).toBe(
        true,
      )
      expect(namesHidden(access, 'tour view-plan', `${step?.title}. ${step?.body}`), name).toEqual([])
    }
  })

  it('drops the step where its figure is hidden (the check is not vacuous)', () => {
    const can: HelpAccess['can'] = (s, at, info) =>
      s !== `figure:${PLAN_FIGURES.hiringQuarters}` && BARE.manager.can(s, at, info)
    expect(stepShown({ mode: 'manager', can }, HIRING_TOUR_STEP)).toBe(false)
    expect(stepShown(BARE.manager, HIRING_TOUR_STEP)).toBe(true)
  })
})

describe('the glossary and Settings > Formulas (9.7 Help, 14.2)', () => {
  const glossary = buildGlossary(METRICS)

  it('holds the five terms 9.7 names and every hiring metric in every mode, as the catalog words them', () => {
    for (const { name, access } of EVERY) {
      const shown = glossaryInMode(access, glossary)
      for (const id of HIRING_METRIC_IDS) {
        const entry = shown.find((e) => e.id === id)
        const own = glossary.find((e) => e.id === id)
        expect(entry, `${name} ${id}`).toBeDefined()
        expect(entry?.definition, `${name} ${id}`).toBe(own?.definition)
        expect(entry?.where, `${name} ${id}`).toBe('Plan')
      }
      for (const g of HIRING_GLOSSARY)
        expect(shown.find((e) => e.id === g.metricId)?.term, `${name} ${g.term}`).toBe(g.term)
    }
  })

  it('lists every hiring metric in every mode’s Settings > Formulas', () => {
    for (const { name, access } of EVERY)
      for (const id of HIRING_METRIC_IDS) {
        const d = METRICS.find((m) => m.id === id)
        const texts = [d?.name ?? null, d?.definition ?? null, d?.formula ?? null, d?.population ?? null]
        expect(formulaRowShown(access, id, texts), `${name} ${id}`).toBe(true)
      }
  })

  it('holds no amount, and no leave word in what Manager and Finance mode read', () => {
    for (const id of HIRING_METRIC_IDS) {
      const d = METRICS.find((m) => m.id === id)
      const text = [d?.name, d?.definition, d?.formula, d?.population].join('\n')
      expect(amountsIn(text), id).toEqual([])
      expect(copyProblems(text), id).toEqual([])
      expect(text, id).not.toMatch(LEAVE)
      expect(text.toLowerCase(), id).not.toContain('headcount to hire')
    }
    // Not vacuous: the scanners find an amount and a leave word.
    expect(amountsIn('Open to hire, $1.2M').length).toBeGreaterThan(0)
    expect('People on leave stay in current heads').toMatch(LEAVE)
  })
})

describe('Learn more on a hiring tile (14.2)', () => {
  it('opens view-plan in every mode, from every tile and metric of the tab', () => {
    for (const { name, access } of EVERY) {
      for (const id of HIRING_METRIC_IDS) expect(learnMoreIn(access, id), `${name} ${id}`).toBe('view-plan')
      for (const k of HIRING_KPIS)
        expect(learnMoreIn(access, k.metricId), `${name} ${k.id}`).toBe('view-plan')
    }
  })

  it('lands on an article every mode reads with its Hiring section', () => {
    for (const { name, access } of EVERY) {
      expect(articleShown(access, 'view-plan'), name).toBe(true)
      const a = articleInMode(access, article('view-plan'))
      const headings = a.body.flatMap((b) => ('h' in b ? [b.h] : []))
      expect(headings, name).toContain(HIRING_SECTION_TITLE)
      expect(headings.indexOf(HIRING_SECTION_TITLE), name).toBe(headings.indexOf('Openings') + 1)
      const text = shownText(access, 'view-plan')
      for (const b of HIRING_SECTION.slice(0, 3))
        for (const t of blockTexts(b)) expect(text, `${name}: ${t}`).toContain(plainText(t))
    }
  })

  it('shows My team’s note in Manager mode only, and the homes’ line in HRBP and Leader mode only', () => {
    const team = plainText(blockTexts(HIRING_SECTION[3])[0])
    const homes = plainText(blockTexts(HIRING_SECTION[4])[0])
    for (const { name, mode, access } of EVERY) {
      const text = shownText(access, 'view-plan')
      expect(text.includes(team), name).toBe(mode === 'manager')
      expect(text.includes(homes), name).toBe(mode === 'hrbp' || mode === 'leader')
    }
  })
})

describe('the articles around the tile pass every check in every mode', () => {
  const IDS = ['view-plan', 'view-home', 'view-team'] as const

  it('pass articleProblems', () => {
    expect(IDS.flatMap((id) => articleProblems(article(id), HELP_WORLD))).toEqual([])
  })

  it('name nothing a mode hides, hold no amount in Manager mode and no leave word in Manager or Finance mode', () => {
    const found: string[] = []
    for (const { name, mode, access } of EVERY)
      for (const id of IDS) {
        if (!articleShown(access, id)) continue
        const text = shownText(access, id)
        found.push(...namesHidden(access, id, text).map((x) => `${name}: ${x}`))
        if (mode === 'manager') expect(amountsIn(text), `${name} ${id}`).toEqual([])
      }
    expect(found).toEqual([])
    for (const { name, mode, access } of EVERY) {
      if (mode !== 'manager' && mode !== 'finance') continue
      const a = articleInMode(access, article('view-plan'))
      const start = a.body.findIndex((b) => 'h' in b && b.h === HIRING_SECTION_TITLE)
      const end = a.body.findIndex((b, i) => i > start && 'h' in b)
      const section = a.body
        .slice(start, end)
        .flatMap((b) => blockTexts(b))
        .join('\n')
      expect(section, name).not.toMatch(LEAVE)
    }
  })
})

describe('the homes’ help names the tile where it is (9.7 Homes)', () => {
  it('lists open to hire among the Unit plan and Rollup vs target key figures, not on Plan vs actual', () => {
    for (const mode of ['hrbp', 'leader'] as const)
      expect(shownText(BARE[mode], 'view-home'), mode).toContain('open to hire this fiscal year')
    expect(shownText(BARE.finance, 'view-home')).not.toMatch(/open to hire/i)
  })

  it('says on My team that Open to hire sits under Left to fill and counts heads, not seats', () => {
    const text = shownText(BARE.manager, 'view-team')
    expect(text).toContain('Open to hire')
    expect(text).toContain('Left to fill counts seats')
    expect(article('view-team').metrics).toContain(ID.hiringOpen)
    expect(OPEN_TO_HIRE_NOTE).toContain('Left to fill counts Open and Planned seats')
  })

  it('places the tile "under Left to fill" in every text Manager mode reads, never "beside" (review HU-14)', () => {
    const texts = [
      shownText(BARE.manager, 'view-plan'),
      shownText(BARE.manager, 'view-team'),
      shownText(BARE.manager, 'view-home'),
      JSON.stringify(releaseNotesIn(BARE.manager)),
      JSON.stringify(TOURS.map((t) => tourInMode(BARE.manager, t))),
    ]
    for (const t of texts) expect(t).not.toMatch(/beside (the hero )?Left to fill/i)
    expect(shownText(BARE.manager, 'view-plan')).toContain('Open to hire sits under Left to fill')
    expect(
      releaseNotesIn(BARE.manager)
        .find((n) => n.title === 'Hiring progress')
        ?.items.some((i) => i.includes('Open to hire under Left to fill')),
    ).toBe(true)
  })

  it('walks the tile in the home tours: the key figures on Unit plan and Rollup vs target, the hero on My team', () => {
    const home = tourById('view-home')
    const keyFigures = (mode: Mode) =>
      tourInMode(BARE[mode], home ?? null)?.steps.find((s) => s.target === '[data-tour="kpi-strip"]')?.body
    expect(keyFigures('hrbp')).toContain('open to hire this fiscal year')
    expect(keyFigures('leader')).toContain('open to hire this fiscal year')
    expect(keyFigures('finance')).not.toMatch(/open to hire/i)
    const team = tourInMode(BARE.manager, tourById('view-team') ?? null)
    expect(team?.steps[0].body).toContain('Open to hire')
    expect(team?.steps.length).toBeLessThanOrEqual(6)
  })
})

describe('What’s new (the hiring note)', () => {
  const note = RELEASE_NOTES.find((n) => n.title === 'Hiring progress')

  it('is the newest note, and every mode reads the tab’s items', () => {
    expect(RELEASE_NOTES[0]).toBe(note)
    for (const { name, access } of EVERY) {
      const items = releaseNotesIn(access).find((n) => n.title === 'Hiring progress')?.items ?? []
      expect(
        items.some((t) => t.startsWith('Plan > Hiring')),
        name,
      ).toBe(true)
    }
  })

  it('tells HRBP, Leader and Manager mode about their home’s tile, and no other mode', () => {
    for (const { name, mode, access } of EVERY) {
      const items = releaseNotesIn(access).find((n) => n.title === 'Hiring progress')?.items ?? []
      const tile = items.filter((t) => t.includes('Open to hire') && t.includes('home'))
      expect(tile.length, name).toBe(mode === 'hrbp' || mode === 'leader' || mode === 'manager' ? 1 : 0)
    }
  })
})
