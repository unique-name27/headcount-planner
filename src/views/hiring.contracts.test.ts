/**
 * The hiring freeze's check (docs/CONTRACTS-HIRING.md, docs/PLAN.md 9.7 and change C36): every
 * frozen piece of Plan > Hiring is in place and keeps its rule, before any body is built.
 *
 *  - The engine's inputs carry heads, dates and IDs only: no key names an amount, a rate, a band
 *    estimate or a leave fact, and the engine's source names no pay, offer or leave field.
 *  - The tab sits after Openings in the registry and the policy's tab list, shown in every mode (8.3's
 *    letters SSSSS, Manager's sentence "Your team, in heads."), and every surface it adds has an
 *    explicit decision in every mode: its figures on its tab, its tiles, the drill kinds and dated
 *    columns its counts open (Manager mode lists seats and offers, never people records), and My
 *    team's Open to hire tile (Manager mode only).
 *  - Every hiring drill leaves out every amount, band and leave column of its kind, in every mode.
 *  - The 16 metric ids of 9.7 are in the catalog in the plan's order, with its units, definitions,
 *    formula, population and window, owned by HR business partners, shown in every mode, with no
 *    guard class, no pay, offer or leave field in their lineage, and the copy rules kept.
 *  - The figure ids, tile ids, row keys and words are the frozen data; the homes' slot and My team's
 *    companion tile keep each home's 5 to 7 key figures (Manager stays at 7).
 *  - Help: `view-plan` carries the Hiring section between Openings and Transfers, the glossary terms
 *    are catalog names, and the tour step points at the quarter table on Plan > Hiring.
 *
 * The checks hold before and after the builders fill the bodies (the homes and the tour are checked in
 * both states), and no check calls a stub. The integration added one block that holds only once the
 * module is built: no `notBuilt` stub is left in any of its files, and the tabs with a model of their
 * own are one map, read by the crawl and the Shareable file alike (src/views/tabModels.ts).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BANNED_MODE_WORDS } from '@/access/copy'
import {
  HIRING_AT,
  HIRING_COLUMNS,
  HIRING_DRILL_HIDE,
  HIRING_DRILL_KINDS,
  HIRING_FIGURE_IDS,
  HIRING_KPI_IDS,
  HIRING_SURFACES,
  NAMED_SURFACES,
  PLAN_GRID,
  TEAM_HIRING_FIGURE,
  VIEW_TABS,
} from '@/access/ids'
import { MODES } from '@/access/modes'
import { decide, notNamedOf, ROLE_POLICY, routeShown } from '@/access/policy'
import { HIRING_HOW } from '@/access/policy/manager'
import { standardColumns } from '@/drill/records'
import { articleById } from '@/help/articles'
import { copyProblems, sentenceCaseProblem } from '@/help/check'
import { buildGlossary } from '@/help/glossary'
import {
  HIRING_GLOSSARY,
  HIRING_KEYWORDS,
  HIRING_SECTION,
  HIRING_SECTION_TITLE,
  HIRING_TOUR_AT,
  HIRING_TOUR_STEP,
} from '@/help/hiring'
import { HELP_NAMES } from '@/help/names'
import { figureTarget, tourById } from '@/help/tours'
import type { Block } from '@/help/types'
import { CATALOG, METRICS } from '@/metrics/catalog'
import { METRIC_GUARD } from '@/metrics/guardClass'
import type { MetricDef } from '@/metrics/types'
import {
  HIRING_INPUT_KEYS,
  HIRING_INPUT_KEYS_EXACT,
  PACE_MONTHS,
  TRAILING_MONTHS,
} from '@/plan/engine/hiring'
import {
  HIRING_KEY_FIGURE,
  HIRING_TILE_AT,
  HOME_KEY_COUNT_WITH_HIRING,
  HOME_KEY_FIGURES,
} from '@/views/home/engine/figures'
import { view as planView } from '@/views/plan'
import { PLAN_FIGURES } from '@/views/plan/engine/figures'
import {
  behindByText,
  HIRING_KPIS,
  HIRING_ROWS,
  HISTORY_NOTE,
  hiringOpenLabel,
  NOT_CLOSING_TEXT,
  ON_PACE_TEXT,
  OPEN_TO_HIRE_NOTE,
  overByText,
  QUARTER_KEYS,
} from '@/views/plan/engine/hiringTab'
import { HIRING_METRIC_IDS, ID } from '@/views/plan/metrics'
import { TAB_MODELS, tabModelOf } from '@/views/tabModels'
import { TEAM_FIGURES, TEAM_HIRING, TEAM_KEY_METRICS } from '@/views/team/engine/figures'

/** A key that names money, a rate, a band estimate, pay, an offer's terms or leave. */
const AMOUNT_KEY =
  /amount|usd|local|cost|pay|salary|band|bonus|fee|relocation|offerbase|currency|rate|leave|loaded/i
