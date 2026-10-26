/**
 * The plain-count scan (docs/PLAN.md 14.3 plain counts; R86: counts read "1 head" and "−1 head"; M4
 * review CP-5): a count of exactly 1, signed or not, followed by a plural count noun ("get 1 seats",
 * "Copied 1 rows", "−1 heads", "1 standard heads", "1 people"), anywhere in a crawl's texts. Written
 * apart from the app's own wording (src/lib/format.ts `plural`), so a template that skips the helper
 * fails here. A decimal ("1.5 heads", "0.1 heads"), a grouped number ("1,001 seats"), an ID ("P-1
 * seats"), a code ("Q1 seats", "FY1 seats") and a ratio ("1:1 seats") are not counts of 1. Test code
 * only.
 */
import type { Seen } from './crawl'

/** The count nouns the app's texts use, plural (each is wrong after a 1). */
export const PLURAL_COUNT_NOUNS: readonly string[] = [
  'adjustments',
  'approvals',
  'approvers',
  'backfills',
  'cards',
  'cells',
  'centers',
  'changes',
  'checks',
  'closes',
  'columns',
  'comments',
  'conflicts',
  'contributors',
  'datasets',
  'days',
  'departments',
  'employees',
  'entries',
  'errors',
  'exceptions',
  'exits',
  'figures',
  'files',
  'freezes',
  'heads',
  'hires',
  'holders',
  'issues',
  'items',
  'levers',
  'lines',
  'managers',
  'members',
  'months',
  'offers',
  'openings',
  'orgs',
  'people',
  'periods',
  'persons',
  'positions',
  'problems',
  'quarters',
  'records',
  'refusals',
  'reqs',
  'requests',
  'rows',
  'seats',
  'sheets',
  'slides',
  'starts',
  'steps',
  'sub-orgs',
  'tabs',
  'teams',
  'trades',
  'transfers',
  'units',
  'versions',
  'weeks',
  'workers',
  'years',
]

const NOUNS = new Set(PLURAL_COUNT_NOUNS)

/** A count noun's singular: "seat", "person", "entry". */
const singularOf = (noun: string): string =>
  noun === 'people' ? 'person' : noun === 'entries' ? 'entry' : noun.slice(0, -1)

/** The singulars, which end a count's phrase too: in "1 Planned seat starts", "starts" is a verb. */
const SINGULARS = new Set(PLURAL_COUNT_NOUNS.map(singularOf))

/** Words that end a count's phrase: "1 of 5 seats" and "1 in their seats" count no seats. */
const BREAKS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'over',
  'per',
  'than',
  'that',
  'the',
  'their',
  'to',
  'was',
  'were',
  'with',
])

/**
 * A count of 1 (a sign allowed, nothing word-like, decimal or grouped just before it) and the up to
 * three words after it: the noun may follow up to two others ("1 standard heads", "1 more open seats").
 */
const COUNT_OF_ONE = /(?<![\p{L}\p{N}_.,:+−-])([+−-]?1)((?: [\p{L}-]+){1,3})/gu

/** Each "1 <plural noun>" in a text, as written ("get 1 seats"). */
export function pluralSlips(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(COUNT_OF_ONE)) {
    const words = m[2].trim().split(' ')
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase()
      if (BREAKS.has(w) || SINGULARS.has(w)) break
      if (NOUNS.has(w)) {
        out.push(`${m[1]} ${words.slice(0, i + 1).join(' ')}`)
        break
      }
    }
  }
  return out
}

/** One slip: where the crawl read it, the words, and a stretch of the text around them. */
export interface CountHit {
  where: string
  slip: string
  text: string
}

/** Every "1 <plural noun>" in a crawl's texts (every string value, export texts whole). */
export function countHits(seen: readonly Seen[]): CountHit[] {
  const out: CountHit[] = []
  for (const s of seen) {
    if (typeof s.value !== 'string' || !s.value.includes('1 ')) continue
    for (const slip of pluralSlips(s.value)) {
      const i = Math.max(0, s.value.indexOf(slip) - 40)
      out.push({ where: s.where, slip, text: s.value.slice(i, i + 120).replace(/\s+/g, ' ') })
    }
  }
  return out
}

/**
 * A source template that writes a whole count with `fmt` (no format, 'int' or 'compact') as a
 * placeholder straight before a plural count noun, with at most one word between (a placeholder of
 * `fmt(n, 'int')` then "seats", or of `fmt(n)` then "Planned seats"): it reads "1 seats" when n is 1.
 * The crawl's scan finds those the sample reaches with a 1; this finds the rest. `plural(n, 'seat')`
 * (src/lib/format.ts) is the fix; a template within two lines of a branch on `=== 1` already says
 * the singular in that branch.
 */
const COUNT_TEMPLATE = new RegExp(
  `\\$\\{fmt\\([^\`'()]*(?:\\([^\`'()]*\\))?[^\`'()]*(?:, '(?:int|compact)')?\\)\\} (?:[A-Za-z]+ )?(?:${PLURAL_COUNT_NOUNS.join('|')})\\b`,
)

/** A branch on a count of 1. */
const ONE_BRANCH = /[!=]== 1\b/

/** The lines of a source file holding an unguarded count template (see `COUNT_TEMPLATE`), numbered. */
export function countTemplates(source: string): string[] {
  const lines = source.split(/\r?\n/)
  return lines.flatMap((line, i) =>
    COUNT_TEMPLATE.test(line) && !lines.slice(Math.max(0, i - 2), i + 1).some((l) => ONE_BRANCH.test(l))
      ? [`${i + 1}: ${line.trim()}`]
      : [],
  )
}

/** A count of 1 and a singular count noun right after it, for the scan's non-vacuity count. */
const ONE_SINGULAR = new RegExp(
  `(?<![\\p{L}\\p{N}_.,:+−-])[+−-]?1 (?:standard )?(?:${PLURAL_COUNT_NOUNS.map(singularOf).join('|')})(?![\\p{L}-])`,
  'u',
)

/** How many of a crawl's texts hold a singular count ("1 seat", "−1 head"): a scan's non-vacuity count. */
export function singularCounts(seen: readonly Seen[]): number {
  return seen.filter((s) => typeof s.value === 'string' && ONE_SINGULAR.test(s.value)).length
}
