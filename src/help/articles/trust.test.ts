/**
 * The help-trust articles (docs/PLAN.md 14.2 bullets 5 and 6, 14.3; docs/CONTRACTS-M4.md 3): Your
 * data, Definitions, Privacy and trust, Help and support, and the release notes. In every mode that
 * shows them, they keep the copy rules, name nothing the mode hides, hold no amount in Manager mode
 * and no leave in Manager or Finance mode, and leave no heading empty. `about-server` is the only
 * exemption from the banned words and does use one; no article, tour or release note uses a hash
 * word. The facts PLAN asks for are there (the eight datasets by label, the four workspace files in
 * the modes that make them, the shared origin, C33 and C34, each mode's pay rule), the trade
 * example is fixture T1 as the trade engine quotes it, and the messages quoted are the app's own.
 * Every scan has a control that would fail it, so none is vacuous.
 */
import { describe, expect, it, vi } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { BANNED_HASH_WORDS, BANNED_MODE_WORDS, BANNED_WORDS_EXEMPT, NOT_SECURITY_SHORT } from '@/access/copy'
import { DATA_TABS, VIEW_TABS } from '@/access/ids'
import { MODES, type Mode } from '@/access/modes'
import { APP_SLUG, LIVE_URL, ONE_FILE, STORAGE_PREFIX } from '@/app/brand'
import { ERROR_BODY, errorTitle } from '@/app/ErrorBoundary'
import { CONFIRMED, RAW_DATASETS } from '@/data/sample/raw/plan'
import { DATASETS, isViewKey } from '@/data/schema'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { STORAGE_UNAVAILABLE_NOTICE } from '@/data/store'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { severanceOf } from '@/plan/engine/cost'
import { TRADE_RATES_11_7 } from '@/plan/engine/fixtures/band'
import { C4 } from '@/plan/engine/fixtures/cost'
import { T1, TRADE_SEATS, tradeContext } from '@/plan/engine/fixtures/trade'
import { tradeQuote } from '@/plan/engine/trade'
import { READ_ONLY_NOTE } from '@/plan/store/types'
import {
  DAMAGED_TEXT,
  FOREIGN_TEXT,
  FULL_TOO_LARGE_TEXT,
  hashMismatchText,
  NEWER_TEXT,
  NO_REQUESTS_TEXT,
  TOO_LARGE_TEXT,
} from '@/plan/workspace/validate'
import { amountsIn } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { parseDataTab } from '@/views/data/engine/links'
import { articleInMode, articleShown, blocksInMode } from '../access'
import { copyProblems, sentenceCaseProblem } from '../check'
import { blockTexts, linksIn, plainText } from '../markup'
import { namesHidden } from '../names'
import { TOURS, tourById } from '../tours'
import type { HelpArticle } from '../types'
import { RELEASE_NOTES, releaseItemWhen, releaseNotesIn } from '../whatsNew'
import { DATA_ARTICLES } from './data'
import { DEFINITION_ARTICLES } from './definitions'
import { ARTICLES, articleById } from './index'
import { PRIVACY_ARTICLES } from './privacy'
import { SUPPORT_ARTICLES } from './support'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const ACCESS = Object.fromEntries(MODES.map((m) => [m, accessFor(m, null, defaultMetrics())])) as Record<
  Mode,
  AccessContext
>
const MINE: readonly HelpArticle[] = [
  ...DATA_ARTICLES,
  ...DEFINITION_ARTICLES,
  ...PRIVACY_ARTICLES,
  ...SUPPORT_ARTICLES,
]
const EXEMPT = new Set<string>(BANNED_WORDS_EXEMPT.articles)
const byId = (id: string): HelpArticle => {
  const a = articleById(id)
  if (!a) throw new Error(`no article ${id}`)
  return a
}

/** Every string an article holds in any mode's wording: title, summaries, blocks and search words. */
const allStrings = (a: HelpArticle): string[] => [
  a.title,
  a.summary,
  ...(a.without ?? []).map((w) => w.summary),
  ...a.body.flatMap((b) => blockTexts(b)),
  ...(a.keywords ?? []),
  ...(a.keywordsWhere ?? []).flatMap((k) => k.words),
]