/** Pay, offer and leave fields by name (8.3 `pay: true`, 7.7). */
const PAY_FIELDS =
  /\b(baseSalary|targetBonusPct|offerBase|offerCurrency|signOnBonus|relocation|agencyFee|bandEstimate\w*|usd\w*|local\w*|costAnnual|onLeave|leavePaid|showPay|showCost)\b/
/** A currency sign, an ISO currency code or a grouped number (the Manager amount scan, 16.1). */
const AMOUNT_TEXT = /[$€£₹₪¥]|\b(USD|EUR|GBP|INR|ILS|TWD|JPY|CNY|SGD|CAD|CHF)\b|\d{1,3}(,\d{3})+/

const def = (id: string): MetricDef => {
  const d = CATALOG.byId.get(id)
  if (!d) throw new Error(`${id} is not registered`)
  return d
}
const metricViews = (id: string) => CATALOG.byId.get(id)?.views
const blockStrings = (b: Block): string[] =>
  'p' in b ? [b.p] : 'h' in b ? [b.h] : 'ul' in b ? [...b.ul] : 'ol' in b ? [...b.ol] : [b.note]

/** Every string the freeze adds that a person reads. */
function frozenWords(): [string, string][] {
  const out: [string, string][] = []
  for (const id of HIRING_METRIC_IDS) {
    const d = def(id)
    for (const w of [d.name, d.definition, d.formula ?? '', d.population ?? '', d.window ?? ''])
      out.push([id, w])
  }
  for (const k of HIRING_KPIS) out.push([`tile ${k.id}`, k.label])
  for (const r of HIRING_ROWS) out.push([`row ${r.key}`, r.label])
  out.push(
    ['open label', hiringOpenLabel('FY27')],
    ['over by', overByText(-3)],
    ['on pace', ON_PACE_TEXT],
    ['behind', behindByText('0.7')],
    ['not closing', NOT_CLOSING_TEXT],
    ['history', HISTORY_NOTE],
    ['open note', OPEN_TO_HIRE_NOTE],
    ['manager how', HIRING_HOW],
    ['tour title', HIRING_TOUR_STEP.title],
    ['tour body', HIRING_TOUR_STEP.body],
  )
  for (const b of HIRING_SECTION) for (const s of blockStrings(b)) out.push(['section', s])
  for (const k of HIRING_KEYWORDS) out.push(['keyword', k])
  return out
}

