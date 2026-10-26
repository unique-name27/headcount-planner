/**
 * Documented defaults: how the importer fills or reads blanks, and the few corrections it makes
 * on its own. Headcount Planner's engines read most blanks themselves ("FTE blank is 1", "legal
 * entity blank reads the location's"), so the importer keeps those blanks as they are and the list
 * below says how they are read. It fills a value only where a required field would otherwise lose
 * the row (a blank worker type is an Employee, logged). Corrections that change a value (a negative
 * amount left blank, an assumption key rewritten in the standard form, a position that reports to
 * itself) are always written to the exceptions log or the sheet's summary.
 */
import {
  ASSUMPTION_ANY_KEY,
  ASSUMPTION_KEY_SEP,
  ASSUMPTION_KEYS,
  type AssumptionDim,
  type AssumptionTable,
  type DatasetKey,
  FX_SETS,
  SITES,
  splitAssumptionKey,
  type WorkerRow,
} from '../schema'
import { canonicalLocation, normalizeCurrency } from './canonical'
import { readDate } from './dates'
import { readFiscalYear } from './normalize'
import { normText } from './text'
import type { IssueAction, IssueCode } from './types'
import { matchCanonical, normalizeLevel } from './vocab'

export const DEFAULT_HOURS_PER_YEAR = 2080

/** Plain-English list of the defaults, for the Data room's "How gaps are filled" note. */
export const DOCUMENTED_DEFAULTS: Record<DatasetKey, string[]> = {
  positions: [
    'Levels such as IC4, L4, Senior or Director are read as P1 to P6, M1, M2 and E1 to E3.',
    'Worker type blank: read as an Employee seat.',
    'FTE blank: read as 1 (full time). An FTE written as 80 or 80% is read as 0.8.',
    'Legal entity blank: read from the location.',
    'Opened date blank: worked out from reqs and exits.',
    `Leader seat blank: a leader seat when the level is Director (M2) or above, unless the Levels list says otherwise.`,
    'A position that reports to itself: its manager position is cleared, and the log says so.',
  ],
  workers: [
    'Worker type blank: treated as Employee, and the log says so.',
    'Assignment start blank: read as the hire date.',
    'FTE blank: read as 1 (full time). An FTE written as 80 or 80% is read as 0.8.',
    'Leave paid blank: read as paid.',
    'Manager given as a name: matched to a unique person in the file.',
  ],
  comp: [
    'Currency blank: read as the currency of the person’s location.',
    'Target bonus written as 10 or 10% is read as 0.1.',
    'Hourly pay: annualized at 2,080 hours when a pay basis column says hourly, or when the base reads like an hourly rate and no basis column exists.',
  ],
  reqs: [
    'Hiring manager given as a name: matched to a unique person in Workers.',
    'Offer currency blank: read as the currency of the seat’s location.',
    'An offer base, sign-on bonus, relocation or agency fee below zero: left blank.',
  ],
  requests: [
    'Steps written as "Manager E10234 Approved 2026-08-03; HRBP E10077 Pending" are read one step per part.',
    'Requester, submitter or moving person given as a name: matched to a unique person in Workers.',
    'FTE blank: read as 1. Confidential and freeze exception blank: read as No.',
  ],
  targets: [
    'Fiscal year written as FY28, FY 2028 or 2027/28 is read as FY28.',
    'Target date blank: the fiscal year’s last day (31 Mar).',
    'Department, cost center and leader position blank: the target is for the whole unit or department.',
    'Target heads or target cost below zero: left blank, so a row without target heads is skipped.',
  ],
  freezes: [
    'End date blank: the freeze is open-ended.',
    'Backfills allowed blank: read as No.',
    'Department, cost center and leader position blank: the whole unit or department is frozen.',
  ],
  assumptions: [
    'Org blank: the company’s value; a business unit or department overrides it.',
    'Key blank on a table set by org alone: read as *.',
    'Keys are rewritten in the standard form: levels as P1 to P6, M1, M2 and E1 to E3, sites by their names, currencies as ISO codes, months as YYYY-MM and fiscal years as FY27.',
    'A key with the wrong number of parts for its table, or a part that does not read, is kept and logged.',
    'Values written as percentages (3.5%) are read as fractions; dates are stored as YYYYMMDD.',
  ],
}

