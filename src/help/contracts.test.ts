/**
 * The M4 freeze's own checks (docs/CONTRACTS-M4.md section 6): every help article and tour id of
 * PLAN 14.2 is registered once, in its group and order; every mode's table decides each one as
 * src/access/ids.ts `HELP_GRID` says, with a plain sentence on every limited or hidden decision;
 * `about-server` shows in every mode and each mode's first tour shows in it; the shared conditions
 * pick the modes their comments name; the built ports (conditions, wording, sections, links, the
 * names check) behave as the template app's; "Learn more" covers every metric with a registered
 * article. The content tests (wording, links, targets, steps) are the builders'.
 */
import { describe, expect, it } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { BANNED_HASH_WORDS, BANNED_MODE_WORDS, BANNED_WORDS_EXEMPT } from '@/access/copy'
import { HELP_ARTICLE_IDS, HELP_GRID, HELP_TOUR_IDS } from '@/access/ids'
import { HOME_OF, MODES, type Mode } from '@/access/modes'
import { decide } from '@/access/policy'
import { VIEW_KEYS } from '@/data/schema'
import { METRICS } from '@/metrics/catalog'
import {
  articleShown,
  blocksInMode,
  holds,
  homeTourOf,
  linkShown,
  stepWording,
  tourInMode,
  tourShown,
} from './access'
import { ARTICLES, articleById, articleForRoute } from './articles'
import * as WHEN from './articles/when'
import { copyProblems, sentenceCaseProblem } from './check'
import { articleForMetric, LEARN_MORE_ARTICLES } from './learnMore'
import { linksIn, parseInline, plainText } from './markup'
import { HELP_NAMES, namesHidden } from './names'
import { TOURS, tourById, tourForRoute } from './tours'
import { type Block, HELP_GROUPS, type TourStep } from './types'

const ACCESS = Object.fromEntries(MODES.map((m) => [m, accessFor(m)])) as Record<Mode, AccessContext>
const LETTER = { shown: 'S', limited: 'L', hidden: 'H' } as const

