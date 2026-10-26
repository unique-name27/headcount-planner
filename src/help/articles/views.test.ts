/**
 * help-views' own checks on the Start here and Each view articles (docs/PLAN.md 14.2, 14.3;
 * docs/CONTRACTS-M4.md section 3): in every mode that shows an article, and both with a scope held
 * and without one, every string keeps the copy rules (`copyProblems`), titles are sentence case, no
 * shown block names a page, tab, control or amount kind the mode hides (`namesHidden`), Manager mode
 * reads no amount (the leak crawl's own scanner, `amountsIn`), every link points somewhere real, the
 * metrics an article lists show wherever it shows, and each article covers what PLAN 14.2 says it
 * must: `modes` ends with `NOT_SECURITY_LONG`, `view-home` has one section per home under its mode's
 * condition, and Start here names the pickers, "—", "Other (k)", calculation cards, the header lines,
 * the Suppressed flag, the long CSV and workspace files where each mode shows them.
 */
import { describe, expect, it } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { NOT_SECURITY_LONG } from '@/access/copy'
import { HELP_ARTICLE_IDS, HELP_TOUR_IDS, VIEW_TABS } from '@/access/ids'
import { MODES, type Mode } from '@/access/modes'
import { routeShown } from '@/access/policy'
import { PAGE_KEYS, VIEW_KEYS, type ViewKey } from '@/data/schema'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { LONG_CSV_COLUMNS, LONG_HEADS_COLUMNS } from '@/lib/export/longCsv'
import { hrAdminExportLine } from '@/lib/export/modeMeta'
import { defaultMetrics } from '@/metrics/api'
import { METRICS } from '@/metrics/catalog'
import { CHAIN_RULES } from '@/plan/engine/chain'
import { amountsIn } from '@/testkit/leaks'
import { parseDataTab } from '@/views/data/engine/links'
import { componentTotalLines } from '@/views/finance/engine/longCsv'
import { articleInMode, articleShown, type HelpAccess } from '../access'
import { copyProblems, sentenceCaseProblem } from '../check'
import { blockTexts, linksIn, plainText } from '../markup'
import { namesHidden } from '../names'
import type { Block, HelpArticle } from '../types'
import { START_ARTICLES } from './start'
import { VIEW_ARTICLES } from './views'

const MINE: readonly HelpArticle[] = [...START_ARTICLES, ...VIEW_ARTICLES]
const BARE = Object.fromEntries(MODES.map((m) => [m, accessFor(m, null, defaultMetrics())])) as Record<
  Mode,
  AccessContext
>

/** Each mode with no scope held (the bare policy) and with one held (a team, unit or org picked). */
const EVERY: { name: string; mode: Mode; access: HelpAccess }[] = MODES.flatMap((m) => [
  { name: `${m} (no scope)`, mode: m, access: BARE[m] },
  { name: `${m} (scope held)`, mode: m, access: { mode: m, can: BARE[m].can } },
])

const METRIC_IDS = new Set(METRICS.map((m) => m.id))

/** The text of every block an article shows in a mode, title and summary first. */
function shownStrings(access: HelpAccess, a: HelpArticle): string[] {
  const s = articleInMode(access, a)
  return [s.title, s.summary, ...s.body.flatMap((b) => blockTexts(b))]
}

/** Every string an article holds, in every mode. */
const allStrings = (a: HelpArticle): string[] => [
  a.title,
  a.summary,
  ...(a.without ?? []).map((w) => w.summary),
  ...a.body.flatMap((b) => blockTexts(b)),
  ...(a.keywords ?? []),
  ...(a.keywordsWhere ?? []).flatMap((k) => k.words),
]

const headings = (body: readonly Block[]): string[] => body.flatMap((b) => ('h' in b ? [b.h] : []))
const textOf = (access: HelpAccess, id: string): string =>
  shownStrings(access, MINE.find((a) => a.id === id) as HelpArticle)
    .map(plainText)
    .join('\n')