/** How a default is reported. */
export type FillMode = 'silent' | 'logged' | 'logged-if-unmapped'

export interface RowFill {
  rec: Record<string, unknown>
  raw: Record<string, unknown>
  /** Fill `key` when it is blank. `what` completes "…, so it was ___" in the log. */
  fill: (key: string, value: unknown, mode?: FillMode, what?: string) => void
  /** Log something about this row's `key` without filling it. */
  note: (key: string, issue: string, code: IssueCode, action: IssueAction) => void
  /**
   * Count a conversion made on this row, reported once for the sheet ("Assumption keys were
   * rewritten in the standard form on 412 rows."). `what` is that sentence's subject and verb.
   */
  tally?: (key: string, what: string) => void
}

export interface SheetContext {
  /** Headers holding first and last names, when the name field itself is unmapped. */
  nameParts: [string, string] | null
  /** The loaded workers, by employee ID (the latest row of each). */
  roster: ReadonlyMap<string, WorkerRow> | null
  hourly: { hours: number; basisHeader: string | null } | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

function composeName(ctx: SheetContext, raw: Record<string, unknown>): string | null {
  if (!ctx.nameParts) return null
  const [f, l] = ctx.nameParts
  const name = [raw[f], raw[l]]
    .filter((x) => x != null && String(x).trim())
    .map((x) => String(x).trim())
    .join(' ')
  return name || null
}

const fmt0 = (n: number) => Math.round(n).toLocaleString('en-US')

/** Amount fields that are never below zero; a negative one is left blank and logged. */
const NON_NEGATIVE: Partial<Record<DatasetKey, readonly string[]>> = {
  reqs: ['offerBase', 'signOnBonus', 'relocation', 'agencyFee'],
  targets: ['targetHeads', 'targetCost'],
  comp: ['baseSalary'],
}

/** Dataset-specific defaults and corrections for one row. */
export function fillDefaults(dataset: DatasetKey, r: RowFill, ctx: SheetContext): void {
  const { rec, fill } = r
  for (const key of NON_NEGATIVE[dataset] ?? []) {
    const n = rec[key]
    if (typeof n === 'number' && n < 0) {
      r.note(key, `${labelOf(key)} ${n} is below zero, so it was left blank.`, 'out-of-range', 'left-blank')
      rec[key] = null
    }
  }
  switch (dataset) {
    case 'positions':
      if (str(rec.managerPositionId) && rec.managerPositionId === rec.positionId) {
        r.note(
          'managerPositionId',
          'The position reports to itself, so its manager position was cleared.',
          'manager-self',
          'cleared',
        )
        rec.managerPositionId = null
      }
      return
    case 'workers':
      fill('name', composeName(ctx, r.raw))
      fill('workerType', 'Employee', 'logged', 'treated as Employee')
      return
    case 'comp':
      fillComp(r, ctx)
      return
    case 'reqs':
    case 'requests':
    case 'targets':
    case 'freezes':
      return
    case 'assumptions':
      fillAssumption(r)
      return
  }
}

const LABELS: Record<string, string> = {
  offerBase: 'Offer base',
  signOnBonus: 'Sign-on bonus',
  relocation: 'Relocation',
  agencyFee: 'Agency fee',
  targetHeads: 'Target heads',
  targetCost: 'Target cost',
  baseSalary: 'Base salary',
}
const labelOf = (key: string) => LABELS[key] ?? key

function fillComp(r: RowFill, ctx: SheetContext): void {
  const { rec } = r
  const hourly = ctx.hourly
  const base = rec.baseSalary
  if (!hourly || typeof base !== 'number') return
  const basis = hourly.basisHeader ? normText(r.raw[hourly.basisHeader]) : null
  const isHourly = hourly.basisHeader ? !!basis && basis.startsWith('hour') : base < 1000
  if (!isHourly) return
  rec.baseSalary = Math.round(base * hourly.hours * 100) / 100
  r.note(
    'baseSalary',
    `Hourly rate ${base} annualized to ${fmt0(rec.baseSalary as number)} (${fmt0(hourly.hours)} hours a year).`,
    'converted',
    'converted',
  )
}

/* ───────────── assumption keys ───────────── */

const COUNTRIES = [...new Set(SITES.map((s) => s.country))]
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

/** A month as YYYY-MM from "2026-09", "2026-9", "Sep 2026", "09/2026" or a full date. */
export function readMonthKey(raw: string): string | null {
  const s = raw.trim()
  let m = /^(\d{4})[-/.](\d{1,2})$/.exec(s)
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(s)
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`
  m = /^([a-z]{3,9})\.?[-\s/]+(\d{4})$/i.exec(s)
  const month = m ? MONTHS[m[1].slice(0, 3).toLowerCase()] : undefined
  if (m && month) return `${m[2]}-${String(month).padStart(2, '0')}`
  const d = readDate(s, 'MDY')
  return d.ok ? `${d.parts.y}-${String(d.parts.m).padStart(2, '0')}` : null
}

/** One part of an assumption key in the standard form, or null when it does not read. */
function keyPart(dim: AssumptionDim, raw: string, parts: readonly string[] | null): string | null {
  if (raw === ASSUMPTION_ANY_KEY) return raw
  switch (dim) {
    case 'level':
      return normalizeLevel(raw)
    case 'zone':
    case 'location':
      return canonicalLocation(raw) ?? (raw.trim() || null)
    case 'fiscalYear':
      return readFiscalYear(raw)
    case 'country':
      return matchCanonical(COUNTRIES, normText(raw)) ?? (raw.trim() || null)
    case 'currency':
      return normalizeCurrency(raw)
    case 'set':
      return matchCanonical(FX_SETS, normText(raw))
    case 'month':
      return readMonthKey(raw)
    case 'part':
      return parts ? matchCanonical(parts, normText(raw)) : null
    case 'component':
    case 'dimension':
      return raw.trim() || null
  }
}

export interface AssumptionKeyRead {
  /** The key in the standard form; the key as written when it does not read. */
  key: string
  /** Why the key does not read, or null when it does. */
  problem: string | null
}

/**
 * An assumption key in its table's standard form: each pipe-joined part read for its dimension
 * ('L4 | munich | fy 27' is 'P4|Munich|FY27' for the band table). A table keyed by org alone takes
 * '*'. The key comes back as written, with the reason, when it has the wrong number of parts or a
 * part does not read.
 */
export function readAssumptionKey(table: AssumptionTable, key: string): AssumptionKeyRead {
  const def = ASSUMPTION_KEYS[table]
  const raw = splitAssumptionKey(key)
  if (!def.dims.length)
    return raw.length === 1 && raw[0] === ASSUMPTION_ANY_KEY
      ? { key: ASSUMPTION_ANY_KEY, problem: null }
      : { key, problem: `${def.label} is set by org alone, so its key is ${ASSUMPTION_ANY_KEY}.` }
  const partNames = def.parts ? Object.keys(def.parts) : null
  // A table keyed by a part: the part names any further dimensions it has.
  const partAt = def.dims.indexOf('part')
  const part = partAt >= 0 && partNames ? matchCanonical(partNames, normText(raw[partAt] ?? '')) : null
  const dims: AssumptionDim[] = [...def.dims, ...(part && def.parts ? def.parts[part].dims : [])]
  if (raw.length !== dims.length)
    return {
      key,
      problem: `A ${def.label.toLowerCase()} key has ${dims.length} ${dims.length === 1 ? 'part' : 'parts'} (${dims.join(ASSUMPTION_KEY_SEP)}), not ${raw.length}.`,
    }
  const out: string[] = []
  for (let i = 0; i < dims.length; i++) {
    const p = keyPart(dims[i], raw[i], partNames)
    if (p == null) return { key, problem: `"${raw[i]}" is not a ${dims[i]} this key can use.` }
    out.push(p)
  }
  return { key: out.join(ASSUMPTION_KEY_SEP), problem: null }
}

function fillAssumption(r: RowFill): void {
  const { rec } = r
  const table = rec.table as AssumptionTable | null
  if (!table || !Object.hasOwn(ASSUMPTION_KEYS, table)) return
  if (!ASSUMPTION_KEYS[table].dims.length) r.fill('key', ASSUMPTION_ANY_KEY, 'silent')
  const key = str(rec.key)
  if (!key) return
  const read = readAssumptionKey(table, key)
  if (read.problem) {
    r.note('key', `${read.problem} The key was kept as written.`, 'unknown-value', 'kept')
    return
  }
  if (read.key !== key) {
    rec.key = read.key
    r.tally?.('key', 'assumption keys were rewritten in the standard form')
  }
}
