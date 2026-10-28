/**
 * Plan > Recruiting summary's registration check (docs/PLAN.md 9.8, change C38), mirroring
 * ./hiring.contracts.test.ts for the new tab: every piece of the registry, the policy, the catalog and
 * help is in place and keeps its rule.
 *
 *  - The tab sits after Hiring in the registry and the policy's tab list (overview, positions,
 *    openings, hiring, recruiting, transfers), shown in every mode (8.3's letters SSSSS, Manager mode's
 *    sentence "Your team, in heads.", Plan > Hiring's), and every surface it adds (the tab, its four
 *    figures and its seven tiles) has an explicit decision in every mode and shows on its tab.
 *  - `PLAN_FIGURES`' recruiting ids are `RECRUITING_FIGURE_IDS`, in page order; `RECRUITING_KPIS`' ids
 *    are `RECRUITING_KPI_IDS`, in strip order, seven tiles (9.3's 5 to 7), each a registered metric.
 *  - Every metric the tab reads is in the dictionary with a definition, formula, population, window,
 *    unit and owner, under Plan, shown in every mode, with no guard class and no pay, offer or leave
 *    field in its lineage; the tab's own three ids follow Plan > Hiring's.
 *  - Words: "Future starts" (signed offers) and "Projected starts" (the model) are apart in the tiles'
 *    labels and notes; the gap reads "Short by" or "Over by"; "Projected attrition" is Plan > Hiring's
 *    expected exits; every string keeps the copy rules and names no amount.
 *  - Help carries the Recruiting summary section between Hiring and Transfers, the names scan knows
 *    the tab, and the glossary terms are catalog names.
 *  - The tab reads its own model, cached per context, through `TAB_MODELS` (the crawl and the
 *    Shareable file read the same map); no `notBuilt` stub is left in its files, the UI names a
 *    metric, its lineage and its definitions on every figure, and its source names no pay, offer or
 *    leave field.
 *  - The docs say what was built (the finish audit, 28 Oct 2026): PLAN 9.8 says projected attrition,
 *    names its readings and its three metrics; R134, R140, R143, R147 and 15.3 item 10 read as built;
 *    CONTRACTS-HIRING section 6 names every export C38 added, by a file that exports it, every test
 *    file it lists exists, and section 8 holds the two lead items (AF-3, AF-6, AF-7, AD-1 to AD-8).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BANNED_MODE_WORDS } from '@/access/copy'
import {
  HIRING_SURFACES,
  NAMED_SURFACES,
  PLAN_GRID,
  RECRUITING_AT,
  RECRUITING_FIGURE_IDS,
  RECRUITING_KPI_IDS,
  RECRUITING_SURFACES,
  VIEW_TABS,
} from '@/access/ids'
import { MODES } from '@/access/modes'
import { decide, notNamedOf, ROLE_POLICY, routeShown } from '@/access/policy'
import { HIRING_HOW } from '@/access/policy/manager'
import { articleById } from '@/help/articles'
import { copyProblems, sentenceCaseProblem } from '@/help/check'
import { buildGlossary } from '@/help/glossary'
import { HELP_NAMES } from '@/help/names'
import {
  PROJECTED_ATTRITION,
  RECRUITING_GLOSSARY,
  RECRUITING_KEYWORDS,
  RECRUITING_SECTION,
  RECRUITING_SECTION_TITLE,
} from '@/help/recruiting'
import type { Block } from '@/help/types'
import { CATALOG, METRICS } from '@/metrics/catalog'
import { METRIC_GUARD } from '@/metrics/guardClass'
import type { MetricDef } from '@/metrics/types'
import { view as planView } from '@/views/plan'
import { PLAN_FIGURES } from '@/views/plan/engine/figures'
import { HIRING_KPIS } from '@/views/plan/engine/hiringTab'
import {
  FUTURE_STARTS_NOTE,
  gapText,
  KNOWN_EXITS_ONLY_NOTE,
  NO_FORECAST_NOTE,
  PROJECTED_STARTS_NOTE,
  planRecruitingModel,
  RECRUITING_KPIS,
  WHERE_TOP,
} from '@/views/plan/engine/recruitingTab'
import { HIRING_METRIC_IDS, ID, RECRUITING_METRIC_IDS } from '@/views/plan/metrics'
import { SUMMARY_REPLACES } from '@/views/plan/ui/Recruiting'
import { TAB_MODELS, tabModelOf } from '@/views/tabModels'

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

/** Every metric the tab reads: its tiles' and its own three. */
const TAB_METRICS = [...new Set([...RECRUITING_KPIS.map((k) => k.metricId), ...RECRUITING_METRIC_IDS])]