describe('the engine never sees an amount (9.7 Privacy)', () => {
  it('lists every input key, each list exactly its type (checked by the type checker)', () => {
    expect(Object.values(HIRING_INPUT_KEYS_EXACT).every((v) => v === true)).toBe(true)
    expect(Object.keys(HIRING_INPUT_KEYS_EXACT).sort()).toEqual(Object.keys(HIRING_INPUT_KEYS).sort())
  })

  it('has no input key that names money, a rate, a band estimate, pay or leave', () => {
    const keys = Object.values(HIRING_INPUT_KEYS).flat()
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) expect(k, k).not.toMatch(AMOUNT_KEY)
    // The negative control: the pattern does catch the fields it guards.
    for (const k of ['offerBase', 'bandEstimateUsd', 'baseSalary', 'onLeave', 'leavePaid', 'agencyFee'])
      expect(k).toMatch(AMOUNT_KEY)
  })

  it('names no pay, offer or leave field in its source, and imports only dates, heads and notBuilt', () => {
    const src = readFileSync(new URL('../plan/engine/hiring.ts', import.meta.url), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(PAY_FIELDS)
    // The modules that carry amounts (plan/types' lines, cost, band, FX, the forecast) stay out.
    const ALLOWED = new Set(['@/data/schema', '@/data/fiscal', '@/lib/dates', '../notBuilt', './heads'])
    const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports).toContain('@/data/schema')
    for (const i of imports) expect(ALLOWED.has(i), i).toBe(true)
  })

  it('keeps 9.7 paces and windows', () => {
    expect(PACE_MONTHS).toEqual([3, 6])
    expect(TRAILING_MONTHS).toBe(12)
  })
})

describe('the tab (9.7 Placement)', () => {
  it('sits after Openings in the registry and in the policy tab list', () => {
    const keys = ['overview', 'positions', 'openings', 'hiring', 'transfers']
    expect(VIEW_TABS.plan.map((t) => t.key)).toEqual(keys)
    expect(planView.tabs.map((t) => ({ key: t.key, label: t.label }))).toEqual(VIEW_TABS.plan)
    expect(VIEW_TABS.plan.find((t) => t.key === 'hiring')?.label).toBe('Hiring')
    expect(HIRING_AT).toEqual({ view: 'plan', tab: 'hiring' })
  })

  it('shows in every mode with the plan letters and Manager mode’s sentence', () => {
    expect(PLAN_GRID['tab:plan.hiring']).toBe('SSSSS')
    for (const m of MODES) {
      expect(decide(m, 'tab:plan.hiring').access, m).toBe('shown')
      expect(routeShown(m, 'plan', 'hiring'), m).toBe(true)
      const tab = ROLE_POLICY[m].tabs.plan?.find((t) => t.key === 'hiring')
      expect(tab?.decision.access, m).toBe('shown')
    }
    expect(decide('manager', 'tab:plan.hiring').how).toBe('Your team, in heads.')
    expect(HIRING_HOW).toBe('Your team, in heads.')
  })
})

