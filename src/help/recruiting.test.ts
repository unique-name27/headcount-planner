/**
 * Help for Plan > Recruiting summary, in every mode (docs/PLAN.md 9.8 "Help" and "Words", change C38;
 * 14.2, 14.3):
 *  - `view-plan` carries the Recruiting summary section right after Hiring and before Transfers, and
 *    every mode reads it (the deck line where the deck export shows, Manager mode's scope note in
 *    Manager mode only);
 *  - the section names each of the tab's seven numbers by its tile label, keeps future starts (signed
 *    offers) and projected starts (the model) apart in its own words, and names the chart, the quarter
 *    table and where hiring happened as the tab titles them, and the one-slide deck;
 *  - the glossary holds Projected starts, Projected heads and Gap to approved heads in every mode as
 *    the catalog words them, and a search for projected attrition finds Plan > Hiring's expected
 *    exits, the tab's projected attrition;
 *  - "Learn more" on every tile and metric of the tab opens `view-plan` in every mode;
 *  - the `view-plan` tour stays at its 6 steps in every mode, so the tab gets no step and the section
 *    names it; Plan > Recruiting summary is a name the names scan knows;
 *  - What's new tells every mode about the tab (27 Oct 2026);
 *  - the words keep the copy rules: heads only (no amount and no leave word, which Manager and Finance
 *    mode never read), plain counts, sentence case.
 * Every scan has a control that would fail it, so none is vacuous.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { BANNED_MODE_WORDS } from '@/access/copy'
import { RECRUITING_AT } from '@/access/ids'
import { MODES, type Mode } from '@/access/modes'
import { routeShown } from '@/access/policy'
import { ABOUT_SLIDE_TITLE } from '@/lib/export/exportHeader'
import { defaultMetrics } from '@/metrics/api'
import { METRICS } from '@/metrics/catalog'
import { amountsIn } from '@/testkit/leaks'
import { sampleCtx } from '@/testkit/sample'
import {
  FUTURE_STARTS_NOTE,
  KNOWN_EXITS_ONLY_NOTE,
  NO_FORECAST_NOTE,
  type PlanRecruiting,
  PROJECTED_STARTS_NOTE,
  planRecruitingModel,
  RECRUITING_KPIS,
} from '@/views/plan/engine/recruitingTab'
import { ID, RECRUITING_METRIC_IDS } from '@/views/plan/metrics'
import {
  articleInMode,
  articleShown,
  articlesInMode,
  formulaRowShown,
  glossaryInMode,
  type HelpAccess,
  learnMoreIn,
  tourInMode,
} from './access'
import { ARTICLES, articleById } from './articles'
import { MANAGER } from './articles/when'
import { articleProblems, copyProblems, sentenceCaseProblem } from './check'
import { buildGlossary } from './glossary'
import { HIRING_SECTION, HIRING_SECTION_TITLE } from './hiring'
import { blockTexts, plainText } from './markup'
import { HELP_NAMES, namesHidden } from './names'
import {
  PROJECTED_ATTRITION,
  RECRUITING_DECK,
  RECRUITING_GLOSSARY,
  RECRUITING_KEYWORDS,
  RECRUITING_SECTION,
  RECRUITING_SECTION_TITLE,
} from './recruiting'
import { buildIndex, search } from './search'
import { tourById } from './tours'
import type { Block, HelpArticle, Tour } from './types'
import { RELEASE_NOTES, releaseItemWhen, releaseNotesIn } from './whatsNew'
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
const headings = (body: readonly Block[]) => body.flatMap((b) => ('h' in b ? [b.h] : []))

/** What a mode reads of an article: title, summary and every shown block, as plain text. */
const shownText = (access: HelpAccess, id: string): string => {
  const a = articleInMode(access, article(id))
  return [a.title, a.summary, ...a.body.flatMap((b) => blockTexts(b))].map(plainText).join('\n')
}

