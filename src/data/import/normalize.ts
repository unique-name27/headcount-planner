/**
 * Coercers: one per field type, each returning `{ value, issue? }`. A value that cannot be read
 * comes back as null with a plain-English issue; nothing is silently replaced by a guess.
 */
import { median } from '@/lib/stats'
import type { DatasetKey, FieldDef, FiscalYear, Level, StepRow } from '../schema'
import { canonicalText } from './canonical'
import { detectDateOrder, partsToDate, partsToDateTime, readDate } from './dates'
import { readNumber } from './numbers'
import { formatSteps, readSteps, STEPS_EXAMPLE } from './steps'
import { displayValue, isBlank, normText } from './text'
import type { DateOrder, IssueCode } from './types'
import { normalizeEnumValue, normalizeLevel } from './vocab'

export interface Coerced<T> {
  value: T | null
  issue?: string
  code?: IssueCode
}

const ok = <T>(value: T | null): Coerced<T> => ({ value })
const NONE: Coerced<never> = { value: null }
const fail = <T>(issue: string, code: IssueCode = 'unreadable'): Coerced<T> => ({ value: null, issue, code })
const quote = (v: unknown) => `"${displayValue(v)}"`

/* ───────────── dates ───────────── */

export function coerceDate(v: unknown, order: DateOrder = 'MDY'): Coerced<string> {
  if (isBlank(v)) return NONE
  const r = readDate(v, order)
  if (r.ok) return ok(partsToDate(r.parts))
  return r.reason === 'out-of-range'
    ? fail(`${quote(v)} is not a plausible date.`, 'out-of-range')
    : fail(`${quote(v)} is not a date.`)
}

export function coerceDateTime(v: unknown, order: DateOrder = 'MDY'): Coerced<string> {
  if (isBlank(v)) return NONE
  const r = readDate(v, order)
  if (r.ok) return ok(partsToDateTime(r.parts))
  return r.reason === 'out-of-range'
    ? fail(`${quote(v)} is not a plausible date.`, 'out-of-range')
    : fail(`${quote(v)} is not a date and time.`)
}

export { detectDateOrder }

/* ───────────── numbers ───────────── */

export function coerceNumber(v: unknown, opts: { money?: boolean } = {}): Coerced<number> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean' || v instanceof Date) return fail(`${quote(v)} is not a number.`)
  const r = readNumber(v, opts.money)
  if (r.value == null) return NONE
  if (!Number.isFinite(r.value)) return fail(`${quote(v)} is not ${opts.money ? 'an amount' : 'a number'}.`)
  return ok(r.value)
}

export const coerceMoney = (v: unknown): Coerced<number> => coerceNumber(v, { money: true })

/**
 * Percent as a fraction. Text with a % sign is always divided by 100; plain numbers only when
 * the column holds whole numbers (`whole`, see `detectPercentWhole`).
 */
export function coercePercent(v: unknown, whole: boolean): Coerced<number> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean' || v instanceof Date) return fail(`${quote(v)} is not a percentage.`)
  const r = readNumber(v)
  if (r.value == null) return NONE
  if (!Number.isFinite(r.value)) return fail(`${quote(v)} is not a percentage.`)
  return ok(r.percent || whole ? r.value / 100 : r.value)
}

/** A percent column holds whole numbers (3.5 meaning 3.5%) when its plain values have a median above 1.5. */
export function detectPercentWhole(values: readonly unknown[]): boolean {
  const xs: number[] = []
  for (const v of values) {
    if (isBlank(v)) continue
    const r = readNumber(v)
    if (r.value != null && Number.isFinite(r.value) && !r.percent) xs.push(Math.abs(r.value))
  }
  return (median(xs) ?? 0) > 1.5
}

/**
 * A share of a whole (an FTE): a fraction, or a percentage when the cell has a % sign or reads
 * above 1.5 (80 is 0.8, 35% is 0.35). Read value by value, so a column that mixes 0.8 and 80 still
 * works. Outside `min` to 1.5 after that is logged and left blank.
 */