describe('the policy decides every hiring surface (8.3)', () => {
  it('names each one, explicitly, in every mode', () => {
    for (const s of HIRING_SURFACES) expect(NAMED_SURFACES, s).toContain(s)
    for (const m of MODES)
      for (const s of HIRING_SURFACES) {
        const d = decide(m, s)
        expect(d.how, `${m} ${s}`).not.toBe(notNamedOf(ROLE_POLICY[m]).how)
        if (d.access !== 'shown') expect(d.how, `${m} ${s}`).toBeTruthy()
      }
  })

  it('shows the figures and tiles on their tab in every mode', () => {
    expect(Object.values(PLAN_FIGURES).filter((id) => id.startsWith('plan-hiring-'))).toEqual([
      ...HIRING_FIGURE_IDS,
    ])
    for (const m of MODES) {
      for (const id of HIRING_FIGURE_IDS)
        expect(decide(m, `figure:${id}`, HIRING_AT).access, `${m} ${id}`).toBe('shown')
      for (const k of HIRING_KPIS)
        expect(
          decide(m, `kpi:${k.id}`, HIRING_AT, { metric: k.metricId, metricViews }).access,
          `${m} ${k.id}`,
        ).toBe('shown')
    }
  })

  it('opens seats and offers in every mode, and people records only outside Manager mode', () => {
    for (const m of MODES) {
      expect(decide(m, 'drill:positions').access, m).not.toBe('hidden')
      expect(decide(m, 'drill:reqs').access, m).not.toBe('hidden')
      expect(decide(m, 'drill:workers').access === 'hidden', m).toBe(m === 'manager')
      for (const c of HIRING_COLUMNS) {
        const kind = c.slice(0, c.indexOf('.'))
        const listed = decide(m, `drill:${kind}`).access !== 'hidden'
        expect(decide(m, `column:${c}`).access === 'shown', `${m} ${c}`).toBe(listed)
      }
    }
    // Manager mode: over the tree strictly below your seat (R23).
    expect(decide('manager', 'drill:positions')).toEqual({
      access: 'limited',
      how: 'Rows outside your team are left out.',
    })
  })

  it('shows My team’s Open to hire tile in Manager mode only', () => {
    expect(TEAM_HIRING.figure).toBe(TEAM_HIRING_FIGURE)
    for (const m of MODES)
      expect(decide(m, `figure:${TEAM_HIRING_FIGURE}`).access === 'shown', m).toBe(m === 'manager')
  })

  it('leaves every amount, band and leave column out of every hiring drill, in every mode', () => {
    expect([...HIRING_DRILL_KINDS]).toEqual(['positions', 'workers', 'reqs'])
    for (const kind of HIRING_DRILL_KINDS) {
      const money = standardColumns(kind)
        .filter((c) => c.pay || c.band || c.cost)
        .map((c) => c.key)
      expect(money.length, kind).toBeGreaterThan(0)
      expect([...HIRING_DRILL_HIDE[kind]].sort(), kind).toEqual(expect.arrayContaining(money.sort()))
      const keys = new Set(standardColumns(kind).map((c) => c.key))
      for (const k of HIRING_DRILL_HIDE[kind]) expect(keys.has(k), `${kind}.${k}`).toBe(true)
    }
    expect(HIRING_DRILL_HIDE.workers).toEqual(['onLeave', 'leavePaid'])
  })
})

describe('the metrics of 9.7 (section 12 rows)', () => {
  const UNIT: Record<string, string> = {
    'plan.hiring.approvedByQuarter': 'int',
    'plan.hiring.currentHeads': 'int',
    'plan.hiring.acceptedStarts': 'int',
    'plan.hiring.open': 'int',
    'plan.hiring.openByQuarter': 'int',
    'plan.hiring.newByQuarter': 'int',
    'plan.hiring.expectedExits': 'num1',
    'plan.hiring.toReachPlan': 'num1',
    'plan.hiring.hiresByMonth': 'int',
    'plan.hiring.exitsByMonth': 'int',
    'plan.hiring.pace': 'num1',
    'plan.hiring.exitPace': 'num1',
    'plan.hiring.netPace': 'num1',
    'plan.hiring.attritionRate': 'pct',
    'plan.hiring.neededPace': 'num1',
    'plan.hiring.monthsToClose': 'num1',
  }

  it('are the plan’s 16 ids, in its order, registered under Plan', () => {
    expect([...HIRING_METRIC_IDS]).toEqual(Object.keys(UNIT))
    expect(Object.values(ID).filter((id) => id.startsWith('plan.hiring.'))).toEqual([...HIRING_METRIC_IDS])
    for (const id of HIRING_METRIC_IDS) {
      const d = def(id)
      expect(d.unit, id).toBe(UNIT[id])
      expect(d.views[0], id).toBe('plan')
      expect(d.owner, id).toBe('HR business partners')
      for (const f of [d.definition, d.formula, d.population, d.window]) expect(f?.trim(), id).toBeTruthy()
    }
    expect(def(ID.hiringOpen).views).toEqual(['plan', 'home', 'team'])
    expect(def(ID.hiringOpen).name).toBe('Open to hire')
  })

  it('show no amount: no guard class, no pay, offer, band or leave field, no amount in the words', () => {
    for (const id of HIRING_METRIC_IDS) {
      const d = def(id)
      expect(METRIC_GUARD[id], id).toBeUndefined()
      expect(d.dependsOn, id).toBeUndefined()
      expect(d.params, id).toEqual([])
      for (const f of d.uses) {
        expect(f.startsWith('comp.'), `${id} ${f}`).toBe(false)
        expect(f, `${id} ${f}`).not.toMatch(
          /offerBase|offerCurrency|signOnBonus|relocation|agencyFee|onLeave|leavePaid/,
        )
      }
      for (const w of [d.name, d.definition, d.formula ?? '', d.population ?? '', d.window ?? '']) {
        expect(w, id).not.toMatch(AMOUNT_TEXT)
        expect(w, id).not.toMatch(/\bleav(e|es|ing)\b/i)
        expect(w, id).not.toMatch(/headcount to hire/i)
      }
    }
  })

  it('show in every mode, wherever their views are shown', () => {
    for (const m of MODES)
      for (const id of HIRING_METRIC_IDS)
        expect(decide(m, `metric:${id}`, undefined, { metricViews }).access, `${m} ${id}`).toBe('shown')
  })
})

