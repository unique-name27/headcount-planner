/**
 * The role homes' figures (docs/PLAN.md 8.3, 9.3 and 12; the template app's home figures tests):
 * `HOME_FIGURES` lists exactly the ids the homes draw; each home's figures show in its own mode and
 * in no other mode; every metric a home draws (the hero, the key figures, Needs attention) shows in
 * that mode, and every cost, band or difference metric is hidden in Manager mode (12: the G, B and D
 * metrics) wherever it would be drawn, and every amount outside the rounded allow-list (7.3 and 8.3
 * `cost:component`) in HRBP and Leader mode; the source keeps the house rules (a metric on every Figure,
 * Hero and ListFigure; no em dash in a sentence; no "!"); and Home is figureless only in the modes
 * with no role home.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { METRIC_IDS } from '@/access/ids'
import { MODES, type Mode } from '@/access/modes'
import { decide } from '@/access/policy'
import type { AnalyticsContext } from '@/data/context'
import { CATALOG } from '@/metrics/catalog'
import { METRIC_GUARD, managerHides, ROUNDED_MODES, roundedHides, showsMoney } from '@/metrics/guardClass'
import { ID as ACTIONS } from '@/views/actions/metrics'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { ID as PLAN } from '@/views/plan/metrics'
import { view } from '../index'
import { ALL_HOME_FIGURES, HOME_FIGURES, HOME_KEY_FIGURES, type HomeSlug, SHARED, SLUG_OF } from './figures'

const dir = new URL('../ui/', import.meta.url)
const files = readdirSync(dir).filter(
  (f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.endsWith('.test.ts'),
)
const text = (f: string) => readFileSync(new URL(f, dir), 'utf8')
const engineDir = new URL('./', import.meta.url)
const engineFiles = readdirSync(engineDir).filter(
  (f) => /\.ts$/.test(f) && !f.endsWith('.test.ts') && f !== 'fixtures.ts',
)

const HOME_MODES = MODES.filter((m) => SLUG_OF[m] != null) as Mode[]
const AT = { view: 'home', tab: 'overview' }
const metricViews = (id: string) => CATALOG.byId.get(id)?.views
const shows = (mode: Mode, metric: string) =>
  decide(mode, `metric:${metric}`, undefined, { metricViews }).access !== 'hidden'

/** The metrics each home draws on its own: its hero, its key figures and Needs attention's. */
const DRAWN: Readonly<Record<HomeSlug, readonly string[]>> = {
  unit: [PLAN.headsActual, ...HOME_KEY_FIGURES.unit.map((k) => k.metricId), ACTIONS.itemsOpen],
  rollup: [FORECAST.headsYearEnd, ...HOME_KEY_FIGURES.rollup.map((k) => k.metricId), ACTIONS.itemsOpen],
  fin: [FORECAST.costFullYear, ...HOME_KEY_FIGURES.fin.map((k) => k.metricId), ACTIONS.itemsOpen],
}

describe('the role homes’ figures', () => {
  it('lists exactly the ids the homes draw, each a home id', () => {
    const drawn = new Set(
      files.flatMap((f) => [...text(f).matchAll(/id="(home-[a-z0-9-]+)"/g)].map((m) => m[1])),
    )
    expect([...drawn].sort()).toEqual([...ALL_HOME_FIGURES].sort())
    for (const [slug, ids] of Object.entries(HOME_FIGURES))
      for (const id of ids) expect(SHARED.includes(id) || id.startsWith(`home-${slug}-`), id).toBe(true)
  })

  it('shows each home’s figures in its own mode and in no other mode', () => {
    for (const mode of HOME_MODES) {
      const own = new Set(HOME_FIGURES[SLUG_OF[mode] as HomeSlug])
      for (const id of ALL_HOME_FIGURES) {
        const shown = decide(mode, `figure:${id}`, AT).access !== 'hidden'
        expect(shown, `${mode} ${id}`).toBe(own.has(id))
      }
    }
    for (const mode of ['manager', 'hr-admin'] as const)
      for (const id of ALL_HOME_FIGURES)
        expect(decide(mode, `figure:${id}`, AT).access, `${mode} ${id}`).toBe('hidden')
  })

  it('draws only metrics the dictionary names and the home’s mode shows', () => {
    for (const mode of HOME_MODES) {
      const slug = SLUG_OF[mode] as HomeSlug
      for (const metric of DRAWN[slug]) {
        expect(METRIC_IDS, metric).toContain(metric)
        expect(shows(mode, metric), `${mode} ${metric}`).toBe(true)
      }
    }
  })
})