/** Null when a route target is a real page and tab; otherwise why not. */
function routeProblem(target: string): string | null {
  const [view, ...rest] = target.split('.')
  const tab = rest.join('.')
  if (view === 'data') return parseDataTab(tab).tab || !tab ? null : `no Data room tab ${tab}`
  if ((PAGE_KEYS as readonly string[]).includes(view)) return tab ? `page ${view} has no tabs` : null
  if (!(VIEW_KEYS as readonly string[]).includes(view)) return `no page ${view}`
  if (!tab) return null
  const base = tab.split(/[:/]/)[0]
  return VIEW_TABS[view as ViewKey].some((t) => t.key === base) ? null : `no tab ${tab} on ${view}`
}

describe('Start here and Each view: registration', () => {
  it('writes every id of the two groups, in order, with a summary and a body', () => {
    expect(START_ARTICLES.map((a) => a.id)).toEqual(HELP_ARTICLE_IDS.slice(0, 6))
    expect(VIEW_ARTICLES.map((a) => a.id)).toEqual(HELP_ARTICLE_IDS.slice(6, 17))
    for (const a of MINE) {
      expect(a.summary.length, a.id).toBeGreaterThan(20)
      expect(a.body.length, a.id).toBeGreaterThan(2)
      expect(sentenceCaseProblem(a.title), a.id).toBeNull()
      for (const b of a.body)
        if ('h' in b) expect(sentenceCaseProblem(b.h.replace(/^"/, 'X')), `${a.id} ${b.h}`).toBeNull()
    }
  })

  it('reaches each view article from its page and its tour', () => {
    for (const a of VIEW_ARTICLES) {
      const v = a.id.slice('view-'.length)
      expect(a.route?.view, a.id).toBe(v)
      if (a.tour) expect(HELP_TOUR_IDS as readonly string[], a.id).toContain(a.tour)
    }
  })
})

describe('Start here and Each view: copy rules', () => {
  it('keeps every string free of em dashes, "!", nagging verbs and banned words', () => {
    const found = MINE.flatMap((a) =>
      allStrings(a).flatMap((t) => copyProblems(t).map((p) => `${a.id}: ${p}: ${t}`)),
    )
    expect(found).toEqual([])
  })

  it('is not vacuous: the copy check finds each rule broken in made-up text', () => {
    expect(copyProblems('Open it — now')).toContain('em dash between words')
    expect(copyProblems('Done!')).toContain('exclamation mark')
    expect(copyProblems('Chase the manager')).toEqual(['nagging verb "Chase"'])
    expect(copyProblems('Restricted to HR')).toEqual(['banned word "restricted"'])
    expect(copyProblems('It reads "—" when hidden')).toEqual([])
  })
})

describe('Start here and Each view: each mode reads only what it shows', () => {
  it('names nothing a mode hides, in any shown block, title or summary', () => {
    const found: string[] = []
    for (const { name, access } of EVERY)
      for (const a of MINE) {
        if (!articleShown(access, a.id)) continue
        for (const t of shownStrings(access, a))
          found.push(...namesHidden(access, a.id, t).map((x) => `${name}: ${x}`))
      }
    expect([...new Set(found)]).toEqual([])
  })

  it('is not vacuous: the names check meets text the conditions leave out', () => {
    const found: string[] = []
    for (const { access } of EVERY)
      for (const a of MINE)
        for (const b of a.body) for (const t of blockTexts(b)) found.push(...namesHidden(access, a.id, t))
    expect(found.length).toBeGreaterThan(20)
  })

  it('holds no amount in Manager mode, while the other modes read some', () => {
    const manager = EVERY.filter((e) => e.mode === 'manager')
    for (const { name, access } of manager)
      for (const a of MINE) {
        if (!articleShown(access, a.id)) continue
        for (const t of shownStrings(access, a))
          expect(amountsIn(plainText(t)), `${name} ${a.id}: ${t}`).toEqual([])
      }
    expect(amountsIn(textOf(BARE.hrbp, 'reading-a-number')).length).toBeGreaterThan(0)
    expect(amountsIn(textOf(BARE.leader, 'modes')).length).toBeGreaterThan(0)
  })

  it('lists only metrics the mode shows, wherever the article shows', () => {
    for (const { name, access } of EVERY)
      for (const a of MINE) {
        if (!articleShown(access, a.id)) continue
        for (const id of a.metrics ?? []) {
          expect(METRIC_IDS.has(id), `${a.id} ${id}`).toBe(true)
          expect(access.can(`metric:${id}`), `${name} ${a.id} ${id}`).toBe(true)
        }
      }
  })

  it('leaves every mode some body in every article it shows', () => {
    for (const { name, access } of EVERY)
      for (const a of MINE) {
        if (!articleShown(access, a.id)) continue
        expect(articleInMode(access, a).body.length, `${name} ${a.id}`).toBeGreaterThan(2)
      }
  })
})

describe('Start here and Each view: links', () => {
  it('points every link at a real page, tab, metric, article, tour or Settings section', () => {
    const problems: string[] = []
    for (const a of MINE)
      for (const b of a.body)
        for (const t of blockTexts(b))
          for (const l of linksIn(t)) {
            const why =
              l.kind === 'route'
                ? routeProblem(l.target)
                : l.kind === 'metric'
                  ? METRIC_IDS.has(l.target)
                    ? null
                    : 'no metric'
                  : l.kind === 'article'
                    ? (HELP_ARTICLE_IDS as readonly string[]).includes(l.target)
                      ? null
                      : 'no article'
                    : l.kind === 'tour'
                      ? (HELP_TOUR_IDS as readonly string[]).includes(l.target)
                        ? null
                        : 'no tour'
                      : (SETTINGS_SECTIONS as readonly string[]).includes(l.target)
                        ? null
                        : 'no Settings section'
            if (why) problems.push(`${a.id}: [${l.label}](${l.kind}:${l.target}) ${why}`)
          }
    expect(problems).toEqual([])
    expect(routeProblem('plan.nope')).not.toBeNull()
    expect(routeProblem('nope')).not.toBeNull()
  })

  it('keeps a route link a link wherever its block shows, or under a condition that hides it', () => {
    // A route link in a block a mode shows reads as text only where its page is hidden; these
    // articles keep such links for pages the mode shows (the names check covers the words).
    const texted: string[] = []
    for (const { name, mode, access } of EVERY)
      for (const a of MINE) {
        if (!articleShown(access, a.id)) continue
        for (const b of articleInMode(access, a).body)
          for (const t of blockTexts(b))
            for (const l of linksIn(t)) {
              if (l.kind !== 'route') continue
              const [view, ...tab] = l.target.split('.')
              if (!routeShown(mode, view, tab.join('.'))) texted.push(`${name} ${a.id} ${l.target}`)
            }
      }
    expect(texted).toEqual([])
  })
})

describe('Start here covers what PLAN 14.2 lists', () => {
  it('ends modes with NOT_SECURITY_LONG in every mode', () => {
    const modes = START_ARTICLES.find((a) => a.id === 'modes') as HelpArticle
    for (const { name, access } of EVERY) {
      const last = articleInMode(access, modes).body.at(-1)
      expect(last && 'p' in last ? last.p : null, name).toBe(NOT_SECURITY_LONG)
    }
  })

  it('explains the filters, the version picker and the comparison picker in moving-around', () => {
    for (const { name, access } of EVERY) {
      const t = textOf(access, 'moving-around')
      for (const w of ['filter row', 'version picker', 'comparison picker', 'period'])
        expect(t.includes(w), `${name} ${w}`).toBe(true)
    }
  })

  it('explains heads, FTE, "—" and calculation cards everywhere, and loaded cost and "Other (k)" where amounts show', () => {
    for (const { name, mode, access } of EVERY) {
      const t = textOf(access, 'reading-a-number')
      for (const w of ['head', 'FTE', '"—"', 'calculation card'])
        expect(t.includes(w), `${name} ${w}`).toBe(true)
      const amounts = mode !== 'manager'
      expect(t.includes('Loaded cost'), `${name} loaded cost`).toBe(amounts)
      expect(t.includes('"Other (k)"'), `${name} Other (k)`).toBe(amounts)
    }
  })

  it('explains the header, the Suppressed flag, the long CSV and workspace files in exporting', () => {
    for (const { name, mode, access } of EVERY) {
      const t = textOf(access, 'exporting')
      for (const w of ['header', 'long CSV', 'Workspace', 'Shareable'])
        expect(t.includes(w), `${name} ${w}`).toBe(true)
      expect(t.includes('Suppressed'), `${name} Suppressed`).toBe(mode !== 'manager')
      expect(t.includes('load file'), `${name} load file`).toBe(mode === 'finance' || mode === 'hr-admin')
    }
  })

  it('opens what-headcount-planner-is on the mode’s own home', () => {
    const homes: Record<Mode, string> = {
      manager: '[My team](route:team)',
      hrbp: '[Home](route:home)',
      leader: '[Home](route:home)',
      finance: '[Home](route:home)',
      'hr-admin': '[Data room](route:data)',
    }
    const article = START_ARTICLES[0]
    for (const { name, mode, access } of EVERY) {
      const raw = articleInMode(access, article)
        .body.flatMap((b) => blockTexts(b))
        .filter((t) => t.includes('Headcount Planner opens here'))
      expect(raw.length, name).toBe(1)
      expect(raw[0].startsWith(homes[mode]), name).toBe(true)
    }
  })
})

describe('Each view covers its view in each mode', () => {
  const HOMES: Record<'hrbp' | 'leader' | 'finance', string> = {
    hrbp: 'Unit plan',
    leader: 'Rollup vs target',
    finance: 'Plan vs actual',
  }

  it('gives view-home one section per home, each under its own mode only', () => {
    const home = VIEW_ARTICLES.find((a) => a.id === 'view-home') as HelpArticle
    for (const { name, mode, access } of EVERY) {
      if (!articleShown(access, 'view-home')) continue
      const own = HOMES[mode as keyof typeof HOMES]
      const hs = headings(articleInMode(access, home).body)
      for (const h of Object.values(HOMES)) expect(hs.includes(h), `${name} ${h}`).toBe(h === own)
    }
    expect(MODES.filter((m) => articleShown(BARE[m], 'view-home'))).toEqual(['hrbp', 'leader', 'finance'])
  })

  it('describes each tab of a view only where the mode shows it', () => {
    const tabSections: [string, string, string][] = [
      ['view-plan', 'Overview', 'tab:plan.overview'],
      ['view-plan', 'Transfers', 'tab:plan.transfers'],
      ['view-requests', 'Queue', 'tab:requests.queue'],
      ['view-requests', 'New', 'tab:requests.new'],
      ['view-finance', 'Export', 'tab:finance.export'],
      ['view-plan', 'Changing a seat in Working', 'action:position.edit'],
    ]
    for (const { name, access } of EVERY)
      for (const [id, h, surface] of tabSections) {
        if (!articleShown(access, id)) continue
        const a = VIEW_ARTICLES.find((x) => x.id === id) as HelpArticle
        expect(headings(articleInMode(access, a).body).includes(h), `${name} ${id} ${h}`).toBe(
          access.can(surface),
        )
      }
  })

  it('reads What if as a tool with three results, and Finance mode without making requests', () => {
    for (const { name, mode, access } of EVERY) {
      if (!articleShown(access, 'view-whatif')) continue
      const t = textOf(access, 'view-whatif')
      for (const w of ['Heads change', 'Cost change', 'Gap change', 'Levers'])
        expect(t.includes(w), `${name} ${w}`).toBe(true)
      expect(t.includes('Turn into requests'), name).toBe(mode !== 'finance')
    }
  })

  it('says My team holds no amounts and the Data room counts only rows', () => {
    expect(textOf(BARE.manager, 'view-team')).toContain('no amounts')
    expect(textOf(BARE['hr-admin'], 'view-data')).toContain('count of rows')
    // Each view article shows exactly where its view does.
    for (const m of MODES)
      for (const v of VIEW_KEYS)
        expect(articleShown(BARE[m], `view-${v}`), `${m} ${v}`).toBe(routeShown(m, v, ''))
  })
})

/**
 * The M4 review's help findings on Start here and Each view (scratchpad m4-review/kept.json), each
 * read in every mode, with and without a scope: what the app does, in the words each mode shows.
 */
describe('M4 review: Start here and Each view say what the app does', () => {
  /** A mode with its scope held (a team, unit or org picked). */
  const held = (m: Mode): HelpAccess => ({ mode: m, can: BARE[m].can })

  it('defines actual heads as active HRIS employees, the Not in plan row and leave where shown (CP-4, HL-2)', () => {
    for (const { name, access } of EVERY) {
      const t = textOf(access, 'reading-a-number')
      expect(t, name).not.toContain('Actual heads count Filled seats')
      expect(t, name).toContain('Actual heads count the active employees in the HRIS on the date')
      expect(t, name).toContain('people with no position included')
      expect(t.includes('"Not in plan" row'), name).toBe(access.can('tab:plan.overview'))
      expect(t.includes('people on leave'), name).toBe(access.can('leave:counts'))
      // Average FTE is daily whatever the proration (PLAN 2).
      expect(t, name).toContain('over the days of the period, whatever the version’s proration')
    }
  })

  it('gives the band estimate its loads, as PLAN 2 defines it (CP-4)', () => {
    const loads =
      'band midpoint for its level and location × FTE, plus standard bonus, capped burden and benefits'
    for (const { name, mode, access } of EVERY) {
      const t = textOf(access, 'reading-a-number')
      expect(t.includes(loads), name).toBe(mode !== 'manager')
      expect(t, name).not.toContain(
        'its band estimate, the midpoint for its level and location at plan rates',
      )
    }
  })

  it('names the mode on HR admin’s outputs, and says every output with the switch on holds pay (CP-1, D-MODELINE, D-PAYFILES)', () => {
    const admin = textOf(BARE['hr-admin'], 'exporting')
    expect(admin).toContain(`In this mode the mode line reads "${hrAdminExportLine(false)}"`)
    expect(admin).toContain(`The mode line then reads "${hrAdminExportLine(true)}"`)
    expect(admin).toContain('every export’s first line is "Contains individual pay"')
    expect(admin).toContain(
      'A Shareable file is always written as HR admin mode shows the plan with Show pay amounts off',
    )
    for (const m of MODES.filter((x) => x !== 'hr-admin')) {
      const t = textOf(BARE[m], 'exporting')
      expect(t, m).toContain('then the mode it was made in')
      expect(t, m).not.toContain('HR admin mode')
      expect(t, m).not.toContain('Contains individual pay')
    }
  })

  it('puts Finance’s component split in the control totals for whole units and the company only (CP-3, SB-1)', () => {
    const exporting = textOf(BARE.finance, 'exporting')
    expect(exporting).not.toContain('The split by component is in the control totals.')
    expect(exporting).not.toContain('heads, FTE and USD per component, with the count')
    expect(exporting).toContain(
      'Control totals are heads, FTE, loaded USD and the count of suppressed cells, with USD per component for each whole unit and the company',
    )
    const finance = textOf(BARE.finance, 'view-finance')
    expect(finance).not.toContain('a cost component shows only where 5 or more positions contribute')
    expect(finance).toContain('USD per component for each whole unit and the company')
    expect(finance).toContain('never for a cost center')
  })

  it('lists only the long CSV columns Manager mode writes (HL-11)', () => {
    const keys = LONG_HEADS_COLUMNS.map((c) => c.key)
    // The words for the columns Manager's file leaves out.
    const left: Record<string, string> = {
      account: 'account',
      component: 'component',
      currency: 'currency',
      rateSet: 'rate set',
    }
    for (const k of Object.keys(left)) {
      expect(
        LONG_CSV_COLUMNS.some((c) => c.key === k),
        k,
      ).toBe(true)
      expect(keys, k).not.toContain(k)
    }
    for (const access of [BARE.manager, held('manager')]) {
      const t = textOf(access, 'exporting')
      const long = t.slice(t.indexOf('The long CSV'))
      for (const [k, w] of Object.entries(left)) expect(long.includes(w), `${k}: ${w}`).toBe(false)
      for (const w of [
        'period',
        'org',
        'cost center',
        'heads',
        'FTE',
        'version',
        'lock hash',
        'as-of',
        'proration',
      ])
        expect(long, w).toContain(w)
      expect(long).toContain('no amount columns')
    }
    expect(textOf(BARE.hrbp, 'exporting')).toContain('account, component and currency')
  })

  it('gives the approval chain as CHAIN_RULES builds it, the threshold amount only where amounts show (HL-1)', () => {
    // The engine: Finance takes every New role, every freeze or envelope exception, and trades that
    // cross units or are out of plan; the leader a band estimate over the threshold, Director+ or
    // out of plan, never on a Transfer but across units.
    const finance = CHAIN_RULES.filter((r) => r.role === 'finance')
    expect(finance.some((r) => r.when !== 'always' && r.when.includes('new-role') && !r.only)).toBe(true)
    expect(
      finance.some((r) => r.only?.includes('Trade') && r.when !== 'always' && r.when.includes('cross-unit')),
    ).toBe(true)
    const leader = CHAIN_RULES.find((r) => r.role === 'leader' && r.who === 'nearest-leader' && !r.only)
    expect(leader?.when).toEqual(['band-estimate-over-threshold', 'director-plus', 'out-of-plan'])
    expect(leader?.except).toContain('Transfer')
    for (const { name, mode, access } of EVERY) {
      const t = textOf(access, 'view-requests')
      expect(t, name).not.toContain('new roles and trades out of plan to Finance')
      for (const w of [
        'It starts with the requester’s manager, then the unit’s HRBP',
        'The leader joins for a seat at Director or above, or a request out of plan',
        'A Transfer takes leaders only when it crosses units',
        'Finance approves every New role, every freeze or envelope exception, and trades that cross units or are out of plan',
        'adds the receiving unit’s HRBP and both unit leaders',
        'Start recruiting and Start date go to the HRBP only',
        'over the leader threshold',
      ])
        expect(t, `${name}: ${w}`).toContain(w)
      expect(t.includes('$250,000'), name).toBe(mode !== 'manager')
    }
  })

  it('merges every request for a Leader acting as the CEO, CFO or CHRO, and only its org’s otherwise (HL-3)', () => {
    expect(BARE.leader.scope).toBeNull()
    const company = textOf(BARE.leader, 'view-requests')
    expect(company).toContain('Acting as the CEO, CFO or CHRO, it merges every request in the file')
    expect(company).not.toContain('it merges only requests that touch your org')
    const tree = textOf(held('leader'), 'view-requests')
    expect(tree).toContain('it merges only requests that touch your org or wait on you')
    expect(tree).not.toContain('Acting as the CEO, CFO or CHRO')
  })

  it('says a trade gets seats worth no more standard heads, the rest kept as credit (CP-7)', () => {
    const credit = 'worth no more standard heads; what is left over stays as trade credit'
    for (const { name, access } of EVERY)
      for (const id of ['view-requests', 'view-whatif']) {
        if (!articleShown(access, id)) continue
        const t = textOf(access, id)
        expect(t, `${name} ${id}`).not.toContain('equal weight')
        if (id === 'view-whatif' || access.can('tab:requests.new'))
          expect(t, `${name} ${id}`).toContain(credit)
      }
  })

  it('starts Planned seats in the forecast too, and folds no bridge step with the switch on (HL-13, SA-4)', () => {
    for (const { name, access } of EVERY) {
      if (!articleShown(access, 'view-forecast')) continue
      const t = textOf(access, 'view-forecast')
      expect(t, name).toContain(
        'Planned seats start at their planned start, or the time to fill after the as-of date if that is later, also at the fill rate',
      )
      expect(t.includes('With Show pay amounts on, no step folds'), name).toBe(access.can('pay:switch'))
      expect(t, name).toContain('mix (level, location and FTE changes)')
    }
  })

  it('explains forecast accuracy where the mode shows it, its cost figure only where cost is exact (SA-1)', () => {
    for (const { name, access } of EVERY) {
      if (!articleShown(access, 'view-forecast')) continue
      const t = textOf(access, 'view-forecast')
      expect(t.includes('Forecast accuracy'), name).toBe(access.can('metric:forecast.accuracy.heads'))
      expect(t.includes('and for loaded cost'), name).toBe(access.can('metric:forecast.accuracy.cost'))
    }
    expect(textOf(BARE.finance, 'view-forecast')).toContain('and for loaded cost')
    expect(textOf(BARE.hrbp, 'view-forecast')).toContain('Its cost figure shows in Finance mode')
  })
})

describe('fix step, loose ends: the component control totals and forecast accuracy as built', () => {
  it('words each split as componentTotalLines writes it, and names the Finance > Export figure', () => {
    // The finance writer's own line: the six filled-part components, the band part apart, loaded.
    const [line] = componentTotalLines([
      {
        period: 'FY',
        org: 'Operations',
        label: 'Operations',
        usdByComponent: { base: 1, bonus: 1, burden: 1, benefits: 1, oneTime: 1, vacancy: 1 },
        bandUsd: 1,
        loadedUsd: 7,
        costed: 9,
      },
    ])
    const order = ['base', 'bonus', 'burden', 'benefits', 'one-time', 'vacancy allowance']
    expect(
      line
        .split(': ')[1]
        .split(', ')
        .map((p) => p.replace(/ [\d.,]+ USD$/, '')),
    ).toEqual([...order, 'Open and Planned at band estimate', 'loaded'])
    const words =
      'base, bonus, burden, benefits, one-time and vacancy allowance, then Open and Planned at band estimate apart, then loaded cost'
    expect(textOf(BARE.finance, 'exporting')).toContain(words)
    expect(textOf(BARE.finance, 'exporting')).toContain(
      'Finance > Export lists the same lines as "Control totals by component"',
    )
    for (const m of ['finance', 'hr-admin'] as const) {
      const t = textOf(BARE[m], 'view-finance')
      expect(t, m).toContain('Control totals by component lists those splits')
      expect(t, m).toContain(words)
    }
    for (const m of MODES.filter((x) => !BARE[x].can('tab:finance.export')))
      if (articleShown(BARE[m], 'view-finance'))
        expect(textOf(BARE[m], 'view-finance'), m).not.toContain('Control totals by component')
  })

  it('says the switch-on long CSV splits every row and adds a split for the scope and each unit', () => {
    for (const m of MODES) {
      const t = textOf(BARE[m], 'exporting')
      expect(
        t.includes('the control totals add a line by component for the file’s scope and for each unit in it'),
        m,
      ).toBe(BARE[m].can('pay:switch'))
    }
  })

  it('puts forecast accuracy (cost) on Finance > Versions and both figures on the Variance tab, company only', () => {
    for (const { name, access } of EVERY) {
      if (articleShown(access, 'view-finance'))
        expect(textOf(access, 'view-finance').includes('Forecast accuracy (cost) compares'), name).toBe(
          access.can('metric:forecast.accuracy.cost'),
        )
      if (!articleShown(access, 'view-forecast')) continue
      const t = textOf(access, 'view-forecast')
      expect(t.includes('Forecast accuracy is among the key figures of the Variance tab'), name).toBe(
        access.can('metric:forecast.accuracy.heads'),
      )
    }
    expect(textOf(BARE.finance, 'view-finance')).toContain('reads "—" while an org filter is set')
    expect(textOf(BARE.hrbp, 'view-forecast')).toContain(
      'for a team, unit or org, it reads "—" with the reason',
    )
  })
})