/** The section as a mode reads it: from its heading to the next heading of `view-plan`. */
const sectionIn = (access: HelpAccess): Block[] => {
  const body = articleInMode(access, article('view-plan')).body
  const start = body.findIndex((b) => 'h' in b && b.h === RECRUITING_SECTION_TITLE)
  if (start < 0) return []
  const end = body.findIndex((b, i) => i > start && 'h' in b)
  return body.slice(start, end < 0 ? undefined : end)
}
const sectionText = (access: HelpAccess) =>
  sectionIn(access)
    .flatMap((b) => blockTexts(b))
    .map(plainText)
    .join('\n')

/** The seven numbers' list (the block whose items name the tiles), and the figures' list. */
const numbersList = (): readonly string[] => {
  const b = RECRUITING_SECTION.find((x) => 'ul' in x && x.ul.some((t) => t.startsWith('Approved heads:')))
  return b && 'ul' in b ? b.ul.map(plainText) : []
}
const figuresList = (): readonly string[] => {
  const b = RECRUITING_SECTION.find((x) => 'ul' in x && x.ul.some((t) => t.startsWith('By quarter ahead:')))
  return b && 'ul' in b ? b.ul.map(plainText) : []
}

/** Every string the section, its keywords, glossary and release note add that a person reads. */
const allWords = (): [string, string][] => [
  ...RECRUITING_SECTION.flatMap((b) => blockTexts(b).map((t): [string, string] => ['section', t])),
  ...RECRUITING_KEYWORDS.map((k): [string, string] => ['keyword', k]),
  ...RECRUITING_GLOSSARY.map((g): [string, string] => ['glossary', g.term]),
  ...(RELEASE_NOTES[0]?.items ?? []).map((t): [string, string] => ['whats-new', t]),
  ['article summary', article('view-plan').summary],
  ...(article('view-plan').without ?? []).map((w): [string, string] => ['article without', w.summary]),
]

/** Leave words Manager and Finance mode never read (16.1), and the amount kinds a heads-only tab never names. */
const LEAVE = /\bleav(e|es|ing)\b/i
const AMOUNT_WORDS =
  /\b(cost|costs|costed|salary|salaries|pay|band estimate|offer amount|sign-on|relocation|agency fee|bonus|usd|fx|amount|amounts)\b|[$€£¥₹₪]/i
/** A count with the wrong plural ("1 heads", "3 hire"). */
const BAD_COUNT =
  /\b1 (heads|hires|starts|seats|exits|months|slides)\b|\b([02-9]|\d{2,}) (head|hire|start|seat|exit|month|slide)\b/