describe('cost metrics (docs/PLAN.md 12, guard G, B and D)', () => {
  // Whole money metrics; one whose money is only a part (asks' band part, a cost part) shows its
  // counts in Manager mode with its money columns dropped (8.3 `cost:band`, the `band: true` flag).
  const money = METRIC_IDS.filter((id) => showsMoney(id) && !METRIC_GUARD[id]?.part)

  it('are many, and every one is hidden in Manager mode wherever it is drawn', () => {
    expect(money.length).toBeGreaterThan(15)
    for (const id of money) {
      expect(managerHides(id), id).toBe(true)
      expect(shows('manager', id), id).toBe(false)
    }
  })

  it('reach a home only in a mode that shows cost (never Manager)', () => {
    for (const mode of HOME_MODES)
      for (const id of DRAWN[SLUG_OF[mode] as HomeSlug].filter(showsMoney))
        expect(['hrbp', 'leader', 'finance'], `${mode} ${id}`).toContain(mode)
  })

  it('outside the rounded allow-list are hidden in HRBP and Leader mode, and their homes draw none (7.3, cost:component)', () => {
    const component = METRIC_IDS.filter(roundedHides)
    expect(component.length).toBeGreaterThan(3)
    for (const mode of ROUNDED_MODES) {
      for (const id of component) expect(shows(mode, id), `${mode} ${id}`).toBe(false)
      const slug = SLUG_OF[mode] as HomeSlug
      for (const id of DRAWN[slug]) expect(roundedHides(id), `${mode} ${id}`).toBe(false)
    }
    // Finance draws one of them (freeze savings) and shows it.
    expect(DRAWN.fin.filter(roundedHides)).toEqual(['finance.freeze.savings'])
    expect(shows('finance', 'finance.freeze.savings')).toBe(true)
  })
})

describe('the home source', () => {
  it('declares a metric on every Figure, Hero and list it draws', () => {
    let n = 0
    for (const f of files.filter((x) => x.endsWith('.tsx')))
      for (const tag of ['<Figure', '<Hero', '<ListFigure'])
        for (const chunk of text(f).split(tag).slice(1)) {
          // A JSX element (props on the next line, or a type argument first), not another name.
          if (!/^(\s|<[A-Za-z]+>\s)/.test(chunk)) continue
          n++
          expect(chunk.slice(0, 600), `${f} ${tag}`).toMatch(/\bmetric=\{/)
          expect(chunk.slice(0, 600), `${f} ${tag}`).toMatch(/\buses=\{/)
        }
    expect(n).toBeGreaterThanOrEqual(15)
  })

  it('writes no em dash into a sentence and no exclamation mark', () => {
    for (const f of [...files.map((x) => `../ui/${x}`), ...engineFiles]) {
      const t = readFileSync(new URL(f, engineDir), 'utf8')
      expect(t, f).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      expect(t, f).not.toMatch(/'[^'\n]*!'/)
    }
  })

  it('raises no Action center items of its own (homes stay free of actions, 9.6)', () => {
    expect(view.actions).toBeUndefined()
  })
})

describe('Home without figures', () => {
  const ctxIn = (mode: Mode) => ({ access: { mode } }) as unknown as AnalyticsContext

  it('is figureless only in a mode with no role home', () => {
    for (const mode of MODES) expect(view.figureless?.(ctxIn(mode)), mode).toBe(!SLUG_OF[mode])
    expect(view.figureless?.(ctxIn('manager'))).toBe(true)
    expect(view.figureless?.(ctxIn('finance'))).toBe(false)
  })
})