describe('the frozen data of the tab', () => {
  it('names the six tiles in strip order, the headline first', () => {
    expect(HIRING_KPIS.map((k) => k.id)).toEqual([...HIRING_KPI_IDS])
    expect(HIRING_KPIS.map((k) => k.metricId)).toEqual([
      ID.hiringOpen,
      ID.hiringAcceptedStarts,
      ID.hiringPace,
      ID.hiringExitPace,
      ID.hiringNetPace,
      ID.hiringMonthsToClose,
    ])
    expect(HIRING_KPIS.length).toBeGreaterThanOrEqual(5)
    expect(HIRING_KPIS.length).toBeLessThanOrEqual(7)
    expect(hiringOpenLabel('FY27')).toBe('Open to hire, FY27')
  })

  it('keys the quarter table’s rows once each, every row a registered metric', () => {
    expect(QUARTER_KEYS).toEqual(['q1', 'q2', 'q3', 'q4'])
    expect(new Set(HIRING_ROWS.map((r) => r.key)).size).toBe(HIRING_ROWS.length)
    expect(HIRING_ROWS.filter((r) => r.ahead).map((r) => r.label)).toEqual([
      'Approved heads by quarter end',
      'Current heads',
      'Accepted starts by quarter end',
      'Open to hire',
      'New to hire in the quarter',
      'Expected exits by quarter end',
      'To hire to reach plan',
      'Hires needed per month',
    ])
    for (const r of HIRING_ROWS) {
      expect(CATALOG.byId.has(r.metric), r.key).toBe(true)
      expect(r.format, r.key).toBe(def(r.metric).unit)
      expect(r.ahead || r.history, r.key).toBe(true)
    }
  })

  it('words over plan, the pace and not closing as 9.7 does, with plain counts', () => {
    expect(overByText(-1)).toBe('Over by 1')
    expect(overByText(-12)).toBe('Over by 12')
    expect(ON_PACE_TEXT).toBe('On pace')
    expect(behindByText('0.7')).toBe('Behind by 0.7 a month')
    expect(NOT_CLOSING_TEXT).toBe('Not closing at this pace: exits match or outrun hires.')
  })
})

