/**
 * Help search (the template app's help/search.test.ts): words, the ranking rules on made-up entries,
 * and, on the real articles and the metric glossary, that every article's title and every metric's
 * name find it, and that the sheet's index of a mode holds nothing the mode hides.
 */
import { describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { MODES } from '@/access/modes'
import { METRICS } from '@/metrics/catalog'
import { articleShown, glossaryInMode } from './access'
import { ARTICLES } from './articles'
import { buildGlossary, type GlossaryEntry } from './glossary'
import { buildIndex, RESULT_LIMIT, search, words } from './search'
import { sheetIndex } from './sheet'
import type { HelpArticle } from './types'

const article = (id: string, title: string, summary: string, body: string[] = [], keywords?: string[]) =>
  ({
    id,
    group: 'start',
    title,
    summary,
    body: body.map((p) => ({ p })),
    ...(keywords ? { keywords } : {}),
  }) as HelpArticle

const entry = (id: string, term: string, definition: string, where = 'Plan'): GlossaryEntry => ({
  id,
  term,
  definition,
  where,
  view: 'plan',
})

/** Made-up articles and terms, so the ranking rules are tested apart from what the writers write. */
const MADE_UP = buildIndex(
  [
    article('certify', 'Certifying a dataset', 'Mark a dataset as checked.', [
      'Control totals are compared with the source. The owner signs it off.',
    ]),
    article('versions', 'Versions, locks and closes', 'Budget, Working and the plan of record.', [
      'Q1 Reforecast is a version. A lock keeps it.',
    ]),
    article('trading', 'Trading heads', 'Give seats to get one.', ['A standard head is the unit.'], ['swap']),
    article('reading', 'Reading a number', 'Heads, FTE and loaded cost.', ['1 seat can hold 0.5 FTE.']),
  ],
  [
    entry('a', 'Approved heads', 'Seats approved for the fiscal year.'),
    entry('b', 'Approved heads vs target', 'Approved heads against the target.'),
    entry('c', 'Open seats', 'Approved seats not yet filled.'),
    ...Array.from({ length: 12 }, (_, i) => entry(`s${i}`, `Seat count ${i + 1}`, 'Seats in a group.')),
  ],
)
const madeUp = (q: string) => search(MADE_UP, q).articles.map((h) => h.article.id)

describe('words', () => {
  it('lowercases, drops accents and splits on punctuation', () => {
    expect(words('Sub-org targets, FY27 Café')).toEqual(['sub', 'org', 'targets', 'fy27', 'cafe'])
    expect(words('Tree × cost center')).toEqual(['tree', 'cost', 'center'])
    expect(words('  ')).toEqual([])
  })
})

describe('the ranking rules', () => {
  it('matches the start of words, and one character only as a whole word', () => {
    expect(madeUp('certif')).toEqual(['certify'])
    expect(madeUp('q1')).toEqual(['versions'])
    // "1" alone is a whole word ("1 seat"), not the start of every number.
    expect(madeUp('1')).toEqual(['reading'])
    expect(madeUp('s')).toEqual([])
  })

  it('counts titles first, then keywords and summaries, then the body', () => {
    expect(madeUp('swap')).toEqual(['trading'])
    expect(madeUp('dataset')[0]).toBe('certify')
    const scores = search(MADE_UP, 'heads').articles
    expect(scores.map((h) => h.article.id)).toEqual(['trading', 'reading'])
  })

  it('needs every word to match somewhere, and finds nothing for an empty query', () => {
    expect(madeUp('certify zebra')).toEqual([])
    expect(madeUp('zzzz')).toEqual([])
    expect(search(MADE_UP, '').articles).toEqual([])
    expect(search(MADE_UP, '!!').terms).toEqual([])
    expect(search(MADE_UP, '').totals).toEqual({ articles: 0, terms: 0 })
  })

  it('puts a title that is the query, or starts with it, before one that only contains it', () => {
    expect(search(MADE_UP, 'approved heads').terms.map((h) => h.entry.id)).toEqual(['a', 'b'])
    expect(search(MADE_UP, 'open seats').terms[0].entry.id).toBe('c')
  })

  it('shows 8 of each kind but counts every match, and shows all on request', () => {
    const capped = search(MADE_UP, 'seats')
    expect(capped.terms).toHaveLength(RESULT_LIMIT)
    expect(capped.totals.terms).toBe(14)
    const all = search(MADE_UP, 'seats', { articles: Infinity, terms: Infinity })
    expect(all.terms).toHaveLength(14)
    expect(all.terms.slice(0, RESULT_LIMIT)).toEqual(capped.terms)
  })

  it('gives a snippet from the sentence that holds the query, else the summary', () => {
    expect(search(MADE_UP, 'control totals').articles[0].snippet).toBe(
      'Control totals are compared with the source.',
    )
    expect(search(MADE_UP, 'certifying').articles[0].snippet).toBe('Mark a dataset as checked.')
  })
})

describe('the real articles and glossary', () => {
  const index = buildIndex(ARTICLES, buildGlossary(METRICS))

  it('finds each article first by its own title', () => {
    const titles = ARTICLES.map((a) => a.title.toLowerCase())
    for (const a of ARTICLES) {
      if (titles.filter((t) => t === a.title.toLowerCase()).length > 1) continue
      expect(search(index, a.title).articles[0]?.article.id, a.title).toBe(a.id)
    }
  })

  it('finds every metric by its name, and a name the query is comes first', () => {
    for (const m of METRICS) {
      const found = search(index, m.name, { terms: Infinity }).terms
      expect(
        found.some((h) => h.entry.id === m.id),
        m.id,
      ).toBe(true)
      expect(found[0].entry.term.toLowerCase(), m.id).toBe(m.name.toLowerCase())
    }
  })

  it("holds in each mode's index only the articles and metrics the mode shows", () => {
    for (const mode of MODES) {
      const access = accessFor(mode)
      const shown = sheetIndex(access, METRICS)
      for (const d of shown.articles)
        expect(articleShown(access, d.article.id), `${mode} ${d.article.id}`).toBe(true)
      const terms = new Set(glossaryInMode(access, buildGlossary(METRICS)).map((e) => e.id))
      for (const t of shown.terms) expect(terms.has(t.entry.id), `${mode} ${t.entry.id}`).toBe(true)
      // A hidden article is never a result, even searched by its own title.
      for (const a of ARTICLES)
        if (!articleShown(access, a.id))
          expect(
            search(shown, a.title, { articles: Infinity }).articles.some((h) => h.article.id === a.id),
            `${mode} ${a.id}`,
          ).toBe(false)
    }
    // Not vacuous: Manager mode hides the Data room's articles and some metrics.
    const manager = sheetIndex(accessFor('manager'), METRICS)
    expect(manager.articles.length).toBeLessThan(ARTICLES.length)
    expect(manager.terms.length).toBeLessThan(METRICS.length)
  })
})