/** Every string the tab's registry, catalog entries and help add that a person reads. */
function tabWords(): [string, string][] {
  const out: [string, string][] = []
  for (const id of RECRUITING_METRIC_IDS) {
    const d = def(id)
    for (const w of [d.name, d.definition, d.formula ?? '', d.population ?? '', d.window ?? ''])
      out.push([id, w])
  }
  for (const k of RECRUITING_KPIS) out.push([`tile ${k.id}`, k.label])
  for (const t of VIEW_TABS.plan) if (t.key === RECRUITING_AT.tab) out.push(['tab label', t.label])
  out.push(
    ['future note', FUTURE_STARTS_NOTE],
    ['projected note', PROJECTED_STARTS_NOTE],
    ['no forecast', NO_FORECAST_NOTE],
    ['known exits only', KNOWN_EXITS_ONLY_NOTE],
    ['short by', gapText(-2.4) ?? ''],
    ['over by', gapText(1) ?? ''],
    ['manager how', HIRING_HOW],
    ['expected exits', def(ID.hiringExpectedExits).definition],
  )
  for (const b of RECRUITING_SECTION) for (const s of blockStrings(b)) out.push(['section', s])
  for (const k of RECRUITING_KEYWORDS) out.push(['keyword', k])
  return out
}

describe('the tab (9.8 placement)', () => {
  it('sits after Hiring in the registry and in the policy tab list', () => {
    const keys = ['overview', 'positions', 'openings', 'hiring', 'recruiting', 'transfers']
    expect(VIEW_TABS.plan.map((t) => t.key)).toEqual(keys)
    expect(planView.tabs.map((t) => ({ key: t.key, label: t.label }))).toEqual(VIEW_TABS.plan)
    expect(VIEW_TABS.plan.find((t) => t.key === 'recruiting')?.label).toBe('Recruiting summary')
    expect(RECRUITING_AT).toEqual({ view: 'plan', tab: 'recruiting' })
    for (const m of MODES)
      expect(
        ROLE_POLICY[m].tabs.plan?.map((t) => t.key),
        m,
      ).toEqual(keys)
  })

  it('shows in every mode with the plan letters and Manager mode’s sentence, Plan > Hiring’s', () => {
    expect(PLAN_GRID['tab:plan.recruiting']).toBe('SSSSS')
    expect(PLAN_GRID['tab:plan.recruiting']).toBe(PLAN_GRID['tab:plan.hiring'])
    for (const m of MODES) {
      expect(decide(m, 'tab:plan.recruiting').access, m).toBe('shown')
      expect(routeShown(m, 'plan', 'recruiting'), m).toBe(true)
      const tab = ROLE_POLICY[m].tabs.plan?.find((t) => t.key === 'recruiting')
      expect(tab?.decision.access, m).toBe('shown')
      expect(tab?.label, m).toBe('Recruiting summary')
    }
    expect(decide('manager', 'tab:plan.recruiting')).toEqual({ access: 'shown', how: 'Your team, in heads.' })
    expect(HIRING_HOW).toBe('Your team, in heads.')
  })
})

describe('the policy decides every recruiting surface (8.3)', () => {
  it('names each one, explicitly, in every mode', () => {
    expect(RECRUITING_SURFACES).toHaveLength(1 + RECRUITING_FIGURE_IDS.length + RECRUITING_KPI_IDS.length)
    for (const s of RECRUITING_SURFACES) expect(NAMED_SURFACES, s).toContain(s)
    expect(RECRUITING_SURFACES.filter((s) => HIRING_SURFACES.includes(s))).toEqual([])
    for (const m of MODES)
      for (const s of RECRUITING_SURFACES) {
        const d = decide(m, s, s.startsWith('tab:') ? undefined : RECRUITING_AT)
        expect(d.how, `${m} ${s}`).not.toBe(notNamedOf(ROLE_POLICY[m]).how)
        expect(d.access, `${m} ${s}`).toBe('shown')
      }
  })

  it('shows the figures and tiles on their tab in every mode', () => {
    expect(Object.values(PLAN_FIGURES).filter((id) => id.startsWith('plan-recruiting-'))).toEqual([
      ...RECRUITING_FIGURE_IDS,
    ])
    expect([
      PLAN_FIGURES.recruitingKpis,
      PLAN_FIGURES.recruitingMonths,
      PLAN_FIGURES.recruitingQuarters,
      PLAN_FIGURES.recruitingWhere,
    ]).toEqual([...RECRUITING_FIGURE_IDS])
    for (const m of MODES) {
      for (const id of RECRUITING_FIGURE_IDS)
        expect(decide(m, `figure:${id}`, RECRUITING_AT).access, `${m} ${id}`).toBe('shown')
      for (const k of RECRUITING_KPIS)
        expect(
          decide(m, `kpi:${k.id}`, RECRUITING_AT, { metric: k.metricId, metricViews }).access,
          `${m} ${k.id}`,
        ).toBe('shown')
    }
  })
})