describe('the Recruiting summary section of view-plan (9.8 Help)', () => {
  it('sits right after the Hiring section and before Transfers, in the article as written', () => {
    const a = article('view-plan')
    const hs = headings(a.body)
    expect(hs.indexOf(RECRUITING_SECTION_TITLE)).toBe(hs.indexOf(HIRING_SECTION_TITLE) + 1)
    expect(hs.indexOf('Transfers')).toBe(hs.indexOf(RECRUITING_SECTION_TITLE) + 1)
    const start = a.body.indexOf(RECRUITING_SECTION[0])
    expect(start).toBe(a.body.indexOf(HIRING_SECTION[0]) + HIRING_SECTION.length)
    expect(a.body.slice(start, start + RECRUITING_SECTION.length)).toEqual([...RECRUITING_SECTION])
    expect(RECRUITING_SECTION_TITLE).toBe('Recruiting summary')
    for (const k of RECRUITING_KEYWORDS) expect(a.keywords, k).toContain(k)
    expect(a.summary).toContain('a recruiting summary')
    for (const w of a.without ?? []) expect(w.summary, w.surface).toContain('recruiting summary')
  })

  it('is read in every mode after Hiring, every block but the conditioned ones in full', () => {
    const conditioned = RECRUITING_SECTION.filter((b) => 'surface' in b || 'unless' in b)
    expect(conditioned).toHaveLength(2)
    for (const { name, mode, access } of EVERY) {
      expect(articleShown(access, 'view-plan'), name).toBe(true)
      expect(routeShown(mode, RECRUITING_AT.view, RECRUITING_AT.tab), name).toBe(true)
      const hs = headings(articleInMode(access, article('view-plan')).body)
      expect(hs.indexOf(RECRUITING_SECTION_TITLE), name).toBe(hs.indexOf(HIRING_SECTION_TITLE) + 1)
      const text = sectionText(access)
      for (const b of RECRUITING_SECTION)
        if (!conditioned.includes(b))
          for (const t of blockTexts(b)) expect(text, `${name}: ${t}`).toContain(plainText(t))
    }
  })

  it('shows the deck line where the deck export shows, and the scope note in Manager mode only', () => {
    const deck = RECRUITING_SECTION.find((b) => 'surface' in b && b.surface === RECRUITING_DECK)
    const scope = RECRUITING_SECTION.find((b) => 'surface' in b && b.surface === MANAGER.surface)
    if (!deck || !scope) throw new Error('no deck line or scope note')
    const deckLine = plainText(blockTexts(deck)[0])
    const scopeNote = plainText(blockTexts(scope)[0])
    for (const { name, mode, access } of EVERY) {
      const text = sectionText(access)
      expect(text.includes(deckLine), name).toBe(access.can(RECRUITING_DECK))
      expect(access.can(RECRUITING_DECK), name).toBe(true)
      expect(text.includes(scopeNote), name).toBe(mode === 'manager')
    }
    // Not vacuous: a mode that hid the deck export would not read the line.
    const can: HelpAccess['can'] = (s, at, info) => s !== RECRUITING_DECK && BARE.hrbp.can(s, at, info)
    expect(sectionText({ mode: 'hrbp', can }).includes(deckLine)).toBe(false)
  })

  it('names each of the seven numbers by its tile label, in strip order', () => {
    const items = numbersList()
    expect(items).toHaveLength(RECRUITING_KPIS.length)
    expect(items.map((t) => t.slice(0, t.indexOf(':')))).toEqual(RECRUITING_KPIS.map((k) => k.label))
    expect(RECRUITING_KPIS.map((k) => k.label)).toEqual([
      'Approved heads',
      'Current heads',
      'Open to hire',
      'Future starts',
      'Projected starts',
      'Projected attrition',
      'Hiring velocity',
    ])
  })

  it('keeps future starts (signed offers) and projected starts (the model) apart, as the tiles do', () => {
    const items = numbersList()
    const future = items.find((t) => t.startsWith('Future starts:')) ?? ''
    const projected = items.find((t) => t.startsWith('Projected starts:')) ?? ''
    expect(future).toMatch(/signed offer/)
    expect(future).toMatch(/never a model/)
    expect(future).not.toMatch(/projected|forecast|fill rate/i)
    expect(projected).toMatch(/model/)
    expect(projected).toMatch(/no signed offer/)
    expect(projected).toMatch(/fill rate/)
    expect(projected).toMatch(/one decimal/)
    // The model's two readings (hiringData.ts projectedStartsOf): an overdue opening counts in the
    // first month ahead, and a seat an approved move fills has no projected start.
    expect(projected).toContain('An Open seat already past its time to fill counts in the first month ahead')
    expect(projected).toContain('a seat an approved internal move fills has none: the move is its head')
    // The tiles' own notes say the same thing.
    expect(FUTURE_STARTS_NOTE).toMatch(/^Signed offers/)
    expect(PROJECTED_STARTS_NOTE).toMatch(/^Model/)
    const apart = RECRUITING_SECTION.map((b) => blockTexts(b).join(' ')).find((t) =>
      t.startsWith('Future starts and projected starts always show apart'),
    )
    expect(apart).toContain('never count toward open to hire')
    // Open to hire never subtracts a projected start.
    const open = items.find((t) => t.startsWith('Open to hire:')) ?? ''
    expect(open).toContain('future starts')
    expect(open).not.toMatch(/projected/i)
  })

  it('says what shows without a Working forecast, as the tiles word it', () => {
    const apart =
      RECRUITING_SECTION.map((b) => blockTexts(b).join(' ')).find((t) =>
        t.startsWith('Future starts and projected starts always show apart'),
      ) ?? ''
    expect(apart).toContain('need a Working forecast')
    expect(apart).toContain('projected starts and projected heads show no value')
    expect(apart).toContain('projected attrition counts known exits only')
    // The tiles' notes in that case.
    expect(NO_FORECAST_NOTE).toContain('No Working forecast')
    expect(KNOWN_EXITS_ONLY_NOTE.startsWith('Known exits only')).toBe(true)
  })

  it('says projected attrition is Plan > Hiring’s expected exits, with the attrition rate under it', () => {
    const attrition = numbersList().find((t) => t.startsWith('Projected attrition:')) ?? ''
    expect(attrition).toContain('known last days plus modeled exits')
    expect(attrition).toContain('expected exits')
    expect(attrition).toContain('attrition rate')
    const velocity = numbersList().find((t) => t.startsWith('Hiring velocity:')) ?? ''
    expect(velocity).toContain('last 3 closed months')
    expect(velocity).toContain('6-month pace')
  })

  it('names the deck’s one slide after the About these numbers slide, and the workbook keeps every figure', () => {
    const deck = RECRUITING_SECTION.find((b) => 'surface' in b && b.surface === RECRUITING_DECK)
    const text = deck ? plainText(blockTexts(deck)[0]) : ''
    expect(text).toContain('one slide')
    expect(text).toContain(`"${ABOUT_SLIDE_TITLE}"`)
    expect(text).toContain('the seven numbers and the chart')
    expect(text).toContain('workbook keeps every figure')
  })
})

