/**
 * The leak scanner (the template app's Ask test kit `secretsOf`, `leaks` and `expectClean`, moved
 * here because Headcount Planner has no Ask in Phase 1), plus the amount scan Manager mode must pass
 * (docs/PLAN.md 7.6 and 16.1): no currency sign, ISO currency code, grouped number or amount-like
 * key anywhere a Manager crawl reads.
 *
 * `leaks(text, secrets)` finds what in a text breaks the privacy promise: a person's name (as typed
 * or folded: case, accents, apostrophes, hyphens, "Last, First"), an employee or req ID, an email
 * address, a currency-prefixed number, or any number of 25,000 or more that equals a pay value of
 * the data (a salary, an offer, a sign-on, relocation or agency fee). Written apart from the
 * engines' own text handling, so a mistake there is not repeated here. Test code only.
 */
import { expect } from 'vitest'
import { type Datasets, SITES } from '@/data/schema'
import type { Seen } from './crawl'

/* ───────────── secrets (the template app's scanner) ───────────── */

export interface Secrets {
  /** Full names of people in the data (workers, recruiters). */
  names: Set<string>
  /** Employee and req IDs. */
  ids: Set<string>
  /**
   * Pay amounts (salaries, offers, sign-on, relocation and agency fees) as numbers, from 25,000 up:
   * smaller round amounts are indistinguishable from counts, and no count reaches 25,000.
   */
  pay: Set<number>
  /** Other text that must never go out (a comment, a reason), matched ignoring case. */
  texts?: readonly string[]
}

/** Every person, ID and pay amount of some data, plus names and text known to be secret. */
export function secretsOf(
  d: Pick<Datasets, 'workers' | 'comp' | 'reqs'>,
  extra: { names?: readonly string[]; texts?: readonly string[]; pay?: readonly number[] } = {},
): Secrets {
  const names = new Set<string>()
  const ids = new Set<string>()
  const add = (s: string | null | undefined, set: Set<string>) => {
    if (s?.trim()) set.add(s.trim())
  }
  for (const w of d.workers) {
    add(w.name, names)
    add(w.employeeId, ids)
  }
  for (const r of d.reqs) {
    add(r.recruiter, names)
    add(r.reqId, ids)
  }
  for (const n of extra.names ?? []) add(n, names)
  const pay = new Set<number>()
  const keep = (v: number | null | undefined) => {
    if (typeof v === 'number' && Math.abs(v) >= PAY_FLOOR) pay.add(v)
  }
  for (const c of d.comp) keep(c.baseSalary)
  for (const r of d.reqs) for (const v of [r.offerBase, r.signOnBonus, r.relocation, r.agencyFee]) keep(v)
  for (const v of extra.pay ?? []) pay.add(v)
  return { names, ids, pay, ...(extra.texts ? { texts: extra.texts } : {}) }
}

const NUMBER_RE = /-?\d+(?:\.\d+)?/g
export const PAY_FLOOR = 25_000