export function coerceShare(
  v: unknown,
  label: string,
  min: { value: number; inclusive: boolean },
): Coerced<number> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean' || v instanceof Date) return fail(`${quote(v)} is not ${label}.`)
  const r = readNumber(v)
  if (r.value == null) return NONE
  if (!Number.isFinite(r.value)) return fail(`${quote(v)} is not ${label}.`)
  const x = r.percent || r.value > 1.5 ? r.value / 100 : r.value
  const low = min.inclusive ? x < min.value : x <= min.value
  if (low || x > 1.5) return fail(`${quote(v)} is outside the range for ${label}.`, 'out-of-range')
  return ok(x)
}

const FTE = { label: 'an FTE', min: { value: 0, inclusive: false } }

/** Fields read as a share by `coerceShare`, with the smallest value each takes. */
const SHARE_FIELDS: Readonly<Record<string, { label: string; min: { value: number; inclusive: boolean } }>> =
  {
    'positions.fte': FTE,
    'workers.fte': FTE,
    'requests.fte': FTE,
    'requests.restFte': FTE,
  }

/* ───────────── booleans ───────────── */

const FALSY = /^(?:no|n|false|f|0|off|unchecked|optional|not required|none)$/
const TRUTHY = /^(?:yes|y|true|t|1|x|on|checked|required)$/

/** Yes/No. Numbers count as yes when above zero. */
export function coerceBoolean(v: unknown): Coerced<boolean> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean') return ok(v)
  if (typeof v === 'number') return ok(v > 0)
  const s = String(v).trim()
  if (s === '✓' || s === '✔' || s === '☑') return ok(true)
  const t = normText(s)
  if (FALSY.test(t) || /^(?:non|not|un)\b/.test(t)) return ok(false)
  if (TRUTHY.test(t)) return ok(true)
  const n = Number(t)
  if (Number.isFinite(n) && t !== '') return ok(n > 0)
  return fail(`${quote(v)} is not yes or no.`, 'unknown-value')
}

/* ───────────── levels, ids, text ───────────── */

export function coerceLevel(v: unknown): Coerced<Level> {
  if (isBlank(v)) return NONE
  const level = normalizeLevel(v)
  return level
    ? ok(level)
    : fail(`${quote(v)} is not a recognized level (P1-P6, M1-M2, E1-E3).`, 'unknown-value')
}

/** Identifier as text; whole numbers lose any ".0" a spreadsheet added. */
export function coerceId(v: unknown): Coerced<string> {
  if (isBlank(v)) return NONE
  if (typeof v === 'number') return ok(String(v))
  if (v instanceof Date) return fail(`${quote(v)} is a date, not an ID.`)
  const s = String(v).trim().replace(/\s+/g, ' ')
  return ok(/^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s)
}

export function coerceString(v: unknown): Coerced<string> {
  if (isBlank(v)) return NONE
  if (v instanceof Date) return ok(displayValue(v))
  if (typeof v === 'boolean') return ok(v ? 'Yes' : 'No')
  return ok(String(v).trim().replace(/\s+/g, ' '))
}

/* ───────────── steps, fiscal years, assumption values ───────────── */

/** Approval steps from compact text ("Manager E10234 Approved 2026-08-03; HRBP E10077 Pending"). */
export function coerceSteps(v: unknown): Coerced<StepRow[]> {
  if (isBlank(v)) return NONE
  const steps = readSteps(v)
  if (!steps)
    return fail(
      `${quote(Array.isArray(v) ? '' : v)} is not a list of approval steps such as "${STEPS_EXAMPLE}".`,
      'unreadable',
    )
  return steps.length ? ok(steps) : NONE
}

export { formatSteps }

/**
 * A fiscal year named by the calendar year it ends in: "FY28", "fy 28", "FY2028", "2027/28",
 * "2027-28", 28 or 2028 all read as FY28 (1 Apr 2027 to 31 Mar 2028). Null when it does not read.
 */
export function readFiscalYear(v: unknown): FiscalYear | null {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) return null
    if (v >= 0 && v <= 99) return `FY${String(v).padStart(2, '0')}` as FiscalYear
    if (v >= 2000 && v <= 2099) return `FY${String(v - 2000).padStart(2, '0')}` as FiscalYear
    return null
  }
  const t = normText(v).replace(/\s+/g, '')
  if (!t) return null
  // "2027/28" or "2027-28": the year it ends in (normText turns the separator into a space).
  const pair = /^(?:fy)?(\d{4})(\d{2})$/.exec(t)
  if (pair && (+pair[1] + 1) % 100 === +pair[2]) return `FY${pair[2]}` as FiscalYear
  const m = /^(?:fy)?(\d{2}|\d{4})$/.exec(t)
  if (!m) return null
  const n = +m[1]
  if (m[1].length === 4) return n >= 2000 && n <= 2099 ? (`FY${m[1].slice(2)}` as FiscalYear) : null
  return `FY${m[1]}` as FiscalYear
}