/** What one mode reads of an article: its title, its summary there, and every block left. */
function shown(access: AccessContext, a: HelpArticle): { where: string; text: string }[] {
  const m = articleInMode(access, a)
  return [
    { where: `${a.id} title`, text: m.title },
    { where: `${a.id} summary`, text: m.summary },
    ...m.body.flatMap((b) => blockTexts(b).map((t) => ({ where: a.id, text: plainText(t) }))),
    ...(m.keywords ?? []).map((k) => ({ where: `${a.id} keyword`, text: k })),
  ]
}

/** One mode's whole text of an article, as one string. */
const textIn = (mode: Mode, id: string): string =>
  shown(ACCESS[mode], byId(id))
    .map((x) => x.text)
    .join('\n')

/** Every (mode, article) pair where the article shows. */
const pairs = (): { mode: Mode; a: HelpArticle }[] =>
  MODES.flatMap((mode) => MINE.filter((a) => articleShown(ACCESS[mode], a.id)).map((a) => ({ mode, a })))

describe('the help-trust articles', () => {
  it('give every article of the four groups a summary and a body', () => {
    expect(MINE.map((a) => a.group)).toEqual([
      ...DATA_ARTICLES.map(() => 'data'),
      ...DEFINITION_ARTICLES.map(() => 'definitions'),
      ...PRIVACY_ARTICLES.map(() => 'privacy'),
      ...SUPPORT_ARTICLES.map(() => 'support'),
    ])
    for (const a of MINE) {
      expect(a.summary.length, a.id).toBeGreaterThan(20)
      expect(a.summary, a.id).toMatch(/^[A-Z].*\.$/)
      // What's new is generated: its body is the release notes.
      if (a.generated !== 'whats-new') expect(a.body.length, a.id).toBeGreaterThan(0)
    }
  })

  it('keep the copy rules in every string, and sentence case in every title and heading', () => {
    const found: string[] = []
    for (const a of MINE) {
      for (const s of allStrings(a))
        for (const p of copyProblems(s, { exempt: EXEMPT.has(a.id) })) found.push(`${a.id}: ${p}: ${s}`)
      for (const t of [a.title, ...a.body.flatMap((b) => ('h' in b ? [b.h] : []))]) {
        const p = sentenceCaseProblem(t)
        if (p) found.push(`${a.id}: ${p}: ${t}`)
      }
    }
    expect(found).toEqual([])
  })

  it('name no page, tab, switch or action a mode hides, in any mode that shows them', () => {
    const found: string[] = []
    for (const { mode, a } of pairs())
      for (const x of shown(ACCESS[mode], a)) found.push(...namesHidden(ACCESS[mode], x.where, x.text))
    expect(found).toEqual([])
    // Not vacuous: the files article as written names what Manager mode hides; its conditions drop it.
    const raw = allStrings(byId('data-workspace-file')).join('\n')
    expect(namesHidden(ACCESS.manager, 'raw', raw).length).toBeGreaterThan(2)
    expect(pairs().length).toBeGreaterThan(80)
  })

  it('hold no amount in anything Manager mode reads', () => {
    const found: string[] = []
    for (const a of MINE) {
      if (!articleShown(ACCESS.manager, a.id)) continue
      for (const x of shown(ACCESS.manager, a))
        for (const hit of amountsIn(x.text)) found.push(`${x.where}: ${hit}: ${x.text.slice(0, 80)}`)
    }
    expect(found).toEqual([])
    // Not vacuous: the amounts the other modes read are there, under conditions Manager mode fails.
    expect(amountsIn(textIn('hrbp', 'trading-heads')).length).toBeGreaterThan(3)
    expect(amountsIn(textIn('hrbp', 'privacy-small-groups')).length).toBeGreaterThan(0)
    expect(MINE.filter((a) => articleShown(ACCESS.manager, a.id)).length).toBeGreaterThan(12)
  })

  it('say nothing of leave in Manager or Finance mode', () => {
    const LEAVE = /\b(leave|on leave|unpaid|paid leave)\b/i
    for (const mode of ['manager', 'finance'] as const)
      for (const a of MINE) {
        if (!articleShown(ACCESS[mode], a.id)) continue
        for (const x of shown(ACCESS[mode], a))
          expect(LEAVE.test(x.text), `${mode} ${x.where}: ${x.text}`).toBe(false)
      }
    expect(LEAVE.test(textIn('hrbp', 'privacy-small-groups'))).toBe(true)
    expect(articleShown(ACCESS.finance, 'privacy-leave')).toBe(false)
  })

  it('leave no heading without text under it, in any mode', () => {
    const found: string[] = []
    for (const { mode, a } of pairs()) {
      const body = blocksInMode(ACCESS[mode], a.body)
      body.forEach((b, i) => {
        const next = body[i + 1]
        if ('h' in b && (!next || 'h' in next)) found.push(`${mode} ${a.id}: ${b.h}`)
      })
    }
    expect(found).toEqual([])
  })

  it('link only to articles, tours, pages, tabs, metrics and Settings sections that exist', () => {
    const tabsOf = (view: string): readonly string[] =>
      isViewKey(view) ? VIEW_TABS[view].map((t) => t.key) : []
    const routeProblem = (target: string): string | null => {
      const [view, ...rest] = target.split('.')
      const tab = rest.join('.')
      if (view === 'data') {
        if (!tab) return null
        const r = parseDataTab(tab)
        const known = DATA_TABS.some((t) => t.key === r.tab)
        return known && (r.tab !== 'datasets' || r.dataset) ? null : `no Data room tab ${tab}`
      }
      if (view === 'actions' || view === 'audit') return tab ? `${view} has no tab ${tab}` : null
      if (!isViewKey(view)) return `no page ${view}`
      if (!tab) return null
      return tabsOf(view).includes(tab.split(':')[0]) ? null : `no tab ${target}`
    }
    const found: string[] = []
    let links = 0
    for (const a of MINE) {
      for (const l of a.body.flatMap((b) => blockTexts(b)).flatMap(linksIn)) {
        links++
        const problem =
          l.kind === 'article'
            ? articleById(l.target)
              ? null
              : 'no article'
            : l.kind === 'tour'
              ? tourById(l.target)
                ? null
                : 'no tour'
              : l.kind === 'settings'
                ? (SETTINGS_SECTIONS as readonly string[]).includes(l.target)
                  ? null
                  : 'no Settings section'
                : l.kind === 'metric'
                  ? CATALOG.byId.has(l.target)
                    ? null
                    : 'no metric'
                  : routeProblem(l.target)
        if (problem) found.push(`${a.id}: [${l.label}](${l.kind}:${l.target}): ${problem}`)
      }
      for (const m of a.metrics ?? []) if (!CATALOG.byId.has(m)) found.push(`${a.id}: metric ${m}`)
      if (a.route) {
        const p = routeProblem(a.route.tab ? `${a.route.view}.${a.route.tab}` : a.route.view)
        if (p) found.push(`${a.id}: route ${p}`)
      }
    }
    expect(found).toEqual([])
    expect(links).toBeGreaterThan(40)
  })

  it('list only metrics each mode shows, wherever the article shows', () => {
    const found: string[] = []
    for (const { mode, a } of pairs())
      for (const id of a.metrics ?? [])
        if (!ACCESS[mode].can(`metric:${id}`)) found.push(`${mode} ${a.id} ${id}`)
    expect(found).toEqual([])
    expect(MINE.filter((a) => a.metrics?.length).length).toBeGreaterThan(4)
  })
})