describe('the section names the tab’s figures as the tab titles them', () => {
  let m: PlanRecruiting
  beforeAll(() => {
    m = planRecruitingModel(sampleCtx('hr-admin'))
  }, 120_000)

  it('the chart, the quarter table and where hiring happened, in page order', () => {
    const titles = [m.months.title, m.quarters.title, m.where.title]
    expect(titles).toEqual(['Heads and hiring by month', 'By quarter ahead', 'Where hiring happened'])
    const items = figuresList()
    expect(items.slice(0, 3).map((t) => t.slice(0, t.indexOf(':')))).toEqual(titles)
    expect(items[0]).toContain('dashed line')
    expect(items[0]).toContain('lighter shade')
    expect(items[1]).toContain('"Short by" or "Over by"')
    expect(items[2]).toContain('top 5 locations and the top 5 departments')
  })

  it('says which numbers are this tab’s own, and that the rare terms are drawn too (finish audit AD-3, AF-1)', () => {
    const text = RECRUITING_SECTION.flatMap((b) => blockTexts(b)).join(' ')
    expect(text).toContain(
      'Every number [Plan > Hiring](route:plan.hiring) also shows is counted the same way and opens the same records.',
    )
    expect(text).toContain(
      'Projected starts, projected heads and the gap to approved heads are this tab’s own.',
    )
    expect(text).not.toMatch(/Every number but projected starts/)
    expect(text).toContain('its own shade on the chart')
  })

  it('the seven tiles, by the labels the section uses (a tile may add the fiscal year)', () => {
    const labels = numbersList().map((t) => t.slice(0, t.indexOf(':')))
    expect(m.kpis.map((k) => k.id)).toEqual(RECRUITING_KPIS.map((k) => k.id))
    m.kpis.forEach((k, i) => {
      expect(k.label === labels[i] || k.label.startsWith(`${labels[i]}, `), `${k.id}: ${k.label}`).toBe(true)
    })
  })
})