describe('the seven numbers (9.8 item 1)', () => {
  it('are RECRUITING_KPI_IDS in strip order, seven tiles, each on its metric', () => {
    expect(RECRUITING_KPIS.map((k) => k.id)).toEqual([...RECRUITING_KPI_IDS])
    expect(RECRUITING_KPIS).toHaveLength(7)
    expect(RECRUITING_KPIS.map((k) => k.metricId)).toEqual([
      ID.hiringApprovedByQuarter,
      ID.hiringCurrentHeads,
      ID.hiringOpen,
      ID.hiringAcceptedStarts,
      ID.recruitingProjectedStarts,
      ID.hiringExpectedExits,
      ID.hiringPace,
    ])
    // Plan > Hiring's numbers read Plan > Hiring's metrics; its tile ids are its own.
    const hiringTiles = new Set<string>(HIRING_KPIS.map((k) => k.id))
    for (const k of RECRUITING_KPIS) expect(hiringTiles.has(k.id), k.id).toBe(false)
  })

  it('keep future starts (signed offers) and projected starts (the model) apart, and name projected attrition', () => {
    const label = (id: string) => RECRUITING_KPIS.find((k) => k.id === id)?.label
    expect(label('recruiting-future')).toBe('Future starts')
    expect(label('recruiting-projected')).toBe('Projected starts')
    expect(label('recruiting-attrition')).toBe(PROJECTED_ATTRITION.term)
    expect(RECRUITING_KPIS.find((k) => k.id === 'recruiting-attrition')?.metricId).toBe(
      PROJECTED_ATTRITION.metricId,
    )
    expect(FUTURE_STARTS_NOTE).toBe('Signed offers, by start date')
    expect(FUTURE_STARTS_NOTE).not.toMatch(/model|projected|forecast/i)
    expect(PROJECTED_STARTS_NOTE).toMatch(/^Model: /)
    expect(PROJECTED_STARTS_NOTE).not.toMatch(/signed/i)
    expect(def(ID.recruitingProjectedStarts).name).toBe('Projected starts')
    expect(def(ID.hiringAcceptedStarts).name).toBe('Future starts')
  })

  it('word the gap "Short by" or "Over by", one decimal, and "On approved heads" at 0.0 (review RU-15)', () => {
    expect(gapText(-2.4)).toBe('Short by 2.4')
    expect(gapText(-20.5)).toBe('Short by 20.5')
    expect(gapText(1)).toBe('Over by 1.0')
    expect(gapText(0)).toBe('On approved heads')
    expect(gapText(0.04)).toBe('On approved heads')
    expect(gapText(-0.04)).toBe('On approved heads')
    expect(WHERE_TOP).toBe(5)
  })
})