describe('every help id is registered once', () => {
  it('holds one article per id of HELP_ARTICLE_IDS, in Help sheet order, groups in order', () => {
    expect(ARTICLES.map((a) => a.id)).toEqual([...HELP_ARTICLE_IDS])
    const groups = HELP_GROUPS.map((g) => g.key)
    const order = ARTICLES.map((a) => groups.indexOf(a.group))
    expect(order.every((g) => g >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    for (const g of groups)
      expect(
        ARTICLES.some((a) => a.group === g),
        g,
      ).toBe(true)
  })

  it('holds one tour per id of HELP_TOUR_IDS', () => {
    expect(TOURS.map((t) => t.id)).toEqual([...HELP_TOUR_IDS])
    for (const id of HELP_TOUR_IDS) expect(tourById(id)?.id).toBe(id)
  })

  it('gives every view its article and tour, reached from its page, and the pages theirs', () => {
    for (const v of VIEW_KEYS) {
      expect(articleForRoute(v)?.id, v).toBe(`view-${v}`)
      expect(tourForRoute(v)?.id, v).toBe(`view-${v}`)
      expect(articleById(`view-${v}`)?.tour, v).toBe(`view-${v}`)
    }
    expect(articleForRoute('data')?.id).toBe('view-data')
    expect(articleForRoute('data', 'quality')?.id).toBe('data-quality')
    expect(articleForRoute('data', 'metrics/plan.heads.approved')?.id).toBe('definitions-how')
    expect(articleForRoute('data', 'workspace')?.id).toBe('data-workspace-file')
    expect(articleForRoute('actions')?.id).toBe('view-actions')
    expect(articleForRoute('audit')?.id).toBe('view-audit')
    expect(tourForRoute('data')?.id).toBe('own-data')
    expect(tourById('home-start')?.route).toBeUndefined()
    expect(articleById('glossary')?.generated).toBe('glossary')
    expect(articleById('whats-new')?.generated).toBe('whats-new')
  })
})

describe('help decisions (src/access/policy/help.ts)', () => {
  it('decide every article and tour in every mode as HELP_GRID says', () => {
    const ids = [
      ...HELP_ARTICLE_IDS.map((id) => `help:article:${id}`),
      ...HELP_TOUR_IDS.map((id) => `help:tour:${id}`),
    ]
    expect(Object.keys(HELP_GRID)).toEqual(ids)
    const wrong: string[] = []
    for (const [id, letters] of Object.entries(HELP_GRID)) {
      const got = MODES.map((m) => LETTER[decide(m, id).access]).join('')
      if (got !== letters) wrong.push(`${id}: grid ${letters}, tables ${got}`)
    }
    expect(wrong).toEqual([])
  })

  it('give every limited or hidden decision one plain sentence', () => {
    for (const id of Object.keys(HELP_GRID))
      for (const m of MODES) {
        const d = decide(m, id)
        if (d.access === 'shown') continue
        expect(d.how, `${id} ${m}`).toMatch(/^["'A-Z].*[.)"]$/)
        const lower = (d.how ?? '').toLowerCase()
        for (const w of [...BANNED_MODE_WORDS, ...BANNED_HASH_WORDS])
          expect(lower.includes(w), `${id} ${m} ${w}`).toBe(false)
        expect(d.how, `${id} ${m}`).not.toMatch(/\w\s*—\s*\w|!/)
      }
  })

  it('show about-server in every mode, and only it is exempt from the banned words', () => {
    expect(BANNED_WORDS_EXEMPT.articles).toEqual(['about-server'])
    for (const m of MODES) expect(articleShown(ACCESS[m], 'about-server'), m).toBe(true)
  })

  it('follow each view with its article, and show each mode its own first tour', () => {
    for (const m of MODES) {
      for (const v of VIEW_KEYS)
        expect(articleShown(ACCESS[m], `view-${v}`), `${m} ${v}`).toBe(
          decide(m, `view:${v}`).access !== 'hidden',
        )
      expect(homeTourOf(m), m).toBe(HOME_OF[m] === 'data' ? 'getting-started' : 'home-start')
      expect(tourShown(ACCESS[m], homeTourOf(m)), m).toBe(true)
    }
    // No leave article where leave never shows (16.1), no pay rules or cost definition in Manager mode.
    expect(articleShown(ACCESS.manager, 'privacy-leave')).toBe(false)
    expect(articleShown(ACCESS.finance, 'privacy-leave')).toBe(false)
    expect(articleShown(ACCESS.manager, 'privacy-pay')).toBe(false)
    expect(articleShown(ACCESS.manager, 'cost-definition')).toBe(false)
  })
})

describe('the shared conditions (articles/when.ts)', () => {
  const picks = (c: (typeof WHEN)[keyof typeof WHEN]) => MODES.filter((m) => holds(ACCESS[m], c))
  it('pick the modes their comments name', () => {
    expect(picks(WHEN.MANAGER)).toEqual(['manager'])
    expect(picks(WHEN.HRBP)).toEqual(['hrbp'])
    expect(picks(WHEN.LEADER)).toEqual(['leader'])
    expect(picks(WHEN.FINANCE)).toEqual(['finance'])
    expect(picks(WHEN.HR_ADMIN)).toEqual(['hr-admin'])
    expect(picks(WHEN.ROLE_HOME)).toEqual(['hrbp', 'leader', 'finance'])
    expect(picks(WHEN.NO_DATA_ROOM)).toEqual(['manager', 'hrbp', 'leader', 'finance'])
    expect(picks(WHEN.AMOUNTS)).toEqual(['hrbp', 'leader', 'finance', 'hr-admin'])
    expect(picks(WHEN.NO_AMOUNTS)).toEqual(['manager'])
    expect(picks(WHEN.ROUNDED)).toEqual(['hrbp', 'leader'])
    expect(picks(WHEN.EXACT)).toEqual(['finance', 'hr-admin'])
    expect(picks(WHEN.PAY_SWITCH)).toEqual(['hr-admin'])
    expect(picks(WHEN.LEAVE_COUNTS)).toEqual(['hrbp', 'leader', 'hr-admin'])
    expect(picks(WHEN.NO_LEAVE)).toEqual(['manager', 'finance'])
    expect(picks(WHEN.RAISES_REQUESTS)).toEqual(['manager', 'hrbp', 'leader', 'hr-admin'])
    expect(picks(WHEN.QUEUE)).toEqual(['hrbp', 'leader', 'finance', 'hr-admin'])
    expect(picks(WHEN.IMPORTS_REQUESTS)).toEqual(['hrbp', 'leader', 'finance', 'hr-admin'])
    expect(picks(WHEN.FOR_MANAGER)).toEqual(['hrbp', 'leader', 'hr-admin'])
    expect(picks(WHEN.WORKSPACE_IMPORT)).toEqual(['hr-admin'])
    expect(picks(WHEN.WHAT_IF)).toEqual(['hrbp', 'leader', 'finance', 'hr-admin'])
    expect(picks(WHEN.FORECAST)).toEqual(['hrbp', 'leader', 'finance', 'hr-admin'])
    expect(picks(WHEN.FINANCE_VIEW)).toEqual(['hrbp', 'finance', 'hr-admin'])
    expect(picks(WHEN.LOAD_FILE)).toEqual(['finance', 'hr-admin'])
    expect(picks(WHEN.AUDIT)).toEqual(['hrbp', 'leader', 'finance', 'hr-admin'])
    expect(picks(WHEN.SEAT_EDITS)).toEqual(['hrbp', 'hr-admin'])
    expect(picks(WHEN.RUNS_CYCLE)).toEqual(['finance', 'hr-admin'])
    // SCOPED needs a held scope; an access that says nothing of its scope counts as holding it.
    expect(holds({ mode: 'manager', can: (s) => s !== 'ui:kpi-delta-company' }, WHEN.SCOPED)).toBe(true)
    expect(
      holds({ mode: 'leader', can: (s) => s !== 'ui:kpi-delta-company', scope: null }, WHEN.SCOPED),
    ).toBe(false)
    expect(holds(ACCESS.finance, WHEN.SCOPED)).toBe(false)
  })
})

describe('the built ports', () => {
  const access = (shown: readonly string[]) => ({
    mode: 'hr-admin' as const,
    can: (s: string) => shown.includes(s),
  })

  it('read a section with its heading, lists side by side as one, and the first wording that applies', () => {
    const body: Block[] = [
      { p: 'a' },
      { ul: ['one'] },
      { ul: ['two'], surface: 'z' },
      { ul: ['three'], unless: 'z' },
      { h: 'Hidden', surface: 'z' },
      { p: 'inside' },
      { h: 'Shown' },
      { ol: ['1'] },
      { ol: ['2'] },
    ]
    expect(blocksInMode(access(['x']), body)).toEqual([
      { p: 'a' },
      { ul: ['one', 'three'] },
      { h: 'Shown' },
      { ol: ['1', '2'] },
    ])
    const step: TourStep = {
      title: 'T',
      body: 'B',
      view: 'home',
      target: '[data-tour="a"]',
      wording: [{ surface: 'view:team', body: 'On My team', view: 'team' }],
    }
    expect(stepWording(access(['view:team']), step)).toEqual({
      title: 'T',
      body: 'On My team',
      view: 'team',
      tab: '',
      target: '[data-tour="a"]',
    })
    expect(stepWording(access([]), step)).toEqual({
      title: 'T',
      body: 'B',
      view: 'home',
      target: '[data-tour="a"]',
    })
  })

  it('parse links, keep unknown kinds as text, and read a hidden route as text', () => {
    expect(parseInline('See [Plan](route:plan.openings).')).toEqual([
      { text: 'See ' },
      { link: { kind: 'route', target: 'plan.openings', label: 'Plan' } },
      { text: '.' },
    ])
    expect(plainText('A [b](tour:x) c')).toBe('A b c')
    expect(linksIn('[x](mailto:a)')).toEqual([])
    const forecast = { kind: 'route' as const, target: 'forecast.bridge', label: 'Forecast' }
    expect(linkShown(ACCESS.manager, forecast)).toBe(false)
    expect(linkShown(ACCESS.finance, forecast)).toBe(true)
    expect(tourInMode(ACCESS.finance, tourById('getting-started'))).toBeNull()
  })

  it('find a name a mode hides, and none where it shows', () => {
    expect(HELP_NAMES.length).toBeGreaterThan(40)
    expect(namesHidden(ACCESS.manager, 'x', 'Open Forecast > Bridge.')).toHaveLength(2)
    expect(namesHidden(ACCESS['hr-admin'], 'x', 'Open Forecast > Bridge.')).toEqual([])
    expect(namesHidden(ACCESS.manager, 'x', 'Manager mode shows no band estimate.')).toEqual([
      'manager | x | band estimate',
    ])
    expect(namesHidden(ACCESS.leader, 'x', 'In Finance mode, Finance > Export holds the load file.')).toEqual(
      ['leader | x | Finance >', 'leader | x | Finance > Export', 'leader | x | load file'],
    )
    expect(namesHidden(ACCESS.leader, 'modes', 'Finance > Export')).toEqual([])
  })
})

describe('"Learn more"', () => {
  it('maps every metric to a registered article', () => {
    for (const id of LEARN_MORE_ARTICLES) expect(articleById(id), id).not.toBeNull()
    expect(METRICS.filter((m) => !articleForMetric(m.id)).map((m) => m.id)).toEqual([])
    expect(articleForMetric('plan.heads.approved')).toBe('view-plan')
    expect(articleForMetric('privacy.leaveCounts')).toBe('privacy-leave')
    expect(articleForMetric('requests.trade.ratio')).toBe('trading-heads')
    expect(articleForMetric(null)).toBeNull()
  })
})

describe('the built copy checks (check.ts)', () => {
  it('read sentence case and the copy rules as the template app does', () => {
    expect(sentenceCaseProblem('Reading A Number')).not.toBeNull()
    expect(sentenceCaseProblem('Working with Plan > Openings and the Data room')).toBeNull()
    expect(sentenceCaseProblem('What Headcount Planner is')).toBeNull()
    expect(copyProblems('A number shows "—" when hidden')).toEqual([])
    expect(copyProblems('Plan — a view')).toEqual(['em dash between words'])
    expect(copyProblems('Done!')).toEqual(['exclamation mark'])
    expect(copyProblems('Remind your manager')).toEqual(['nagging verb "Remind"'])
    expect(copyProblems('Modes are not secure')).toEqual(['banned word "secure"'])
    expect(copyProblems('Modes are not secure', { exempt: true })).toEqual([])
    expect(copyProblems('Checksums are tamper-proof', { exempt: true })).toEqual([
      'banned word "tamper-proof"',
    ])
  })

  it('pass every working title the freeze registered', () => {
    const titles = [
      ...ARTICLES.map((a) => a.title),
      ...TOURS.map((t) => t.title),
      ...HELP_GROUPS.map((g) => g.label),
    ]
    expect(titles.map((t) => [t, sentenceCaseProblem(t)]).filter(([, p]) => p)).toEqual([])
    expect(titles.flatMap((t) => copyProblems(t))).toEqual([])
  })
})
