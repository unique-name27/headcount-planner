/**
 * Reading assumption tables (docs/PLAN.md 5.2): long-form rows (`version`, `table`, `org`, `key`,
 * `value`) for one version, with values falling back from org (a department) to unit to company.
 * Every engine that reads an assumption reads it through an `AssumptionLookup`, so the fallback is
 * decided in one place. Built by engines A in M1. Pure.
 *
 * Keys are pipe-joined dimensions in each table's order (`ASSUMPTION_KEYS` in src/data/schema.ts):
 * band 'P4|Munich|FY27', burden 'Germany|social', fx 'EUR|plan|2026-09', merit 'FY27|date'. A table
 * keyed by org alone uses the key '*', and '*' in one dimension matches every value ('partTime|*').
 *
 * Readings kept here (engines A, M1):
 *  - A row's `org` names a department or a business unit by name, as the position rows write them;
 *    blank is the company. The department's row wins over the unit's, which wins over the company's.
 *  - Within one org level an exact key wins over a key with '*' in a dimension; among keys with as
 *    many wildcards, the one specific in the earlier dimension wins. A department's row with a
 *    wildcard still wins over the company's exact row (the org decides first).
 *  - Two rows with the same version, table, org and key: the later one wins (an edit appended after
 *    the import).
 *
 * The loads readers below (`standardLoads`, `seatLoads`, `burdenComponents`, `meritRules`,
 * `promotionRules`) are additions to the frozen contract: cost.ts (HRIS, offer and band lines) and
 * band.ts (band estimates) read loads through them, so a seat's loads are read in one place.
 */
import {
  ASSUMPTION_ANY_KEY,
  ASSUMPTION_KEY_SEP,
  type AssumptionRow,
  type AssumptionTable,
  type FiscalYear,
  type ISODate,
  type Level,
  siteByLocation,
  splitAssumptionKey,
} from '@/data/schema'
import type { Loads } from './band'
import type { BurdenComponent, MeritRule, PromotionRule } from './cost'

/** Where a seat sits, for the org fallback: a department's row wins over its unit's, which wins over the company's. */
export interface OrgPath {
  businessUnit: string
  department: string | null
}

/** The level a value came from (Finance > Assumptions shows it). */
export type AssumptionLevel = 'org' | 'unit' | 'company'

/** One resolved value and where it came from. */
export interface AssumptionValue {
  value: number
  level: AssumptionLevel
  /** The row it came from. */
  row: AssumptionRow
}

export interface AssumptionLookup {
  /** The version the rows belong to (its id). */
  readonly versionId: string
  /**
   * A table's value for a key at the most specific org that sets it: the department's row, then the
   * unit's, then the company's (blank org). An exact key wins over one with '*' in a dimension. Null
   * when no level sets it.
   */
  get(table: AssumptionTable, key: readonly (string | number)[], org?: OrgPath | null): AssumptionValue | null
  /** `get(...)?.value`, or `fallback` when no level sets it. */
  num(
    table: AssumptionTable,
    key: readonly (string | number)[],
    org?: OrgPath | null,
    fallback?: number,
  ): number | null
  /** Every row of a table for this version, as stored. */
  rows(table: AssumptionTable): readonly AssumptionRow[]
}

/** The key as stored: dimensions trimmed and re-joined; an empty key is '*'. */
const normalKey = (key: string): string => {
  const parts = splitAssumptionKey(key)
  return parts.length === 1 && parts[0] === '' ? ASSUMPTION_ANY_KEY : parts.join(ASSUMPTION_KEY_SEP)
}

/**
 * The wildcard patterns tried for a key of `n` dimensions, best first: fewer wildcards first, then a
 * wildcard in a later dimension before one in an earlier dimension. Each pattern is one flag per
 * dimension (true: '*').
 */
const PATTERNS = new Map<number, readonly (readonly boolean[])[]>()
function patternsFor(n: number): readonly (readonly boolean[])[] {
  let out = PATTERNS.get(n)
  if (!out) {
    const all: boolean[][] = []
    for (let mask = 0; mask < 1 << n; mask++)
      all.push(Array.from({ length: n }, (_, i) => (mask & (1 << i)) !== 0))
    const count = (p: readonly boolean[]) => p.filter(Boolean).length
    all.sort((a, b) => {
      const d = count(a) - count(b)
      if (d !== 0) return d
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] ? 1 : -1
      return 0
    })
    out = all
    PATTERNS.set(n, out)
  }
  return out
}

/**
 * A lookup over the assumption rows of one version. A row's `version` may name the version by ID or
 * by name ('fy27-working' or 'FY27 Working'); both match. Rows of other versions are ignored.
 *
 * Fixtures: every cost, band, forecast and trade fixture reads its assumptions through it.
 */