describe('about-server and the banned words (14.2, 14.3)', () => {
  it('pin the exemption to about-server alone, which shows in every mode', () => {
    expect(BANNED_WORDS_EXEMPT.articles).toEqual(['about-server'])
    for (const m of MODES) expect(articleShown(ACCESS[m], 'about-server'), m).toBe(true)
  })

  it('use a banned word in about-server, so the exemption is not stale', () => {
    const text = allStrings(byId('about-server')).join('\n')
    const banned = BANNED_MODE_WORDS.filter((w) => text.toLowerCase().includes(w))
    expect(banned.length).toBeGreaterThan(0)
    expect(copyProblems(text).some((p) => p.startsWith('banned word'))).toBe(true)
    expect(copyProblems(text, { exempt: true })).toEqual([])
  })

  it('keep the banned mode words out of every other article and every tour', () => {
    const found: string[] = []
    for (const a of ARTICLES) {
      if (EXEMPT.has(a.id)) continue
      const text = allStrings(a).join('\n').toLowerCase()
      for (const w of BANNED_MODE_WORDS) if (text.includes(w)) found.push(`${a.id}: ${w}`)
    }
    for (const t of TOURS) {
      const text = [
        t.title,
        t.summary,
        ...(t.without ?? []).map((w) => w.summary),
        ...t.steps.flatMap((s) => [
          s.title,
          s.body,
          ...(s.wording ?? []).flatMap((w) => [w.title ?? '', w.body]),
        ]),
      ]
        .join('\n')
        .toLowerCase()
      for (const w of BANNED_MODE_WORDS) if (text.includes(w)) found.push(`tour ${t.id}: ${w}`)
    }
    expect(found).toEqual([])
  })

  it('never use a hash word anywhere, about-server and the release notes included', () => {
    const texts = [
      ...ARTICLES.flatMap(allStrings),
      ...RELEASE_NOTES.flatMap((n) => [n.title, ...n.items]),
    ].map((t) => t.toLowerCase())
    for (const w of BANNED_HASH_WORDS)
      expect(
        texts.filter((t) => t.includes(w)),
        w,
      ).toEqual([])
  })

  it('say what PLAN 14.2 asks: the browser, the modes, a server with sign-in in Phase 3, checksums', () => {
    const text = textIn('manager', 'about-server')
    expect(byId('about-server').title).toBe('Why there is no sign-in')
    expect(text).toContain('runs entirely in this browser')
    expect(text).toContain(NOT_SECURITY_SHORT)
    expect(text).toContain('Real access control needs a server with sign-in')
    expect(text).toContain('Phase 3')
    expect(text).toContain('They do not prove who made a file')
    // The same words in every mode: nothing in it depends on the mode.
    for (const m of MODES) expect(textIn(m, 'about-server'), m).toBe(text)
  })
})