describe('the glossary and Settings > Formulas (9.8, 14.2)', () => {
  const glossary = buildGlossary(METRICS)

  it('holds the tab’s three metrics in every mode, as the catalog words them, under Plan', () => {
    expect(RECRUITING_GLOSSARY.map((g) => g.metricId)).toEqual([...RECRUITING_METRIC_IDS])
    expect(RECRUITING_GLOSSARY.map((g) => g.term)).toEqual([
      'Projected starts',
      'Projected heads',
      'Gap to approved heads',
    ])
    for (const { name, access } of EVERY) {
      const shown = glossaryInMode(access, glossary)
      for (const g of RECRUITING_GLOSSARY) {
        const entry = shown.find((e) => e.id === g.metricId)
        const own = glossary.find((e) => e.id === g.metricId)
        expect(entry?.term, `${name} ${g.term}`).toBe(g.term)
        expect(entry?.definition, `${name} ${g.term}`).toBe(own?.definition)
        expect(entry?.where, `${name} ${g.term}`).toBe('Plan')
        expect(METRICS.find((d) => d.id === g.metricId)?.name, g.term).toBe(g.term)
      }
    }
  })

  it('lists the three metrics in every mode’s Settings > Formulas', () => {
    for (const { name, access } of EVERY)
      for (const id of RECRUITING_METRIC_IDS) {
        const d = METRICS.find((x) => x.id === id)
        const texts = [d?.name ?? null, d?.definition ?? null, d?.formula ?? null, d?.population ?? null]
        expect(formulaRowShown(access, id, texts), `${name} ${id}`).toBe(true)
      }
  })

  it('finds projected attrition, Plan > Hiring’s expected exits, and projected starts in every mode’s search', () => {
    expect(PROJECTED_ATTRITION).toEqual({ term: 'Projected attrition', metricId: ID.hiringExpectedExits })
    const exits = glossary.find((e) => e.id === ID.hiringExpectedExits)
    expect(exits?.term).toBe('Expected exits by quarter end')
    expect(exits?.definition).toContain('Plan > Recruiting summary shows them as projected attrition')
    for (const { name, access } of EVERY) {
      const index = buildIndex(articlesInMode(access, ARTICLES), glossaryInMode(access, glossary))
      const attrition = search(index, 'projected attrition', { terms: Infinity, articles: Infinity })
      expect(
        attrition.terms.map((t) => t.entry.id),
        name,
      ).toContain(ID.hiringExpectedExits)
      expect(
        attrition.articles.map((a) => a.article.id),
        name,
      ).toContain('view-plan')
      const starts = search(index, 'projected starts')
      expect(starts.terms[0]?.entry.id, name).toBe(ID.recruitingProjectedStarts)
      expect(
        search(index, 'recruiting summary').articles.map((a) => a.article.id),
        name,
      ).toContain('view-plan')
    }
    // Not vacuous: a word no entry uses finds nothing.
    const index = buildIndex(articlesInMode(BARE.manager, ARTICLES), glossaryInMode(BARE.manager, glossary))
    expect(search(index, 'zyxwv').terms).toEqual([])
  })
})

describe('Learn more on a recruiting tile (14.2)', () => {
  it('opens view-plan in every mode, from every tile and metric of the tab', () => {
    for (const { name, access } of EVERY) {
      for (const id of RECRUITING_METRIC_IDS)
        expect(learnMoreIn(access, id), `${name} ${id}`).toBe('view-plan')
      for (const k of RECRUITING_KPIS)
        expect(learnMoreIn(access, k.metricId), `${name} ${k.id}`).toBe('view-plan')
      expect(headings(articleInMode(access, article('view-plan')).body), name).toContain(
        RECRUITING_SECTION_TITLE,
      )
    }
    // Not vacuous: a metric no article covers has no Learn more.
    expect(learnMoreIn(BARE.manager, 'nowhere.metric')).toBeNull()
  })
})