export function assumptionLookup(
  rows: readonly AssumptionRow[],
  version: { versionId: string; name: string },
): AssumptionLookup {
  const id = version.versionId.trim()
  const name = version.name.trim()
  /** table → org ('' is the company) → key → row */
  const index = new Map<AssumptionTable, Map<string, Map<string, AssumptionRow>>>()
  const byTable = new Map<AssumptionTable, AssumptionRow[]>()
  for (const row of rows) {
    const v = (row.version ?? '').trim()
    if (v !== id && v !== name) continue
    let list = byTable.get(row.table)
    if (!list) {
      list = []
      byTable.set(row.table, list)
    }
    list.push(row)
    let orgs = index.get(row.table)
    if (!orgs) {
      orgs = new Map()
      index.set(row.table, orgs)
    }
    const org = (row.org ?? '').trim()
    let keys = orgs.get(org)
    if (!keys) {
      keys = new Map()
      orgs.set(org, keys)
    }
    keys.set(normalKey(row.key), row)
  }

  const find = (keys: Map<string, AssumptionRow>, parts: readonly string[]): AssumptionRow | null => {
    const exact = keys.get(parts.join(ASSUMPTION_KEY_SEP))
    if (exact) return exact
    if (parts.length === 1 && parts[0] === ASSUMPTION_ANY_KEY) return null
    const patterns = patternsFor(parts.length)
    for (let p = 1; p < patterns.length; p++) {
      const pattern = patterns[p]
      const row = keys.get(
        parts.map((s, i) => (pattern[i] ? ASSUMPTION_ANY_KEY : s)).join(ASSUMPTION_KEY_SEP),
      )
      if (row) return row
    }
    return null
  }

  // Engines ask for the same few values many times (a seat's loads every month): each answer is
  // kept by its table, key and org as given, and handed out again (frozen: callers only read it).
  const answers = new Map<string, AssumptionValue | null>()
  const get: AssumptionLookup['get'] = (table, key, org) => {
    const orgs = index.get(table)
    if (!orgs) return null
    const memoKey = `${table}\u0001${key.length}\u0001${key.join('\u0002')}\u0001${org?.department ?? ''}\u0001${org?.businessUnit ?? ''}`
    const known = answers.get(memoKey)
    if (known !== undefined) return known
    const found = resolve(orgs, key, org)
    answers.set(memoKey, found)
    return found
  }

  const resolve = (
    orgs: Map<string, Map<string, AssumptionRow>>,
    key: readonly (string | number)[],
    org: OrgPath | null | undefined,
  ): AssumptionValue | null => {
    const parts = key.length ? key.map((k) => String(k).trim()) : [ASSUMPTION_ANY_KEY]
    const levels: [string, AssumptionLevel][] = []
    const dept = org?.department?.trim()
    const unit = org?.businessUnit?.trim()
    if (dept) levels.push([dept, 'org'])
    if (unit && unit !== dept) levels.push([unit, 'unit'])
    levels.push(['', 'company'])
    for (const [name, level] of levels) {
      const keys = orgs.get(name)
      if (!keys) continue
      const row = find(keys, parts)
      if (row) return Object.freeze({ value: row.value, level, row })
    }
    return null
  }

  return {
    versionId: id,
    get,
    num: (table, key, org, fallback) => get(table, key, org)?.value ?? fallback ?? null,
    rows: (table) => byTable.get(table) ?? [],
  }
}