describe('what each article must say (14.2)', () => {
  it('name all eight datasets by label in data-loading', () => {
    const text = textIn('hr-admin', 'data-loading')
    expect(DATASETS).toHaveLength(8)
    for (const d of DATASETS) expect(text, d.label).toContain(d.label)
  })

  it('cover the four workspace files in the modes that make them, and why each person gets their own', () => {
    const admin = textIn('hr-admin', 'data-workspace-file')
    for (const s of [
      'Shareable',
      'Export requests',
      'Export for a manager',
      'Full file',
      'Contains individual pay',
    ])
      expect(admin, s).toContain(s)
    for (const m of MODES) {
      const t = textIn(m, 'data-workspace-file')
      expect(t, m).toContain('never the mode it was made in')
      expect(t, m).toContain('plain JSON')
      expect(t, m).toContain('A checksum catches damage, not forgery')
      expect(t, m).toContain(DAMAGED_TEXT)
      expect(t.includes('Full file'), m).toBe(m === 'hr-admin')
      expect(t.includes('Export for a manager'), m).toBe(ACCESS[m].can('action:export.for-manager'))
    }
    expect(textIn('manager', 'data-workspace-file')).toContain('ask for one made for your team')
  })

  it('cover Budget, plan of record, Working, locks and closes in data-versions', () => {
    for (const m of MODES) {
      const t = textIn(m, 'data-versions')
      for (const s of ['Budget', 'Plan of record', 'Working', 'Locks', 'Month closes', 'Working, not locked'])
        expect(t, `${m} ${s}`).toContain(s)
    }
  })

  it('name the shared origin and the downloaded file in privacy-browser', () => {
    for (const m of MODES) {
      const t = textIn(m, 'privacy-browser')
      expect(t, m).toContain(new URL(LIVE_URL).host)
      expect(t, m).toContain(`${new URL(LIVE_URL).host}/${APP_SLUG}`)
      expect(t, m).toContain(`download ${ONE_FILE} for real data`)
      expect(t, m).toContain(`"${STORAGE_PREFIX}" keys`)
    }
  })

  it('give each mode its own pay rule in privacy-pay', () => {
    expect(articleShown(ACCESS.manager, 'privacy-pay')).toBe(false)
    for (const m of ['hrbp', 'leader'] as const) {
      const t = textIn(m, 'privacy-pay')
      expect(t, m).toContain('rounded down to a whole $0.1M')
      expect(t, m).not.toContain('Individual pay is left out')
    }
    expect(textIn('finance', 'privacy-pay')).toContain('Every export says "Individual pay is left out."')
    expect(textIn('finance', 'privacy-pay')).not.toContain('$0.1M')
    expect(textIn('hr-admin', 'privacy-pay')).toContain('Settings, Privacy')
    expect(textIn('hr-admin', 'privacy-pay')).toContain('Contains individual pay')
  })

  it('carry 5+, Other (k), "—", $0.1M per team, differences, components and C33 and C34 in privacy-small-groups', () => {
    for (const m of MODES) {
      const t = textIn(m, 'privacy-small-groups')
      const amounts = ACCESS[m].can('cost:band')
      expect(t.includes('Other (k)'), m).toBe(amounts)
      expect(t.includes('"—"'), m).toBe(amounts)
      expect(t.includes('5 or more contributors'), m).toBe(amounts)
      expect(t.includes('$0.1M'), m).toBe(ACCESS[m].can('pay:rounded'))
    }
    const fin = textIn('finance', 'privacy-small-groups')
    // C15 and C33 (a) to (e).
    expect(fin).toContain('Country, legal-entity and currency rows are sums of the unit’s shown cost centers')
    expect(fin).toContain('Cost filters are whole business units')
    expect(fin).toContain('The split by component shows only on unit and company figures')
    expect(fin).toContain('below its cap and 0 or 5 or more at or above it')
    expect(fin).toContain('Bridge steps and the FX effect show per unit and for the company')
    expect(fin).toContain(
      'back-dated adjustments and the count of other HRIS changes show for the company only',
    )
    expect(fin).toContain('Closed months come from the month closes everywhere')
    // C34: one fold in every scope; and where leave shows, the fold never reads it.
    expect(fin).toContain('That one fold applies in every scope')
    for (const m of MODES)
      expect(textIn(m, 'privacy-small-groups').includes('never adds or removes a bridge row'), m).toBe(
        ACCESS[m].can('leave:counts'),
      )
    expect(textIn('manager', 'privacy-small-groups')).toContain('Manager mode shows no amount of any kind')
  })

  it('keep leave to its whole-scope count in privacy-leave', () => {
    for (const m of MODES)
      expect(articleShown(ACCESS[m], 'privacy-leave'), m).toBe(ACCESS[m].can('leave:counts'))
    expect(textIn('hrbp', 'privacy-leave')).toContain('for your whole unit at the as-of date')
    expect(textIn('leader', 'privacy-leave')).toContain('for your whole org at the as-of date')
    expect(textIn('hrbp', 'privacy-leave')).toContain(
      'Leave counts show for your whole unit or org at the as-of date.',
    )
    expect(textIn('hr-admin', 'privacy-leave')).toContain('only while Show pay amounts is on')
  })

  it('work fixture T1 in trading-heads exactly as the trade engine quotes it', () => {
    const q = tradeQuote(T1.ask, TRADE_SEATS, TRADE_RATES_11_7, tradeContext(T1.creditBalanceBp))
    expect(q.ok).toBe(true)
    const sh = (bp: number, dp: number) => (bp / 10_000).toFixed(dp)
    const usd = (n: number) =>
      `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const each = q.get[0].weightBp ?? 0
    const S = q.rates.standardHeadUsd
    const words = [
      `weighs ${sh(q.giveBp, 2)} standard heads (${sh(q.giveBp, 4)})`,
      `weighs ${sh(each, 2)} (${sh(each, 4)})`,
      `You can get ${q.get.length}: ${q.get.length} × ${sh(each, 4)} = ${sh(q.getBp, 2)} standard heads`,
      `A ninth would need ${sh(each * (q.maxSeats + 1), 2)}`,
      `The ratio is ${q.ratio.toFixed(2)} (${sh(q.giveBp, 4)} ÷ ${sh(each, 4)})`,
      `${sh(q.giveBp, 4)} − ${sh(q.getBp, 4)} = ${sh(q.creditBp, 4)}, so ${sh(q.creditBp, 2)} standard heads stay as credit`,
      `Heads: +${q.headsDelta}`,
      `saves ${sh(-q.inYearBp, 2)} standard heads this year`,
      `"Give 1 P5 San Jose (${sh(q.giveBp, 2)}). Get ${q.get.length} P3 Bengaluru (${sh(q.getBp, 2)}). Credit ${sh(q.creditBp, 2)} standard heads. Heads +${q.headsDelta}. In FY27 this saves ${sh(-q.inYearBp, 2)} standard heads (start dates)."`,
    ]
    const amounts = [
      `the standard head is ${usd(S).replace('.00', '')}`,
      `band estimate is ${usd(q.give[0].bandUsd ?? 0)}`,
      `which is ${usd(q.get[0].bandUsd ?? 0)} at 0.012`,
      `band estimate of ${usd(q.getBandUsd)}`,
      `The year’s saving is ${usd((-q.inYearBp * S) / 10_000)}`,
      `plus ${usd((q.creditBp * S) / 10_000)} of credit`,
    ]
    for (const m of MODES) {
      const t = textIn(m, 'trading-heads')
      for (const w of words) expect(t, `${m}: ${w}`).toContain(w)
      for (const w of amounts) expect(t.includes(w), `${m}: ${w}`).toBe(ACCESS[m].can('cost:band'))
    }
    expect(q.maxSeats).toBe(q.get.length)
    expect(q.getBandUsd).toBeGreaterThan(250_000)
  })

  it('quote the app’s own messages in troubleshooting and faq', () => {
    const t = textIn('hr-admin', 'troubleshooting')
    expect(t).toContain(READ_ONLY_NOTE)
    expect(t).toContain(`"${STORAGE_UNAVAILABLE_NOTICE.title}"`)
    expect(t).toContain(STORAGE_UNAVAILABLE_NOTICE.description)
    for (const s of [
      DAMAGED_TEXT,
      NEWER_TEXT,
      FOREIGN_TEXT,
      NO_REQUESTS_TEXT,
      hashMismatchText('FY27 Budget'),
    ])
      expect(t.replace(/’/g, "'"), s).toContain(s)
    expect(TOO_LARGE_TEXT).toContain('25 MB')
    expect(FULL_TOO_LARGE_TEXT).toContain('150 MB')
    expect(t).toContain('can be up to 25 MB')
    expect(t).toContain('can be up to 150 MB')
    expect(t).toContain(`"${errorTitle()}"`)
    expect(ERROR_BODY).toContain('Your data has not changed')
    // Every mode reads the reader tab's line under its own heading.
    for (const m of MODES) expect(textIn(m, 'troubleshooting'), m).toContain(READ_ONLY_NOTE)
  })

  it('name the mode and unit in report-problem, never a person, position or request ID', () => {
    for (const m of MODES) {
      const t = textIn(m, 'report-problem')
      expect(t, m).toContain('The mode, with the business unit an HRBP mode keeps to')
      expect(t, m).toContain('A manager or a leader is never named')
      expect(t, m).toContain('no employee or position IDs, no request IDs')
    }
  })

  it('show no person, employee, position or request ID in any of these articles', () => {
    const ID = /\bE\d{4,}\b|\bP-[A-Z0-9]|\bR-\d|\bR-[A-Z0-9]{4}-\d|\bREQ-\d/
    for (const a of MINE) for (const s of allStrings(a)) expect(ID.test(s), `${a.id}: ${s}`).toBe(false)
    expect(ID.test('R-1035')).toBe(true)
  })
})

describe('the release notes (whatsNew.ts)', () => {
  it('run newest first, with real dates, sentence-case titles and the copy rules', () => {
    expect(RELEASE_NOTES.length).toBeGreaterThan(2)
    const dates = RELEASE_NOTES.map((n) => n.date)
    expect(dates).toEqual([...dates].sort().reverse())
    for (const n of RELEASE_NOTES) {
      expect(n.date, n.title).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(n.date)), n.date).toBe(false)
      expect(sentenceCaseProblem(n.title), n.title).toBeNull()
      expect(n.items.length, n.title).toBeGreaterThan(0)
      for (const s of [n.title, ...n.items]) {
        expect(copyProblems(s), s).toEqual([])
        expect(s, s).toMatch(/^[A-Z?"].*[.?]$|^[A-Z][^.]*$/)
      }
    }
  })

  it('hold no amount and name nothing a mode hides, since every mode reads them', () => {
    const texts = RELEASE_NOTES.flatMap((n) => [n.title, ...n.items])
    for (const s of texts) expect(amountsIn(s), s).toEqual([])
    for (const m of MODES)
      for (const s of texts) expect(namesHidden(ACCESS[m], 'whats-new', s), `${m}: ${s}`).toEqual([])
    // Not vacuous: a note naming a hidden page would be caught in Manager mode.
    expect(
      namesHidden(ACCESS.manager, 'whats-new', 'Forecast > Bridge shows the FX step.').length,
    ).toBeGreaterThan(0)
  })
})

/**
 * The M4 review's help findings on Your data, Definitions, Privacy and trust, Help and support and
 * the release notes (scratchpad m4-review/kept.json): what the app does, in each mode's words.
 */
describe('M4 review: the help-trust articles say what the app does', () => {
  /** A mode with its scope held (a team, unit or org picked); ACCESS holds none. */
  const held = (m: Mode) => ({ mode: m, can: ACCESS[m].can })
  const heldText = (m: Mode, id: string): string =>
    shown(held(m) as AccessContext, byId(id))
      .map((x) => x.text)
      .join('\n')

  it('books severance where the engine does: the month of the day after the last day (HL-4)', () => {
    const t = textIn('finance', 'cost-definition')
    expect(t).not.toContain('severance in the month after an eliminated seat’s last day')
    expect(t).toContain(
      'severance in the month of the day after an eliminated seat’s last day, which is the next month only when the last day is a month-end',
    )
    // Fixture C4: a 31 Dec last day books in January, a 15 Dec one in December.
    const booked = C4.severance.flatMap((c) => {
      const item = severanceOf(c.input)
      return item && c.input.endDate ? [{ end: c.input.endDate, month: item.month }] : []
    })
    expect(booked).toEqual([
      { end: '2026-12-31', month: '2027-01' },
      { end: '2026-12-15', month: '2026-12' },
    ])
  })

  it('says which sample datasets arrive as files with a mapping, as the sample starts them (HL-5)', () => {
    const t = textIn('hr-admin', 'data-mapping')
    expect(t).not.toContain('A dataset on the sample has no file behind it')
    // In the order the Data room lists them.
    const raw = DATASETS.filter((d) => (RAW_DATASETS as readonly string[]).includes(d.key)).map(
      (d) => d.label,
    )
    expect(raw.length).toBe(RAW_DATASETS.length)
    const generated = DATASETS.filter((d) => !(RAW_DATASETS as readonly string[]).includes(d.key)).map(
      (d) => d.label,
    )
    expect(t).toContain(
      `On the sample, ${generated.join(', ').replace(/, ([^,]+)$/, ' and $1')} are generated`,
    )
    expect(t).toContain(`${raw.join(', ').replace(/, ([^,]+)$/, ' and $1')} arrive as raw extracts`)
    // Requests is the one raw extract whose mapping nobody confirmed.
    const unconfirmed = RAW_DATASETS.filter((k) => !CONFIRMED[k])
    expect(unconfirmed).toEqual(['requests'])
    expect(t).toContain('The Requests mapping is left unconfirmed on purpose, so it shows bronze.')
  })

  it('merges every request for a Leader acting as the CEO, CFO or CHRO, only its org’s otherwise (HL-3)', () => {
    expect(ACCESS.leader.scope).toBeNull()
    const company = textIn('leader', 'data-workspace-file')
    expect(company).toContain(
      'Acting as the CEO, CFO or CHRO, Import requests merges every request in a file',
    )
    expect(company).not.toContain('merges only the requests that touch your org')
    const tree = heldText('leader', 'data-workspace-file')
    expect(tree).toContain('merges only the requests that touch your org or wait on you')
    expect(tree).not.toContain('Acting as the CEO, CFO or CHRO')
  })

  it('names row counts in the Report a problem summary only where the Data room shows (HL-6)', () => {
    for (const m of MODES) {
      const t = textIn(m, 'report-problem')
      expect(t.includes('rows and tier'), m).toBe(ACCESS[m].can('page:data'))
      expect(t.includes('source (the sample or a file) and tier'), m).toBe(!ACCESS[m].can('page:data'))
    }
  })

  it('defines heads in the faq as the app counts them (HL-2)', () => {
    for (const m of MODES) {
      const t = textIn(m, 'faq')
      expect(t, m).not.toContain('Heads count every employee in a seat')
      expect(t, m).toContain(
        'actual heads count the active employees in the HRIS on the date, people with no position included',
      )
    }
  })

  it('puts Finance’s component split in the control totals for whole units and the company (CP-3, SB-1)', () => {
    const t = textIn('finance', 'privacy-small-groups')
    expect(t).not.toContain('the split by component is in their control totals')
    expect(t).toContain('their control totals give USD per component for each whole unit and the company')
  })

  it('says both load files made with the switch on start with the pay line (M4 recheck D-PAYFILES-a)', () => {
    const pay = textIn('hr-admin', 'privacy-pay')
    expect(pay).toContain('the long CSV and both load files')
    expect(pay).not.toContain('the unsuppressed load file. The Full file')
    const ex = textIn('hr-admin', 'exporting')
    expect(ex).toContain('the long CSV and both load files')
    expect(ex).toContain('Both files then start with "Contains individual pay"')
    const fin = textIn('hr-admin', 'view-finance')
    expect(fin).not.toContain('the file at Finance’s rules is still written as with the switch off.')
    expect(fin).toContain('made with it on, both start with "Contains individual pay"')
  })

  it('says every export made with the switch on holds pay, and a Shareable file never does (D-PAYFILES)', () => {
    const pay = textIn('hr-admin', 'privacy-pay')
    expect(pay).toContain('Every export made while it is on starts with the line "Contains individual pay"')
    expect(pay).toContain('A Shareable file is always written as with the switch off')
    const files = textIn('hr-admin', 'data-workspace-file')
    expect(files).toContain(
      'A Shareable file is always written as HR admin mode shows the plan with Show pay amounts off',
    )
    expect(files).not.toContain('A Shareable file holds amounts only as this mode shows them')
    for (const m of ['hrbp', 'leader', 'finance'] as const)
      expect(textIn(m, 'data-workspace-file'), m).toContain(
        'A Shareable file holds amounts only as this mode shows them',
      )
  })

  it('folds no bridge step with the switch on (SA-4)', () => {
    for (const m of MODES)
      expect(textIn(m, 'privacy-small-groups').includes('no step folds'), m).toBe(ACCESS[m].can('pay:switch'))
  })

  it('keeps release notes to what each mode shows (HL-10)', () => {
    const notes = (m: Mode) => releaseNotesIn(ACCESS[m]).flatMap((n) => [n.title, ...n.items])
    const manager = notes('manager').join('\n')
    expect(manager).not.toContain('scenario levers')
    expect(manager).not.toContain('costed people')
    expect(manager).not.toContain('Suppressed and Why')
    expect(manager).toContain('Manager mode works in heads and shows no amounts')
    const finance = notes('finance').join('\n')
    expect(finance).not.toContain('Raise requests')
    expect(finance).not.toContain('raising a request')
    expect(finance).toContain('Requests of nine types')
    expect(notes('hrbp').join('\n')).toContain('scenario levers for heads, cost and the gap')
    for (const m of MODES) {
      for (const s of notes(m)) {
        expect(namesHidden(ACCESS[m], 'whats-new', s), `${m}: ${s}`).toEqual([])
        expect(amountsIn(s), `${m}: ${s}`).toEqual([])
      }
      // Every note keeps an item in every mode, and each item's condition is a real one.
      for (const n of releaseNotesIn(ACCESS[m])) expect(n.items.length, `${m} ${n.title}`).toBeGreaterThan(0)
    }
    // Outside a mode only the items every mode reads, and every conditioned item shows somewhere.
    const all = RELEASE_NOTES.flatMap((n) => n.items)
    expect(new Set(all).size).toBe(all.length)
    const bare = releaseNotesIn(null).flatMap((n) => n.items)
    for (const t of all) {
      expect(bare.includes(t), t).toBe(!releaseItemWhen(t))
      expect(
        MODES.some((m) => notes(m).includes(t)),
        t,
      ).toBe(true)
    }
  })
})

describe('fix step, loose ends: privacy-small-groups on the component control totals and forecast accuracy', () => {
  it('says each split in the control totals is one the screen shows, the band part apart', () => {
    for (const m of MODES) {
      if (!articleShown(ACCESS[m], 'privacy-small-groups')) continue
      const t = textIn(m, 'privacy-small-groups')
      const exact = ACCESS[m].can('cost:monthly') && ACCESS[m].can('tab:finance.export')
      expect(t.includes('with Open and Planned at band estimate apart'), m).toBe(exact)
      expect(t.includes('Finance > Export lists them as "Control totals by component"'), m).toBe(exact)
    }
    expect(textIn('finance', 'privacy-small-groups')).toContain(
      'Each split in the control totals is one the screen’s calculation card shows',
    )
  })

  it('says forecast accuracy (cost) is a ratio of company totals, shown for the whole company only', () => {
    for (const m of MODES) {
      if (!articleShown(ACCESS[m], 'privacy-small-groups')) continue
      expect(
        textIn(m, 'privacy-small-groups').includes(
          'Forecast accuracy (cost) divides one company total by another',
        ),
        m,
      ).toBe(ACCESS[m].can('metric:forecast.accuracy.cost') && ACCESS[m].can('cost:monthly'))
    }
    expect(textIn('finance', 'privacy-small-groups')).toContain('so it shows for the whole company only')
  })
})