describe('the view-plan tour and the names (9.8 Help, 14.2)', () => {
  it('keeps view-plan’s tour at its 6 steps in every mode, so the tab gets no step and the section names it', () => {
    const t = planTour()
    // 14.2 allows 4 to 6 steps, and the tour is at 6: a step on the tab would make 7.
    expect(t.steps).toHaveLength(6)
    expect(t.steps.filter((s) => s.tab === RECRUITING_AT.tab)).toEqual([])
    for (const { name, access } of EVERY) {
      const run = tourInMode(access, t)
      expect(run?.steps.length ?? 0, name).toBeGreaterThanOrEqual(4)
      expect(run?.steps.length ?? 0, name).toBeLessThanOrEqual(6)
      expect(
        run?.steps.some((s) => s.tab === RECRUITING_AT.tab),
        name,
      ).toBe(false)
    }
    expect(article('view-plan').keywords).toContain('recruiting summary')
  })

  it('knows Plan > Recruiting summary as a name, and nothing in view-plan names what a mode hides', () => {
    expect(HELP_NAMES).toContainEqual({ phrase: 'Plan > Recruiting summary', surface: 'tab:plan.recruiting' })
    const found: string[] = []
    for (const { name, access } of EVERY) {
      found.push(
        ...namesHidden(access, 'view-plan', shownText(access, 'view-plan')).map((x) => `${name}: ${x}`),
      )
      for (const n of releaseNotesIn(access))
        for (const s of [n.title, ...n.items]) found.push(...namesHidden(access, 'whats-new', s))
    }
    expect(found).toEqual([])
    // Not vacuous: a mode that hid the tab would be told about it by the release note.
    const can: HelpAccess['can'] = (s, at, info) =>
      s !== 'tab:plan.recruiting' && BARE.finance.can(s, at, info)
    expect(namesHidden({ mode: 'finance', can }, 'whats-new', RELEASE_NOTES[0].items[0]).length).toBe(1)
  })

  it('passes articleProblems', () => {
    expect(articleProblems(article('view-plan'), HELP_WORLD)).toEqual([])
  })
})

describe('What’s new (the recruiting summary note)', () => {
  it('is the newest note, dated 27 Oct 2026, and every mode reads its five tab items', () => {
    const note = RELEASE_NOTES[0]
    expect(note.date).toBe('2026-10-27')
    expect(note.title).toBe('Recruiting summary')
    expect(note.items).toHaveLength(6)
    expect(note.items[0].startsWith('Plan > Recruiting summary')).toBe(true)
    const tab = note.items.slice(0, 5)
    for (const t of tab) expect(releaseItemWhen(t), t).toBeUndefined()
    // The sixth is the Forecast view's overdue openings (heads.ts forecastFlows): only where it shows.
    const forecast = note.items[5]
    expect(releaseItemWhen(forecast)).toEqual({ surface: 'view:forecast' })
    expect(forecast).toContain('past its time to fill')
    expect(forecast).toContain('first month ahead')
    const read = new Set<boolean>()
    for (const { name, access } of EVERY) {
      const shown = access.can('view:forecast')
      read.add(shown)
      expect(releaseNotesIn(access).find((n) => n.title === note.title)?.items, name).toEqual(
        shown ? note.items : tab,
      )
    }
    // Not vacuous: some mode shows the Forecast view and some mode does not.
    expect([...read].sort()).toEqual([false, true])
  })

  it('keeps future starts and projected starts apart, and names the one-slide deck and the glossary terms', () => {
    const text = RELEASE_NOTES[0].items.join('\n')
    expect(text).toContain('Future starts are signed offers; projected starts are the forecast’s model')
    expect(text).toContain('The two always show apart')
    expect(text).toContain(`one slide after "${ABOUT_SLIDE_TITLE}"`)
    for (const g of RECRUITING_GLOSSARY) expect(text, g.term).toContain(g.term)
    for (const k of RECRUITING_KPIS) expect(text.toLowerCase(), k.label).toContain(k.label.toLowerCase())
  })
})