/* ───────────── loads (additions: one reader for cost.ts and band.ts) ───────────── */

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** A date stored as the number YYYYMMDD (merit and promotion dates): 20260401 is '2026-04-01'; null when it is not one. */
export function dateOfNumber(v: number | null | undefined): ISODate | null {
  if (v == null || !Number.isInteger(v) || v < 10_000_101 || v > 99_991_231) return null
  const y = Math.floor(v / 10_000)
  const m = Math.floor(v / 100) % 100
  const d = v % 100
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** What the loads readers derive from a lookup's rows alone, once per lookup. */
interface Derived {
  firstParts: Map<AssumptionTable, string[]>
  burdenNames: Map<string, string[]>
  /** `burdenComponents` by country and org. */
  burden: Map<string, BurdenComponent[]>
}
const derivedOf = new WeakMap<AssumptionLookup, Derived>()
function derived(lookup: AssumptionLookup): Derived {
  let d = derivedOf.get(lookup)
  if (!d) {
    d = { firstParts: new Map(), burdenNames: new Map(), burden: new Map() }
    derivedOf.set(lookup, d)
  }
  return d
}

/** The distinct values of a key's first dimension among a table's rows, in order of first appearance. */
function firstParts(lookup: AssumptionLookup, table: AssumptionTable): string[] {
  const cache = derived(lookup).firstParts
  const hit = cache.get(table)
  if (hit) return hit
  const seen = new Set<string>()
  for (const r of lookup.rows(table)) {
    const p = splitAssumptionKey(r.key)[0]
    if (p && p !== ASSUMPTION_ANY_KEY) seen.add(p)
  }
  const out = [...seen]
  cache.set(table, out)
  return out
}

/** Every component any `burden` row names for a country (or for '*'), in order of first appearance. */
function burdenNames(country: string, lookup: AssumptionLookup): string[] {
  const cache = derived(lookup).burdenNames
  const hit = cache.get(country)
  if (hit) return hit
  const names: string[] = []
  for (const r of lookup.rows('burden')) {
    const [c, component] = splitAssumptionKey(r.key)
    if ((c === country || c === ASSUMPTION_ANY_KEY) && component && !names.includes(component))
      names.push(component)
  }
  cache.set(country, names)
  return names
}

/**
 * A country's burden components at an org: every component any `burden` row names for the country
 * (or for '*'), in order of first appearance, with its rate from `burden` and its cap from
 * `burdenCap` (null: uncapped), each through the org fallback. A component no level sets is left out.
 */
export function burdenComponents(
  country: string,
  org: OrgPath | null,
  lookup: AssumptionLookup,
): BurdenComponent[] {
  // Read once per country and org (callers only read the components).
  const cache = derived(lookup).burden
  const key = `${country}${org?.department ?? ''}${org?.businessUnit ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  const out: BurdenComponent[] = []
  for (const component of burdenNames(country, lookup)) {
    const rate = lookup.num('burden', [country, component], org)
    if (rate == null) continue
    out.push({ component, rate, cap: lookup.num('burdenCap', [country, component], org) })
  }
  cache.set(key, out)
  return out
}

/** The loads of a level in a country for a fiscal year, apart from the band midpoint. */
export type StandardLoads = Omit<Loads, 'midpoint' | 'currency'>

/**
 * The standard loads at an org: bonusTarget[level] (0 when unset), bonusFunding[fiscalYear] (1 when
 * unset: fully funded), the country's burden components, benefits[country] (0 when unset) and
 * equity[level] (0 when unset).
 */
export function standardLoads(
  level: Level,
  country: string,
  fiscalYear: FiscalYear,
  org: OrgPath | null,
  lookup: AssumptionLookup,
): StandardLoads {
  return {
    bonusTarget: lookup.num('bonusTarget', [level], org) ?? 0,
    bonusFunding: lookup.num('bonusFunding', [fiscalYear], org) ?? 1,
    burden: burdenComponents(country, org, lookup),
    benefits: lookup.num('benefits', [country], org) ?? 0,
    equityUsd: lookup.num('equity', [level], org) ?? 0,
  }
}

/**
 * A seat type's loads (band.ts `loadsOf`): band[level|zone|fiscalYear] (the zone is the location's
 * site zone, the location itself in Phase 1) and the standard loads, in the site's currency. Null for
 * a location with no site or a band with no midpoint.
 */
export function seatLoads(
  seat: { level: Level; location: string },
  fiscalYear: FiscalYear,
  org: OrgPath | null,
  lookup: AssumptionLookup,
): Loads | null {
  const site = siteByLocation.get(seat.location)
  if (!site) return null
  const midpoint = lookup.num('band', [seat.level, site.zone, fiscalYear], org)
  if (midpoint == null) return null
  return {
    midpoint,
    currency: site.currency,
    ...standardLoads(seat.level, site.country, fiscalYear, org, lookup),
  }
}

/**
 * The merit rules at an org (table `merit`, keys '<FY>|date', '<FY>|pct', '<FY>|cutoff'), by date.
 * A fiscal year with no date or no pct is left out; a missing cutoff reads the merit date.
 */
export function meritRules(lookup: AssumptionLookup, org: OrgPath | null): MeritRule[] {
  const out: MeritRule[] = []
  for (const fy of firstParts(lookup, 'merit')) {
    const date = dateOfNumber(lookup.num('merit', [fy, 'date'], org))
    const pct = lookup.num('merit', [fy, 'pct'], org)
    if (!date || pct == null) continue
    const cutoff = dateOfNumber(lookup.num('merit', [fy, 'cutoff'], org)) ?? date
    out.push({ fiscalYear: fy as FiscalYear, date, pct, cutoff })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** The promotion pools at an org (table `promotionPool`, keys '<FY>|date', '<FY>|pct'), by date. */
export function promotionRules(lookup: AssumptionLookup, org: OrgPath | null): PromotionRule[] {
  const out: PromotionRule[] = []
  for (const fy of firstParts(lookup, 'promotionPool')) {
    const date = dateOfNumber(lookup.num('promotionPool', [fy, 'date'], org))
    const pct = lookup.num('promotionPool', [fy, 'pct'], org)
    if (!date || pct == null) continue
    out.push({ fiscalYear: fy as FiscalYear, date, pct })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