export function coerceFiscalYear(v: unknown): Coerced<FiscalYear> {
  if (isBlank(v)) return NONE
  const fy = readFiscalYear(v)
  return fy ? ok(fy) : fail(`${quote(v)} is not a fiscal year such as FY28.`, 'unknown-value')
}

/**
 * An assumption value: a number in its table's unit. A percent sign makes it a fraction (3.5% is
 * 0.035), amounts may carry currency symbols and k or m, and a date is stored as the number
 * YYYYMMDD (merit and promotion dates).
 */
export function coerceAssumptionValue(v: unknown, order: DateOrder = 'MDY'): Coerced<number> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean') return fail(`${quote(v)} is not a number.`)
  if (!(v instanceof Date)) {
    const r = readNumber(v, true)
    if (r.value != null && Number.isFinite(r.value)) return ok(r.percent ? r.value / 100 : r.value)
  }
  const d = readDate(v, order)
  if (d.ok) return ok(d.parts.y * 10_000 + d.parts.m * 100 + d.parts.d)
  return fail(`${quote(v)} is not a number.`)
}

/* ───────────── dispatch ───────────── */

/** Per-column settings resolved before rows are coerced. */
export interface ColumnSettings {
  dateOrder: DateOrder
  percentWhole: boolean
  /** Manual corrections: normalized raw → canonical (null = leave blank). */
  valueMap?: Record<string, string | null>
}

/** Coerce one cell for a field. */
export function coerceValue(
  dataset: DatasetKey,
  field: FieldDef,
  v: unknown,
  col: ColumnSettings,
): Coerced<unknown> {
  if (col.valueMap && !isBlank(v) && !Array.isArray(v)) {
    const t = normText(v)
    if (Object.hasOwn(col.valueMap, t)) {
      // A manual correction is a value in the app's own words ("Yes", "P4", "Open"): read it
      // through the field type like any cell, so it is stored as a boolean, number or canonical
      // spelling rather than as raw text.
      const fixed = col.valueMap[t]
      if (fixed == null || isBlank(fixed)) return NONE
      const c = coerceValue(dataset, field, fixed, { ...col, valueMap: undefined })
      return c.value == null && c.issue
        ? { ...c, issue: `Your correction ${c.issue[0].toLowerCase()}${c.issue.slice(1)}` }
        : c
    }
  }
  const ref = `${dataset}.${field.key}`
  const share = SHARE_FIELDS[ref]
  if (share) return coerceShare(v, share.label, share.min)
  if (ref === 'targets.fiscalYear') return coerceFiscalYear(v)
  if (ref === 'assumptions.value') return coerceAssumptionValue(v, col.dateOrder)
  switch (field.type) {
    case 'date':
      return coerceDate(v, col.dateOrder)
    case 'datetime':
      return coerceDateTime(v, col.dateOrder)
    case 'number':
      return coerceNumber(v)
    case 'money':
      return coerceMoney(v)
    case 'percent':
      return coercePercent(v, col.percentWhole)
    case 'boolean':
      return coerceBoolean(v)
    case 'level':
      return coerceLevel(v)
    case 'id':
      return coerceId(v)
    case 'steps':
      return coerceSteps(v)
    case 'enum': {
      if (isBlank(v)) return NONE
      const value = normalizeEnumValue(dataset, field.key, field.values ?? [], v)
      if (value != null) return ok(value)
      const allowed = (field.values ?? []).join(', ')
      return fail(
        `${quote(v)} is not a recognized ${field.label.toLowerCase()}${allowed ? ` (${allowed})` : ''}.`,
        'unknown-value',
      )
    }
    case 'string': {
      const s = coerceString(v)
      if (s.value == null) return s
      return ok(canonicalText(dataset, field.key, s.value) ?? s.value)
    }
  }
}