describe('the copy (14.3): heads only, plain counts, sentence case', () => {
  it('keeps every rule in every string the tab’s help adds', () => {
    const all = allWords()
    expect(all.length).toBeGreaterThan(30)
    for (const [where, text] of all) {
      expect(copyProblems(text), `${where}: ${text}`).toEqual([])
      expect(amountsIn(text), `${where}: ${text}`).toEqual([])
      expect(text, where).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(text, where).not.toMatch(BAD_COUNT)
      expect(text.match(AMOUNT_WORDS)?.[0] ?? null, `${where}: ${text}`).toBeNull()
      expect(text, where).not.toMatch(LEAVE)
      expect(text.toLowerCase(), where).not.toContain('headcount to hire')
      for (const w of BANNED_MODE_WORDS) expect(text.toLowerCase().includes(w), `${where}: ${w}`).toBe(false)
    }
    // Not vacuous: each scan finds what it bans.
    expect('Open to hire, $1.2M'.match(AMOUNT_WORDS)?.[0]).toBe('$')
    expect('No offer amount shows').toMatch(AMOUNT_WORDS)
    expect('People on leave stay in current heads').toMatch(LEAVE)
    expect('1 heads').toMatch(BAD_COUNT)
    expect('3 hire a month').toMatch(BAD_COUNT)
    expect('1 head, 2 hires').not.toMatch(BAD_COUNT)
  })

  it('holds no amount and no leave word in what any mode reads of the section, Manager and Finance included', () => {
    for (const { name, access } of EVERY) {
      const text = sectionText(access)
      expect(text.length, name).toBeGreaterThan(200)
      expect(amountsIn(text), name).toEqual([])
      expect(text, name).not.toMatch(LEAVE)
    }
  })

  it('writes the heading, the glossary terms and the tile labels in sentence case', () => {
    for (const l of [
      RECRUITING_SECTION_TITLE,
      RELEASE_NOTES[0].title,
      ...RECRUITING_GLOSSARY.map((g) => g.term),
      ...RECRUITING_KPIS.map((k) => k.label),
      PROJECTED_ATTRITION.term,
    ])
      expect(sentenceCaseProblem(l), l).toBeNull()
  })
})

describe('the words the fix review set (27 Oct 2026)', () => {
  const text = RECRUITING_SECTION.flatMap((b) => blockTexts(b))
    .map(plainText)
    .join('\n')

  it('names the rate under projected attrition as Plan > Hiring does, over 12 closed months (review RU-4)', () => {
    expect(text).toContain('with the attrition rate (heads) over the last 12 closed months under it')
    expect(text).not.toMatch(/attrition rate a year/)
  })

  it('calls expected exits projected attrition, never projected exits (reviews RU-12, RS-5)', () => {
    expect(text).not.toMatch(/projected exits?/i)
    for (const n of RELEASE_NOTES.filter((x) => x.title === 'Recruiting summary'))
      for (const item of n.items) expect(item, item).not.toMatch(/projected exits?/i)
  })

  it('names the chart’s moves in, the months ended since the close, the dated approved line and the axes (reviews RS-2, RN-1, RU-3, RU-2)', () => {
    for (const words of [
      'its moves in on them in a shade of their own',
      'any month that has ended since without being closed',
      'Approved heads by the fiscal year end are a dotted line across the chart, dated in the key',
      'The left axis reads hires and exits a month, the right axis heads',
      'The month that holds the as-of date also shows its actual hires and exits so far',
    ])
      expect(text, words).toContain(words)
  })

  it('names the rare terms of projected heads, never as future starts (reviews RN-2, RN-3, RN-4)', () => {
    expect(text).toContain(
      'a signed offer whose start date has passed but that the HRIS has not recorded yet',
    )
    expect(text).toContain('a hire the HRIS already holds for a later date with no signed offer on the seat')
    expect(text).toContain('less the people whose last day is the as-of date')
    expect(text).toContain('never as a future start')
  })
})