describe('the metrics the tab reads (section 12 rows)', () => {
  it('are each in the dictionary with a definition, formula, population, window, unit and owner, under Plan', () => {
    expect(TAB_METRICS.length).toBe(9)
    for (const id of TAB_METRICS) {
      const d = def(id)
      for (const f of [d.name, d.definition, d.formula, d.population, d.window, d.unit, d.owner])
        expect(f?.trim(), id).toBeTruthy()
      expect(d.views[0], id).toBe('plan')
      expect(d.owner, id).toBe('HR business partners')
      expect(['int', 'num1', 'pct'], id).toContain(d.unit)
    }
  })

  it('register the tab’s three ids after Plan > Hiring’s, in the plan’s order', () => {
    expect(Object.values(ID).filter((id) => id.startsWith('plan.recruiting.'))).toEqual([
      ...RECRUITING_METRIC_IDS,
    ])
    const order = METRICS.map((d) => d.id)
    const lastHiring = Math.max(...HIRING_METRIC_IDS.map((id) => order.indexOf(id)))
    expect(RECRUITING_METRIC_IDS.map((id) => order.indexOf(id))).toEqual([
      lastHiring + 1,
      lastHiring + 2,
      lastHiring + 3,
    ])
    for (const id of RECRUITING_METRIC_IDS) expect(def(id).unit, id).toBe('num1')
  })

  it('show no amount: no guard class, no pay, offer, band or leave field, no amount in the words', () => {
    for (const id of TAB_METRICS) {
      const d = def(id)
      expect(METRIC_GUARD[id], id).toBeUndefined()
      for (const f of d.uses) {
        expect(f.startsWith('comp.'), `${id} ${f}`).toBe(false)
        expect(f, `${id} ${f}`).not.toMatch(
          /offerBase|offerCurrency|signOnBonus|relocation|agencyFee|onLeave|leavePaid|bandEstimate|costAnnual/,
        )
      }
      for (const w of [d.name, d.definition, d.formula ?? '', d.population ?? '', d.window ?? '']) {
        expect(w, id).not.toMatch(AMOUNT_TEXT)
        expect(w, id).not.toMatch(/\bleav(e|es|ing)\b/i)
      }
    }
  })

  it('show in every mode, wherever their views are shown', () => {
    for (const m of MODES)
      for (const id of TAB_METRICS)
        expect(decide(m, `metric:${id}`, undefined, { metricViews }).access, `${m} ${id}`).toBe('shown')
  })
})

describe('help (9.8 Help, 14.2)', () => {
  it('puts the Recruiting summary section in view-plan between Hiring and Transfers', () => {
    const a = articleById('view-plan')
    if (!a) throw new Error('no view-plan article')
    const headings = a.body.flatMap((b) => ('h' in b ? [b.h] : []))
    expect(headings.indexOf(RECRUITING_SECTION_TITLE)).toBe(headings.indexOf('Hiring') + 1)
    expect(headings.indexOf('Transfers')).toBe(headings.indexOf(RECRUITING_SECTION_TITLE) + 1)
    const start = a.body.indexOf(RECRUITING_SECTION[0])
    expect(a.body.slice(start, start + RECRUITING_SECTION.length)).toEqual([...RECRUITING_SECTION])
    for (const k of RECRUITING_KEYWORDS) expect(a.keywords, k).toContain(k)
  })

  it('names Plan > Recruiting summary for the names scan', () => {
    expect(HELP_NAMES).toContainEqual({ phrase: 'Plan > Recruiting summary', surface: 'tab:plan.recruiting' })
  })

  it('gains the glossary terms of the tab’s metrics, each a catalog entry under Plan', () => {
    const glossary = buildGlossary(METRICS)
    for (const g of RECRUITING_GLOSSARY) {
      expect(def(g.metricId).name, g.term).toBe(g.term)
      const entry = glossary.find((e) => e.id === g.metricId)
      expect(entry?.term, g.term).toBe(g.term)
      expect(entry?.where, g.term).toBe('Plan')
    }
    expect(glossary.find((e) => e.id === PROJECTED_ATTRITION.metricId)?.definition).toMatch(
      /projected attrition/,
    )
  })
})

describe('the copy (14.3)', () => {
  it('keeps every rule in every string the tab adds', () => {
    const all = tabWords()
    expect(all.length).toBeGreaterThan(40)
    for (const [where, text] of all) {
      expect(text.trim(), where).toBeTruthy()
      expect(copyProblems(text), `${where}: ${text}`).toEqual([])
      expect(text, where).not.toMatch(AMOUNT_TEXT)
      expect(text, where).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(text.toLowerCase(), where).not.toContain('headcount to hire')
      for (const w of BANNED_MODE_WORDS) expect(text.toLowerCase().includes(w), `${where}: ${w}`).toBe(false)
    }
  })

  it('writes every label and title in sentence case', () => {
    const labels = [
      ...RECRUITING_KPIS.map((k) => k.label),
      ...RECRUITING_METRIC_IDS.map((id) => def(id).name),
      RECRUITING_SECTION_TITLE,
      'Recruiting summary',
    ]
    for (const l of labels) expect(sentenceCaseProblem(l), l).toBeNull()
  })
})

