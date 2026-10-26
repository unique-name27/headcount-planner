/**
 * The plain-count scan (./counts.ts; docs/PLAN.md 14.3, R86; M4 review CP-5): a count of 1 with a
 * plural noun is a slip; decimals, grouped numbers, IDs, codes and ratios are not counts of 1.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { countHits, countTemplates, PLURAL_COUNT_NOUNS, pluralSlips, singularCounts } from './counts'
import type { Seen } from './crawl'

const seen = (value: string, where = 'view whatif/tile trade-rate.note'): Seen => ({
  where,
  value,
  tag: { in: 'test' },
})

describe('pluralSlips', () => {
  it('finds the review’s slips', () => {
    expect(pluralSlips('Give 1.22, get 1 seats, credit 0.25')).toEqual(['1 seats'])
    expect(pluralSlips('Get 1 seats, 0.25 standard heads left as trade credit.')).toEqual(['1 seats'])
    expect(pluralSlips('Copied 1 rows')).toEqual(['1 rows'])
    expect(pluralSlips('1 rows name no position')).toEqual(['1 rows'])
    expect(pluralSlips('Control totals FY: 1 heads, 1.0 FTE')).toEqual(['1 heads'])
    expect(pluralSlips('Show the 1 seats left to fill')).toEqual(['1 seats'])
    expect(pluralSlips('Heads change −1 heads')).toEqual(['−1 heads'])
    expect(pluralSlips('Give 1 standard heads, get 2 seats')).toEqual(['1 standard heads'])
    expect(pluralSlips('1 people in groups under 5 are left out')).toEqual(['1 people'])
    expect(pluralSlips('(1 positions moved)')).toEqual(['1 positions'])
    // What the crawl's scan found (fix step, loose ends).
    expect(pluralSlips('200 Working seats + -1 heads from pending requests.')).toEqual(['-1 heads'])
    expect(pluralSlips('3 Open + 1 Planned seats nobody has started in.')).toEqual(['1 Planned seats'])
    expect(pluralSlips('7 Filled + 1 Open + 1 Planned seats.')).toEqual(['1 Planned seats'])
    expect(pluralSlips('9 employees hired Apr 2026 to Sep 2026 − 1 planned hires in Budget.')).toEqual([
      '1 planned hires',
    ])
  })

  it('reads singular counts, other numbers and phrases as clean', () => {
    for (const t of [
      'Give 1.22 standard heads, get 1 seat, 0.25 left as trade credit',
      'Copied 1 row',
      '−1 head',
      '1.5 heads',
      '0.1 heads',
      '11 seats',
      '21 rows',
      '1,001 seats',
      'P-1 seats',
      'Q1 seats',
      'FY1 heads',
      '1:1 seats',
      '1 of 5 seats',
      '1 in their seats',
      '2 seats',
      '1 heads-up',
      '1 Planned seat starts within 45 days with no req.',
      '1 person exits in Mar',
    ])
      expect(pluralSlips(t), t).toEqual([])
  })

  it('knows every noun in the plural', () => {
    for (const n of PLURAL_COUNT_NOUNS) expect(pluralSlips(`get 1 ${n}`), n).toEqual([`1 ${n}`])
  })
})

describe('countTemplates: no source template writes a whole count before a plural noun', () => {
  it('finds a whole count before a plural noun, and leaves plural(), decimals and 1 branches alone', () => {
    // Source lines as written, with "#{" for a template placeholder's opening.
    const src = [
      "const a = `#{fmt(n, 'int')} seats`",
      'const b = `#{fmt(a.filled)} Filled + #{fmt(a.planned)} Planned seats.`',
      "const c = `#{fmt(o.list.length - open, 'int')} Planned seats nobody has started in.`",
      "const d = `#{fmt(planIds?.length ?? 0, 'int')} plan heads`",
      "const e = `#{plural(n, 'seat')}`",
      "const f = `#{fmt(x, 'num1')} heads`",
      "const g = `#{fmt(Math.abs(gap), 'num1')} heads`",
      "const h = n === 1 ? '1 row' : `#{fmt(n, 'int')} rows`",
      "const i = `#{fmt(n, 'int')} Open`",
      'const j = n === 1',
      "  ? '1 item comes from data below your standard'",
      "  : `#{fmt(n, 'int')} items come from data below your standard`",
    ]
      .join('\n')
      .replaceAll('#{', '$' + '{')
    expect(countTemplates(src).map((l) => l.split(':')[0])).toEqual(['1', '2', '3', '4'])
  })

  it('finds none in src (fix step, loose ends: each one it found now reads through plural() or new words)', () => {
    const SRC = fileURLToPath(new URL('../', import.meta.url))
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
          for (const l of countTemplates(readFileSync(p, 'utf8'))) hits.push(`${p.slice(SRC.length)}:${l}`)
      }
    }
    walk(SRC)
    expect(hits).toEqual([])
  })
})

describe('countHits and singularCounts over a crawl’s values', () => {
  it('reports each slip with where it was read, and counts the singular ones', () => {
    const values = [
      seen('Give 1.22 standard heads, get 1 seats, credit 0.25'),
      seen('Get 1 seat, 0.25 left as trade credit'),
      seen('Starts 1 person in Mar'),
      seen('a,b\r\n1 rows,2', 'export figure plan-x.csv'),
    ]
    expect(countHits(values).map((h) => `${h.where}: ${h.slip}`)).toEqual([
      'view whatif/tile trade-rate.note: 1 seats',
      'export figure plan-x.csv: 1 rows',
    ])
    expect(singularCounts(values)).toBe(2)
  })
})