/** Words of a text with possessives and edge punctuation trimmed, so "Lena Ortiz's" yields "Lena", "Ortiz". */
function wordsOf(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}'’.-]+/u)
    .map((w) => w.replace(/^['’.-]+|['’.-]+$/g, '').replace(/['’]s$/, ''))
    .filter(Boolean)
}

/**
 * Text as a reader would still recognize a name in it: lowercase, accents dropped (composed or
 * decomposed), any apostrophe as ', hyphens and dashes as spaces.
 */
const loose = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[‘’‛ʼʹ`´′]/g, "'")
    .replace(/[-‐-—−]/g, ' ')

const looseNames = new WeakMap<Secrets, Set<string>>()

/** Every name folded, and in "Last First" order too (a comma is not a word, so "Last, First" matches it). */
function looseNamesOf(s: Secrets): Set<string> {
  let out = looseNames.get(s)
  if (!out) {
    out = new Set()
    for (const n of s.names) {
      const words = wordsOf(loose(n))
      if (!words.length) continue
      out.add(words.join(' '))
      if (words.length > 1) out.add([words[words.length - 1], ...words.slice(0, -1)].join(' '))
    }
    looseNames.set(s, out)
  }
  return out
}

/** What in a text breaks the privacy promise; empty when it is clean. */
export function leaks(text: string, s: Secrets): string[] {
  const out: string[] = []
  const grams = (words: readonly string[], check: (gram: string) => void) => {
    const seen = new Set<string>()
    for (let i = 0; i < words.length; i++) {
      let gram = ''
      for (let n = 0; n < 5 && i + n < words.length; n++) {
        gram = n ? `${gram} ${words[i + n]}` : (words[i] as string)
        if (seen.has(gram)) continue
        seen.add(gram)
        check(gram)
      }
    }
  }
  grams(wordsOf(text), (gram) => {
    if (s.ids.has(gram)) out.push(`id ${gram}`)
    if (s.names.has(gram)) out.push(`name ${gram}`)
  })
  // The same names typed another way: case, accents, apostrophes, hyphens, "Last, First".
  const folded = looseNamesOf(s)
  grams(wordsOf(loose(text)), (gram) => {
    if (folded.has(gram) && !out.some((o) => loose(o) === `name ${gram}`)) out.push(`name (as typed) ${gram}`)
  })
  const lower = text.toLowerCase()
  for (const t of s.texts ?? []) if (lower.includes(t.toLowerCase())) out.push(`text ${t}`)
  if (/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.\p{L}{2,}/u.test(text)) out.push('email')
  if (/[$€£₹₪]\s?\d/.test(text)) out.push('money')
  for (const m of text.match(NUMBER_RE) ?? []) {
    const v = Number(m)
    if (Math.abs(v) >= PAY_FLOOR && s.pay.has(v)) out.push(`pay ${m}`)
  }
  return out
}

/** Fail with what leaked. */
export function expectClean(text: string, what: string, s: Secrets): void {
  const l = leaks(text, s)
  expect(l.slice(0, 5), `${what} leaks ${l.length}: ${l.slice(0, 5).join(', ')}`).toEqual([])
}

/* ───────────── amounts (Manager mode, docs/PLAN.md 7.6) ───────────── */

/** Currency codes a reader takes for money: the sites' currencies and the common others. */
export const ISO_CODES: ReadonlySet<string> = new Set([
  ...SITES.map((s) => s.currency),
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'INR',
  'ILS',
  'TWD',
  'CNY',
  'SGD',
  'KRW',
])

/**
 * A key that names an amount: pay, an offer, a one-time cost, a load, a cost or band total, an
 * amount in USD or local currency. Counts and codes that only sound like one (`costCenter`, `costed`
 * people, a weight in basis points `giveBp`) are not amounts.
 */
export const AMOUNT_KEY =
  /salary|offerbase|signon|relocation|agency|bonus|burden|benefit|severance|loaded|usd|local|amount|perhead|equity|vacancy|band|cost(?!center|ed|centre)|^pay$|payamount/i

/** A key that names an amount (see `AMOUNT_KEY`). */
export const isAmountKey = (key: string): boolean => !/Bp$|^bp/i.test(key) && AMOUNT_KEY.test(key)

/**
 * A grouped number: what an amount prints as. Thousands grouped by one separator throughout (a comma,
 * a space, a no-break, narrow or thin space, or an apostrophe: "140,000", "140 000", "140'000"), by
 * dots ("140.000", checked by `dotGrouped`), or Indian grouping ("12,40,000"), with an optional
 * decimal part ("140.000,00"). Not part of a date, an ID or a list ("2026-06-08", "P-1,2"): no
 * letter, digit, point, comma, slash or apostrophe right before it, and no "-" joined to a letter or
 * digit ("P-1002"; a lone "-140,000" counts). Written apart from src/access/visibility.ts (review
 * RM-1), so a mistake in the guard's grammar is not repeated here.
 */
const GROUPED =
  /(?<![\p{L}\p{N}.,/'’]|[\p{L}\p{N}]-)(?<int>\d{1,2}(?:,\d{2})+,\d{3}|\d{1,3}(?:(?<sep>[,    '’])\d{3})(?:\k<sep>\d{3})*|\d{1,3}(?:\.\d{3})+)(?<dec>[.,]\d+)?(?![\p{L}\p{N}/-])/u
/** A number with a size word ("95k", "1.2M", "3 bn", "14 lakh", "1.4 crore", "140 grand"). */
const SUFFIXED =
  /(?<![\p{L}\p{N}.])\d+(?:[.,]\d+)?\s?(?:k|m|mm|mn|bn|thousand|million|billion|grand|lakhs?|lacs?|crores?|cr)(?![\p{L}\p{N}])/iu
/** A currency sign, ISO code or "Rs" right before a number, or a sign or code right after it. */
const MONEY_BEFORE = /(?:\p{Sc}|\b[A-Z]{3}|Rs\.?)\s?$/u
const MONEY_AFTER = /^\s?(?:\p{Sc}|[A-Z]{3}\b)/u

/**
 * A dot run is thousands only when it cannot be a decimal: the leading group has no leading zero, and
 * it has two or more groups ("1.400.000"), a decimal comma follows ("140.000,00"), the leading group
 * has 2 or 3 digits ("14.000"), or money is next to it ("€1.500"). "1.043 standard heads", "0.753"
 * and "2.044" are decimals.
 */
function dotGrouped(int: string, dec: string, before: string, after: string): boolean {
  if (int.startsWith('0')) return false
  const groups = int.split('.')
  return (
    groups.length > 2 ||
    dec.startsWith(',') ||
    (groups[0]?.length ?? 0) >= 2 ||
    MONEY_BEFORE.test(before) ||
    MONEY_AFTER.test(after)
  )
}

/**
 * Words that make a grouped number a count, not an amount ("1,609 heads", "1,449 Filled + 100 Open"):
 * only a whole company's tree (a CEO picked as a manager) reaches a count of 1,000.
 */
const COUNT_WORD =
  /^\s*(heads?|seats?|people|persons?|positions?|standard heads|fte|filled|open|planned|on hold|eliminated|entries|requests?|items?|rows?|days?|employees?|managers?|offers?|reqs?|openings?)\b/i

/**
 * An ISO currency code is a currency only beside a number ("EUR 1,200", "95 USD") or as a whole cell
 * (a currency column); "CAD Infrastructure Engineer" is a job title.
 */
function isoHits(text: string): string[] {
  const out: string[] = []
  const whole = text.trim()
  if (ISO_CODES.has(whole)) return [`currency code ${whole}`]
  for (const m of text.matchAll(/\b[A-Z]{3}\b/g)) {
    if (!ISO_CODES.has(m[0])) continue
    const before = text.slice(0, m.index)
    const after = text.slice((m.index ?? 0) + 3)
    if (/\d[\d,.]*\s?$/.test(before) || /^\s?[\d(−-]/.test(after)) out.push(`currency code ${m[0]}`)
  }
  // A code glued to the digits ("INR140000", "140000INR").
  for (const m of text.matchAll(/(?<![A-Za-z])([A-Z]{3})(?=\d)|(?<=\d)([A-Z]{3})(?![A-Za-z])/g)) {
    const code = m[1] ?? m[2] ?? ''
    if (ISO_CODES.has(code)) out.push(`currency code ${code}`)
  }
  // "Rs" before the digits ("Rs 1,40,000", "Rs.140000").
  if (/(?<![\p{L}\p{N}])Rs\.?\s?\d/u.test(text)) out.push('currency word Rs')
  return out
}

/** What in a text reads as an amount: a currency sign, an ISO currency code, a grouped or suffixed number. */
export function amountsIn(text: string): string[] {
  const out: string[] = []
  const sign = /\p{Sc}/u.exec(text)
  if (sign) out.push(`currency sign ${sign[0]}`)
  out.push(...isoHits(text))
  for (const m of text.matchAll(new RegExp(GROUPED.source, 'gu'))) {
    const at = m.index ?? 0
    const int = m.groups?.int ?? ''
    const after = text.slice(at + m[0].length)
    // A dot run that can only be a decimal is a rate or a count, not a grouped number.
    if (!m.groups?.sep && !int.includes(',') && int.includes('.'))
      if (!dotGrouped(int, m.groups?.dec ?? '', text.slice(Math.max(0, at - 5), at), after)) continue
    if (!COUNT_WORD.test(after)) out.push(`grouped number ${m[0]}`)
  }
  const suffixed = SUFFIXED.exec(text)
  if (suffixed) out.push(`amount ${suffixed[0]}`)
  return out
}

/** Formats a count shows in: a number in one of them is never an amount. */
const COUNT_FORMATS: ReadonlySet<string> = new Set([
  'int',
  'compact',
  'num1',
  'num2',
  'pct',
  'pct0',
  'pct2',
  'pts',
  'pts2',
  'deltaDays',
  'deltaPct',
  'days',
  'fte',
])

/**
 * The cells of a CSV or tab-separated text (RFC 4180 quotes; the BOM dropped), so a comma between
 * two fields never reads as a thousands separator.
 */
export function cellsOf(text: string, sep: ',' | '\t'): string[] {
  const out: string[] = []
  let cell = ''
  let quoted = false
  const body = text.replace(/^﻿/, '')
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep || ch === '\n' || ch === '\r') {
      out.push(cell)
      cell = ''
    } else cell += ch
  }
  out.push(cell)
  return out.filter((c) => c !== '')
}

export interface AmountHit {
  where: string
  what: string
  text: string
}

/** The ids a crawl path carries after a word (a metric id after "glossary", a section and id after "formulas"). */
const ID_WORDS = /\b(glossary|formulas \S+|tile|finding|figure|hero|item|card|note) \S+/g

/**
 * The keys a crawl path names: every `.key` segment (a column, a field, a file's JSON key). Glossary
 * and formula paths name metric ids, never keys, and carry none.
 */
export const keysOf = (where: string): string[] =>
  [...where.replace(ID_WORDS, '$1').matchAll(/\.([A-Za-z_]\w*)/g)]
    .map((m) => m[1])
    .filter((k) => !/^\d/.test(k))

/** The texts a value shows: a CSV or clipboard text cell by cell, a sheet read back cell by cell. */
function textsOf(s: Seen): string[] {
  if (typeof s.value !== 'string') return []
  if (/\.csv$|^workbook /.test(s.where)) return cellsOf(s.value, ',')
  if (/\.tsv$/.test(s.where)) return cellsOf(s.value, '\t')
  return [s.value]
}

/**
 * Everything in a crawl that reads as an amount (Manager mode, 7.6): a value in an amount column or
 * format, a number of 1,000 or more, a currency sign, ISO code or grouped number in any text (export
 * texts cell by cell), or an amount-like key on the path. Empty for a clean Manager crawl.
 */
export function amountHits(seen: readonly Seen[]): AmountHit[] {
  const out: AmountHit[] = []
  const keyHits = new Set<string>()
  for (const s of seen) {
    const at = s.where
    for (const k of keysOf(at))
      if (isAmountKey(k) && !keyHits.has(k)) {
        keyHits.add(k)
        out.push({ where: at, what: `amount-like key ${k}`, text: String(s.value) })
      }
    if (s.tag.money && s.value != null && s.value !== '' && s.value !== '—')
      out.push({ where: at, what: 'value in an amount column', text: String(s.value) })
    if (
      typeof s.value === 'number' &&
      Math.abs(s.value) >= 1000 &&
      !isYear(s.value) &&
      !(s.tag.format && COUNT_FORMATS.has(s.tag.format)) &&
      // A trade weight in basis points of a standard head (11.6: "bp fields stay").
      !/Bp$/.test(keysOf(at).at(-1) ?? '')
    )
      out.push({ where: at, what: 'number of 1,000 or more', text: String(s.value) })
    for (const t of textsOf(s))
      for (const what of amountsIn(t)) out.push({ where: at, what, text: excerpt(t, what) })
  }
  return out
}

/**
 * The audit chain outside HR admin (8.4 rule 7): a `seq`, `prevHash` or `hash` field on an audit
 * row, a value equal to an entry's hash, or the chain status. Version and close lock hashes are not
 * the chain: they show by policy (Finance > Versions, every export header).
 */
export function chainHits(
  seen: readonly Seen[],
  audit: readonly { hash: string; prevHash: string }[],
): AmountHit[] {
  const hashes = new Set(
    audit.flatMap((e) => [e.hash, e.prevHash]).filter((h) => h && h !== 'sha256-genesis'),
  )
  const out: AmountHit[] = []
  for (const s of seen) {
    const audited = /audit/i.test(s.where)
    if (
      audited &&
      keysOf(s.where).some((k) => k === 'seq' || k === 'prevHash' || k === 'hash' || k === 'sequence')
    )
      if (s.value != null) out.push({ where: s.where, what: 'chain field', text: String(s.value) })
    for (const t of textsOf(s)) {
      if (/chain checks out/i.test(t)) out.push({ where: s.where, what: 'chain status', text: t })
      for (const h of hashes) if (t.includes(h)) out.push({ where: s.where, what: 'audit hash', text: h })
    }
  }
  return out
}

const isYear = (v: number): boolean => Number.isInteger(v) && v >= 1900 && v <= 2100

/** A short piece of text around what was found. */
export function excerpt(text: string, what: string): string {
  const needle = what.split(' ').at(-1) ?? ''
  const i = Math.max(0, text.indexOf(needle) - 60)
  return text.slice(i, i + 160).replace(/\s+/g, ' ')
}

/** Every value of a crawl that contains a text (ignoring case), for the HR admin controls. */
export function holding(seen: readonly Seen[], needle: string): Seen[] {
  const n = needle.toLowerCase()
  return seen.filter((s) => typeof s.value === 'string' && s.value.toLowerCase().includes(n))
}

/**
 * Every value of a crawl holding one person's pay (the secret scanner's pay and money finds): a number
 * equal to a salary, offer, sign-on, relocation or agency fee of the data, or a currency-prefixed
 * number, in a value or a text. Names and IDs are left to the caller: Manager mode shows its team's.
 */
export function payHits(seen: readonly Seen[], s: Secrets): AmountHit[] {
  const out: AmountHit[] = []
  for (const x of seen) {
    if (typeof x.value === 'number') {
      if (Math.abs(x.value) >= PAY_FLOOR && s.pay.has(x.value))
        out.push({ where: x.where, what: 'pay value', text: String(x.value) })
      continue
    }
    for (const t of textsOf(x))
      for (const l of leaks(t, { names: new Set(), ids: new Set(), pay: s.pay }))
        out.push({ where: x.where, what: l, text: excerpt(t, l) })
  }
  return out
}