describe('the homes (9.7 Homes, 9.3)', () => {
  it('re-link Plan > Hiring’s headline tile on the HRBP and Leader homes, 5 to 7 key figures each', () => {
    expect(HIRING_KEY_FIGURE).toEqual({ metricId: ID.hiringOpen, view: 'plan', tab: 'hiring' })
    expect(HIRING_KPIS[0].metricId).toBe(HIRING_KEY_FIGURE.metricId)
    expect(VIEW_TABS[HIRING_KEY_FIGURE.view].map((t) => t.key)).toContain(HIRING_KEY_FIGURE.tab)
    for (const slug of ['unit', 'rollup'] as const) {
      const list = HOME_KEY_FIGURES[slug]
      const at = list.findIndex((k) => k.metricId === HIRING_KEY_FIGURE.metricId)
      // Frozen: not in yet (5); built: in at its slot (6).
      if (at < 0) expect(list.length + 1, slug).toBe(HOME_KEY_COUNT_WITH_HIRING[slug])
      else {
        expect(at, slug).toBe(HIRING_TILE_AT[slug])
        expect(list[at], slug).toEqual(HIRING_KEY_FIGURE)
        expect(list.length, slug).toBe(HOME_KEY_COUNT_WITH_HIRING[slug])
      }
      expect(HIRING_TILE_AT[slug], slug).toBeLessThanOrEqual(list.length)
    }
    expect(HOME_KEY_FIGURES.fin.some((k) => k.metricId === ID.hiringOpen)).toBe(false)
    expect(HOME_KEY_FIGURES.fin).toHaveLength(HOME_KEY_COUNT_WITH_HIRING.fin)
    for (const n of Object.values(HOME_KEY_COUNT_WITH_HIRING)) {
      expect(n).toBeGreaterThanOrEqual(5)
      expect(n).toBeLessThanOrEqual(7)
    }
  })

  it('put My team’s tile beside the hero, not in its 7 key figures', () => {
    expect(TEAM_KEY_METRICS).toHaveLength(7)
    expect(TEAM_KEY_METRICS).not.toContain(ID.hiringOpen)
    expect(TEAM_HIRING).toEqual({
      figure: 'team-open-to-hire',
      metricId: ID.hiringOpen,
      view: 'plan',
      tab: 'hiring',
    })
    // Frozen: a figure id of its own, added to TEAM_FIGURES when the UI draws it.
    const drawn = Object.values(TEAM_FIGURES) as string[]
    expect(drawn.filter((id) => id === TEAM_HIRING.figure).length).toBeLessThanOrEqual(1)
    expect(TEAM_HIRING.figure.startsWith('team-')).toBe(true)
  })
})

describe('help (9.7 Help, 14.2)', () => {
  it('puts the Hiring section in view-plan between Openings and Transfers', () => {
    const a = articleById('view-plan')
    if (!a) throw new Error('no view-plan article')
    const headings = a.body.flatMap((b) => ('h' in b ? [b.h] : []))
    expect(headings).toContain(HIRING_SECTION_TITLE)
    expect(headings.indexOf('Hiring')).toBe(headings.indexOf('Openings') + 1)
    expect(headings.indexOf('Transfers')).toBe(headings.indexOf('Hiring') + 1)
    const start = a.body.indexOf(HIRING_SECTION[0])
    expect(start).toBeGreaterThan(0)
    expect(a.body.slice(start, start + HIRING_SECTION.length)).toEqual([...HIRING_SECTION])
    for (const k of HIRING_KEYWORDS) expect(a.keywords, k).toContain(k)
    expect(a.summary).toContain('hiring progress')
  })

  it('names Plan > Hiring for the names scan', () => {
    expect(HELP_NAMES).toContainEqual({ phrase: 'Plan > Hiring', surface: 'tab:plan.hiring' })
  })

  it('gains the glossary terms 9.7 names, each a catalog entry', () => {
    const glossary = buildGlossary(METRICS)
    expect(HIRING_GLOSSARY.map((g) => g.term)).toEqual([
      'Open to hire',
      'Accepted starts',
      'Hiring pace',
      'Net hiring pace',
      'Attrition (heads)',
    ])
    for (const g of HIRING_GLOSSARY) {
      expect(def(g.metricId).name, g.term).toBe(g.term)
      const entry = glossary.find((e) => e.id === g.metricId)
      expect(entry?.term, g.term).toBe(g.term)
      expect(entry?.where, g.term).toBe('Plan')
    }
  })

  it('has a tour step on the quarter table, and keeps view-plan’s tour at 4 to 6 steps', () => {
    expect(HIRING_TOUR_STEP.target).toBe(figureTarget(PLAN_FIGURES.hiringQuarters))
    expect([HIRING_TOUR_STEP.view, HIRING_TOUR_STEP.tab]).toEqual(['plan', 'hiring'])
    const tour = tourById('view-plan')
    if (!tour) throw new Error('no view-plan tour')
    const at = tour.steps.findIndex((s) => s.target === HIRING_TOUR_STEP.target && s.tab === 'hiring')
    // Frozen: 5 steps, the hiring step not in yet; built: in at its place, 6 steps.
    if (at < 0) expect(tour.steps.length + 1).toBeLessThanOrEqual(6)
    else expect(at).toBe(HIRING_TOUR_AT)
    expect(HIRING_TOUR_AT).toBeLessThanOrEqual(tour.steps.length)
    expect(tour.steps[HIRING_TOUR_AT - 1]?.tab).toBe('openings')
  })
})