describe('the tab’s files and its model', () => {
  const FILES = [
    './plan/engine/recruitingTab.ts',
    './plan/engine/recruitingModel.ts',
    './plan/ui/Recruiting.tsx',
    './plan/ui/RecruitingMonthsChart.tsx',
    '../help/recruiting.ts',
  ]
  const code = (f: string) =>
    readFileSync(new URL(f, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
  const STUB = /\bnotBuilt\s*\(|from '[^']*notBuilt'/

  it('leaves no notBuilt stub, and names no pay, offer or leave field', () => {
    for (const f of FILES) {
      const c = code(f)
      expect(c.length, f).toBeGreaterThan(0)
      expect(c, f).not.toMatch(STUB)
      expect(c, f).not.toMatch(PAY_FIELDS)
    }
    // The negative controls: the patterns catch a stub and a pay field.
    expect("throw notBuilt('recruiting.computeRecruiting')").toMatch(STUB)
    expect('row.offerBase').toMatch(PAY_FIELDS)
  })

  it('names a metric, its lineage and its definitions on every figure of the UI', () => {
    const ui = code('./plan/ui/Recruiting.tsx')
    const figures = ui.match(/<Figure\b/g)?.length ?? 0
    expect(figures).toBe(RECRUITING_FIGURE_IDS.length - 1)
    for (const prop of [/\bmetric=/g, /\buses=/g, /definitions=\{definitionsOf\(/g])
      expect(ui.match(prop)?.length ?? 0, String(prop)).toBe(figures)
    // Each figure id is drawn, as written out or by its PLAN_FIGURES key.
    const keyOf = (id: string) => Object.entries(PLAN_FIGURES).find(([, v]) => v === id)?.[0]
    for (const id of RECRUITING_FIGURE_IDS)
      expect(ui.includes(`"${id}"`) || ui.includes(`PLAN_FIGURES.${keyOf(id)}}`), id).toBe(true)
    // The deck's one slide: the chart's figure stands in for the strip, the table and the lists (9.8 item 5).
    expect([...SUMMARY_REPLACES]).toEqual(
      RECRUITING_FIGURE_IDS.filter((id) => id !== PLAN_FIGURES.recruitingMonths),
    )
    expect(ui).toMatch(/replaces: SUMMARY_REPLACES/)
  })

  it('reads the tab from its own model wherever a view’s tabs are walked', () => {
    expect(Object.keys(TAB_MODELS)).toEqual(['plan.hiring', 'plan.recruiting'])
    expect(tabModelOf('plan', 'recruiting')).toBe(TAB_MODELS['plan.recruiting'])
    expect(TAB_MODELS['plan.recruiting']).toBe(planRecruitingModel)
    expect(tabModelOf('plan', 'hiring')).not.toBe(tabModelOf('plan', 'recruiting'))
    expect(tabModelOf('plan', 'transfers')).toBeNull()
  })
})

/* ───────────── the docs (the finish audit, 28 Oct 2026) ───────────── */

/** A doc of the repo as text, with LF line ends (docs/PLAN.md is checked out with CRLF). */
const doc = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
/** Whitespace folded, so a phrase may wrap across lines. */
const flat = (t: string) => t.replace(/\s+/g, ' ')
/** A Markdown section: its heading to the next heading of the same level or above. */
function mdSection(text: string, heading: string, from = 0): string {
  const level = heading.match(/^#+/)?.[0].length ?? 2
  const start = text.indexOf(`\n${heading}\n`, from)
  expect(start, heading).toBeGreaterThanOrEqual(0)
  const rest = text.slice(start + heading.length + 2)
  const next = rest.search(new RegExp(`\\n#{1,${level}} `))
  return next < 0 ? rest : rest.slice(0, next)
}
/** A row of a Markdown table by its first cell. */
const tableRow = (text: string, first: string) =>
  text.split('\n').find((l) => l.startsWith(`| ${first} |`)) ?? ''
/** A source file's export names. */
const exportsOf = (path: string): Set<string> =>
  new Set(
    [
      ...readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').matchAll(
        /^export (?:async )?(?:const|function|interface|type|class|let) (\w+)/gm,
      ),
    ].map((m) => m[1]),
  )

describe('the docs say what was built (finish audit AF-3, AF-6, AF-7, AD-1 to AD-8)', () => {
  const plan = doc('docs/PLAN.md')
  const contracts = doc('docs/CONTRACTS-HIRING.md')
  const readme = doc('README.md')
  const s98 = mdSection(plan, '### 9.8 Recruiting summary (Plan > Recruiting summary, change C38)')

  it('PLAN 9.8 says projected attrition, points at its readings and names its three metrics (AF-6, AF-7, AD-1, AD-2)', () => {
    const text = flat(s98)
    expect(text).not.toMatch(/projected exits/i)
    expect(text).toContain('readings R133 to R148, which override 9.8 where they differ')
    expect(text).toContain(
      'current heads + future starts + moves in + projected starts − projected attrition, with R134',
    )
    const at = s98.indexOf('\n#### Metrics (section 12 rows)\n')
    expect(at).toBeGreaterThan(0)
    const metrics = flat(s98.slice(at))
    for (const id of RECRUITING_METRIC_IDS) expect(metrics, id).toContain(id)
    for (const k of RECRUITING_KPIS)
      if (k.metricId.startsWith('plan.hiring.')) expect(metrics, k.metricId).toContain(k.metricId)
    for (const id of RECRUITING_METRIC_IDS) expect(def(id).unit, id).toBe('num1')
    expect(metrics).toContain('units num1, registered after plan.hiring.recentHires')
    expect(metrics).toContain('112 data metrics')
  })

  it('PLAN’s readings and 15.3 item 10 read as built (AF-1, AF-2, AF-3, AD-5, AD-8, AG-1)', () => {
    const r = (id: string) => flat(tableRow(plan, id))
    expect(r('R134')).toContain('A pre-hire’s seat still counts in open to hire'.replace('’', "'"))
    expect(r('R134')).toContain('from an as-of date on or after the last close')
    expect(r('R143')).not.toContain('in the tooltip and the table only')
    expect(r('R143')).toContain('drawn in the month they ride on')
    expect(r('R140')).not.toContain('The fiscal year end cards are titled by the day')
    expect(r('R140')).toContain(
      'The approved heads, projected starts and projected attrition cards are titled',
    )
    expect(r('R147')).toContain('An offer start dated in a closed month is not moved')
    const risks = mdSection(plan, '### 15.3 Accepted risks (repeated in README where they concern users)')
    const item10 = flat(risks.split(/\n(?=\d+\. )/).find((x) => x.startsWith('10. ')) ?? '')
    expect(item10).toContain(
      'from projected starts and their modeled backfills (Plan > Recruiting summary, C38',
    )
    expect(item10).toContain('attrition from modeled exits (Plan > Hiring, C36)')
    const risk9 = flat(readme.split(/\n(?=\d+\. )/).find((x) => x.startsWith('9. **Forecast drivers')) ?? '')
    expect(risk9).toContain('from projected starts and their modeled backfills on Plan > Recruiting summary')
    expect(risk9).toContain('attrition from modeled exits on Plan > Hiring')
  })

  it('no doc says every number but projected starts is Plan > Hiring’s (AD-3)', () => {
    const six = flat(mdSection(contracts, '## 6. Recruiting summary (change C38)'))
    for (const [where, text] of [
      ['README', flat(readme)],
      ['CONTRACTS 6', six],
    ] as const) {
      expect(text, where).not.toMatch(/Every number but projected starts/)
      expect(text, where).not.toContain('the one number Plan > Hiring does not show is projected starts')
      expect(text, where).not.toContain(
        "Every count is Plan > Hiring's and opens Plan > Hiring's own records and cards",
      )
      expect(text, where).toContain('projected heads and the gap to approved heads are this tab')
    }
    const rc5 = flat(tableRow(contracts, 'RC5'))
    expect(rc5).not.toContain('the year end cards are titled by their day')
  })

  it('CONTRACTS 6.1 names every export C38 added, each by a file that exports it, at a path that exists (AD-6)', () => {
    const t = mdSection(contracts, '### 6.1 Exports and owners')
    const rows = t.split('\n').filter((l) => l.startsWith('| `'))
    expect(rows.length).toBeGreaterThan(12)
    const named = new Set<string>()
    for (const row of rows) {
      const [filesCell, exportsCell] = row.slice(2).split(' | ')
      let dir = ''
      const files: string[] = []
      for (const [, f] of filesCell.matchAll(/`([^`]+)`/g)) {
        // A bare name is in the folder of the full path before it.
        const path = f.startsWith('src/') ? f : `${dir}${f}`
        if (f.startsWith('src/')) dir = f.slice(0, f.lastIndexOf('/') + 1)
        expect(() => readFileSync(new URL(`../../${path}`, import.meta.url)), path).not.toThrow()
        files.push(path)
      }
      const exported = new Set(files.flatMap((f) => [...exportsOf(f)]))
      for (const [, token] of exportsCell.matchAll(/`([^`]+)`/g)) {
        named.add(token)
        // Constants and types are export names: each must be one of the row's files' exports.
        if (/^[A-Z][A-Za-z0-9_]*$/.test(token))
          expect(exported.has(token), `${token} in ${files[0]}`).toBe(true)
      }
    }
    // Every export of the files C38 added, and every export it added to an existing file.
    const NEW_FILES = [
      'src/views/plan/engine/recruitingTab.ts',
      'src/views/plan/engine/recruitingModel.ts',
      'src/views/plan/ui/Recruiting.tsx',
      'src/views/plan/ui/RecruitingMonthsChart.tsx',
      'src/views/plan/ui/monthTicks.ts',
      'src/app/tabExport.ts',
      'src/help/recruiting.ts',
      'src/testkit/recruiting.ts',
    ]
    const ADDED = [
      ...['Built', 'Opens', 'card', 'plain', 'SOURCE', 'NOTHING', 'noSeatNote', 'knownInputs', 'monthRows'],
      ...['exitSeatsDrill', 'forecastMonthsTo', 'quarterEndLabel', 'quarterSpan', 'yearOverCard', 'openCard'],
      ...['exitsCard', 'futureStartsCard', 'paceCard', 'cellOf', 'peopleCount', 'futureStartsOpens'],
      ...[
        'movesOpens',
        'seatsOutOf',
        'headsSplitNote',
        'hiringBuiltOf',
        'dashBackground',
        'dottedBackground',
      ],
      ...['lineBackground', 'RECRUITING_LINEAGE_NOTES', 'HiringPreHire', 'preHireId', 'ProjectedStartsMonth'],
      ...[
        'projectedStartsOf',
        'deckEntries',
        'fitRows',
        'DeckNumber',
        'DeckSummary',
        'RECRUITING_METRIC_IDS',
      ],
      ...['TabDeckSummary', 'DECK_SUMMARIES', 'usePlanRecruiting', 'tabExportDone'],
    ]
    const missing = [...NEW_FILES.flatMap((f) => [...exportsOf(f)]), ...ADDED].filter((x) => !named.has(x))
    expect(missing).toEqual([])
    // Control: a name no file exports is caught.
    expect(exportsOf('src/views/plan/metrics.ts').has('RECRUITING_WINDOW')).toBe(false)
  })

  it('CONTRACTS 6.4 lists test files that exist, the Forecast view’s and the policy’s included (AD-7)', () => {
    const t = mdSection(contracts, '### 6.4 Tests')
    const all = (readdirSync(new URL('../', import.meta.url), { recursive: true }) as string[]).map((f) =>
      f.replace(/\\/g, '/'),
    )
    const listed = [...t.matchAll(/`([^`]+\.test\.ts)`/g)].map((m) => m[1])
    expect(listed.length).toBeGreaterThan(20)
    for (const f of listed)
      expect(
        all.some((x) => x === f || x.endsWith(`/${f}`)),
        f,
      ).toBe(true)
    for (const f of [
      'views/forecast/engine/overdueStarts.test.ts',
      'access/policy/policy.test.ts',
      'metrics/catalog.test.ts',
      'metrics/ids.test.ts',
      'plan/engine/metrics.test.ts',
      'access/leaks.hiring.slow.test.ts',
    ])
      expect(listed, f).toContain(f)
  })

  it('CONTRACTS section 8 holds the two lead items the finish audit left (AF-2, AF-3)', () => {
    const open = flat(mdSection(contracts, '## 8. Open items for the lead'))
    expect(open).toContain('**A pre-hire’s seat and open to hire**'.replace('’', "'"))
    expect(open).toContain('A = H + O + S + M holds with that seat in O')
    expect(open).toContain('**The run’s heads before the last close**'.replace('’', "'"))
  })
})