describe('the copy (14.3)', () => {
  it('keeps every rule in every string the freeze adds', () => {
    const all = frozenWords()
    expect(all.length).toBeGreaterThan(100)
    for (const [where, text] of all) {
      expect(copyProblems(text), `${where}: ${text}`).toEqual([])
      expect(text, where).not.toMatch(AMOUNT_TEXT)
      expect(text, where).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(text.toLowerCase(), where).not.toContain('headcount to hire')
      for (const w of BANNED_MODE_WORDS) expect(text.toLowerCase().includes(w), `${where}: ${w}`).toBe(false)
    }
  })

  it('writes every label and title in sentence case, with plain counts', () => {
    const labels = [
      ...HIRING_KPIS.map((k) => k.label),
      ...HIRING_ROWS.map((r) => r.label),
      hiringOpenLabel('FY27'),
      HIRING_TOUR_STEP.title,
      HIRING_SECTION_TITLE,
      ...HIRING_METRIC_IDS.map((id) => def(id).name),
    ]
    for (const l of labels) expect(sentenceCaseProblem(l), l).toBeNull()
    // "Open to hire", the plan's word: never "headcount to hire".
    expect(def(ID.hiringOpen).definition).not.toMatch(/headcount/i)
  })
})

describe('the integration (every stub built)', () => {
  /** The module's own source files, every one the freeze or a builder added for Plan > Hiring. */
  const FILES = [
    '../plan/engine/hiring.ts',
    '../plan/engine/hiring.fixtures.ts',
    './plan/engine/hiringTab.ts',
    './plan/engine/hiringData.ts',
    './plan/engine/hiringModel.ts',
    './plan/engine/hiringDrills.ts',
    './plan/ui/Hiring.tsx',
    './plan/ui/HiringQuarterGrid.tsx',
    './plan/ui/HiringVelocityChart.tsx',
    './plan/ui/model.ts',
    '../help/hiring.ts',
    './tabModels.ts',
  ]
  const STUB = /\bnotBuilt\s*\(|from '[^']*notBuilt'/

  it('leaves no notBuilt stub in any of the module’s files', () => {
    for (const f of FILES) {
      const code = readFileSync(new URL(f, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(code.length, f).toBeGreaterThan(0)
      expect(code, f).not.toMatch(STUB)
    }
    // The negative control: the pattern catches a stub and its import.
    expect("throw notBuilt('hiring.hiringOf')").toMatch(STUB)
    expect("import { notBuilt } from '../notBuilt'").toMatch(STUB)
  })

  it('reads Plan > Hiring from its own model wherever a view’s tabs are walked', () => {
    expect(Object.keys(TAB_MODELS)).toEqual(['plan.hiring'])
    expect(tabModelOf('plan', 'hiring')).toBe(TAB_MODELS['plan.hiring'])
    expect(tabModelOf('plan', 'openings')).toBeNull()
    for (const f of ['./data/engine/snapshots.ts', '../testkit/crawl.ts']) {
      const code = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(code, f).toMatch(/from '@\/views\/tabModels'/)
    }
  })
})
