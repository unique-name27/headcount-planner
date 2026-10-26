/**
 * Month close and actuals (docs/PLAN.md 6.6 and 7.3a). Built by engines A in M1. Pure.
 *
 * Closing a month (Finance) snapshots HRIS actuals per assignment: heads, FTE and cost components from
 * HRIS pay at that moment ("Actual (HRIS estimate)"), at the month's actual rate. Closed months are
 * read from closes, never recomputed. Each close stores the cost-atom index (`atomIndex` in
 * src/cost/atoms.ts) that every rounded figure reads until the next close.
 *
 * A back-dated change (a hire, exit, comp row, FTE or leave change effective in a closed month) posts
 * as an adjustment in the first open month. `kind` is 'hire', 'exit' or 'other' (pay, comp, FTE and
 * leave changes are all 'other'); `reason` is generated from the kind and never names leave.
 *
 * Readings kept here (engines A, M1):
 *  - A close also snapshots the one-time items booked in its month (15.2 C32, lead decision D-CLOSE):
 *    sign-on and relocation in the start month, the agency fee in the offer-accepted month, severance
 *    in the month containing endDate + 1 (6.3), at the month's actual rate, each as a one-time line
 *    of its own (heads, FTE, active and the recurring amounts 0). They come from cost.ts on the same
 *    rules as the plan's lines (`monthLine` on a context read as known at the month's end), so the
 *    forecast's closed months carry them and its loaded cost is on the comparison's basis. A line's
 *    `employeeId` is the person cost.ts books the item on (the hire who took the offer, the
 *    eliminated seat's last holder), or the req ID while the hire has not started. Sign-on, relocation
 *    and agency fees need `reqs` in the input; severance reads the positions alone.
 *  - A line is priced on the assignment's last active day in the month, at the position's row then
 *    (the worker's own level and location for an employee not in the plan), with the version's
 *    merit, promotion and loads.
 *  - Heads: an employee counts 1 at the month's end on one line only (the assignment active then
 *    that started last); every other line of theirs has heads 0.
 *  - The leave state is the workers row's at the close: unpaid when `onLeave` and `leavePaid` is
 *    false, paid when `onLeave` otherwise, else none.
 *  - An adjustment compares a closed month's stored lines plus the adjustments already posted for it
 *    with the month recomputed, per employee: nothing posts when they agree (to half a cent, and on
 *    heads, FTE and the active fraction). A change in the paid-leave flag alone moves no amount and
 *    posts nothing. When an ID is already taken by an earlier adjustment for a change that has moved
 *    again, the new one takes the ID with '-2', '-3', ... added.
 */
import { atomIndex } from '@/cost/atoms'
import { fiscalYearOf, monthEnd, monthStart, shiftMonth } from '@/data/fiscal'
import {
  type CompRow,
  type ISODate,
  type ISODateTime,
  type Level,
  type Month,
  type PositionRow,
  type ReqRow,
  siteByLocation,
  type WorkerRow,
} from '@/data/schema'
import { formatDate, formatMonth } from '@/lib/dates'
import { sha256 } from '@/lib/sha256'
import { canonicalJson } from '../canonical'
import type {
  ActualLine,
  Adjustment,
  AdjustmentKind,
  AdjustmentReason,
  AssumptionRow,
  FxTable,
  LeaveState,
  MonthClose,
} from '../types'
import {
  assumptionLookup,
  burdenComponents,
  meritRules,
  type OrgPath,
  promotionRules,
  type StandardLoads,
  standardLoads,
} from './assumptions'
import {
  annualLocal,
  hrisRate,
  lineContext,
  type MeritRule,
  oneTimeMonthLine,
  type PromotionRule,
} from './cost'
import { rateOf } from './fx'
import { isActiveOn, toAssignments } from './heads'
import { actualLineRows, toActualLineTable } from './lineTable'
import { activeFraction } from './proration'
import { rowOn, toPosition } from './versions'

/** The generated reason of each adjustment kind (docs/PLAN.md 6.6). Data, part of the contract. */
export const ADJUSTMENT_REASON: Readonly<Record<AdjustmentKind, AdjustmentReason>> = {
  hire: 'Back-dated hire',
  exit: 'Back-dated exit',
  other: 'Other HRIS change',
}

/** What a month's actuals are computed from: the datasets as they stand at the close. */
export interface ActualsInput {
  month: Month
  positions: readonly PositionRow[]
  workers: readonly WorkerRow[]
  comp: readonly CompRow[]
  /** The version's assumptions (loads, merit, promotion) used to cost HRIS pay. */
  assumptions: readonly AssumptionRow[]
  versionId: string
  versionName: string
  /** Rates with the month's actual rate for every currency paid. */
  rates: FxTable
  /** Leader seats marked in Lists, for the close's atom index. */
  listedLeaders?: ReadonlySet<string>
  /**
   * Reqs, for the one-time items an offer books in the month (sign-on, relocation, agency fee; 15.2
   * C32). Without them a close books severance only. An addition to the contract.
   */
  reqs?: readonly ReqRow[]
  /** What the one-time items are read as known on; default the month's last day. An addition to the contract. */
  asOf?: ISODate
}

const leaveOf = (w: WorkerRow): LeaveState =>
  w.onLeave ? (w.leavePaid === false ? 'unpaid' : 'paid') : 'none'

/**
 * One line per Employee assignment active in the month (not-in-plan employees included, with a null
 * positionId): heads at the month's end, FTE, the daily active fraction, and cost from HRIS pay at the
 * actual rate. Unpaid leave (onLeave and not leavePaid on the workers row) sets the pay components to
 * 0 and `leave` 'unpaid'; the line stays. Then one one-time line per item booked in the month
 * (`oneTimeActuals`, 15.2 C32).
 */
export function actualLines(input: ActualsInput): ActualLine[] {
  const { month } = input
  const first = monthStart(month)
  const last = monthEnd(month)
  const lookup = assumptionLookup(input.assumptions, { versionId: input.versionId, name: input.versionName })
  const fundingYear = fiscalYearOf(month)

  const rows = new Map<string, PositionRow[]>()
  for (const r of input.positions) {
    const list = rows.get(r.positionId)
    if (list) list.push(r)
    else rows.set(r.positionId, [r])
  }
  const comp = new Map<string, CompRow[]>()
  for (const c of input.comp) {
    const list = comp.get(c.employeeId)
    if (list) list.push(c)
    else comp.set(c.employeeId, [c])
  }

  const assignments = toAssignments(input.workers)
  // The one line per employee that carries the head: the active assignment at month end that started last.
  const headOf = new Map<string, number>()
  assignments.forEach((a, i) => {
    if (a.workerType !== 'Employee' || !isActiveOn(a, last)) return
    const seen = headOf.get(a.employeeId)
    if (seen === undefined || a.start >= assignments[seen].start) headOf.set(a.employeeId, i)
  })

  // Rules and loads by org (and level and country), read once each: the same values for every
  // assignment priced there.
  const rulesByOrg = new Map<string, { merit: MeritRule[]; promotion: PromotionRule[] }>()
  const rulesOf = (org: OrgPath) => {
    const key = `${org.businessUnit}\u0000${org.department ?? ''}`
    let r = rulesByOrg.get(key)
    if (!r) {
      r = { merit: meritRules(lookup, org), promotion: promotionRules(lookup, org) }
      rulesByOrg.set(key, r)
    }
    return r
  }
  const loadsByKey = new Map<string, StandardLoads>()
  const loadsOf = (level: Level | null, country: string, org: OrgPath): StandardLoads => {
    const key = `${level ?? ''}\u0000${country}\u0000${org.businessUnit}\u0000${org.department ?? ''}`
    let std = loadsByKey.get(key)
    if (!std) {
      std = level
        ? standardLoads(level, country, fundingYear, org, lookup)
        : {
            bonusTarget: 0,
            bonusFunding: lookup.num('bonusFunding', [fundingYear], org) ?? 1,
            burden: burdenComponents(country, org, lookup),
            benefits: lookup.num('benefits', [country], org) ?? 0,
            equityUsd: 0,
          }
      loadsByKey.set(key, std)
    }
    return std
  }

  const out: ActualLine[] = []
  assignments.forEach((a, i) => {
    if (a.workerType !== 'Employee' || a.start > last || (a.end != null && a.end < first)) return
    const w = input.workers[i]
    const priceDay = a.end != null && a.end < last ? a.end : last
    const row = a.positionId ? rowOn(rows.get(a.positionId) ?? [], priceDay) : null
    const level: Level | null = row?.level ?? w.level ?? null
    const location = row?.location ?? w.location ?? null
    const org: OrgPath = row
      ? { businessUnit: row.businessUnit, department: row.department ?? null }
      : { businessUnit: w.businessUnit ?? '', department: w.department ?? null }
    const site = location ? siteByLocation.get(location) : undefined
    const country = site?.country ?? location ?? ''
    const rules = rulesOf(org)
    const pay = hrisRate({
      comp: comp.get(a.employeeId) ?? [],
      hireDate: w.hireDate,
      on: priceDay,
      merit: rules.merit,
      promotion: rules.promotion,
      defaultCurrency: site?.currency ?? 'USD',
    })
    const std: StandardLoads = loadsOf(level, country, org)
    const leave = leaveOf(w)
    const unpaid = leave === 'unpaid'
    const active = activeFraction('daily', month, a.start, a.end)
    const currency = pay?.currency ?? site?.currency ?? 'USD'
    const annual = pay
      ? annualLocal({
          rate: pay.rate,
          fte: a.fte,
          bonusTarget: pay.targetBonusPct ?? std.bonusTarget,
          bonusFunding: std.bonusFunding,
          burden: std.burden,
          benefits: std.benefits,
        })
      : null
    const f = annual && !unpaid ? active / 12 : 0
    const local = {
      base: annual ? annual.base * f : 0,
      bonus: annual ? annual.bonus * f : 0,
      burden: annual ? annual.burden * f : 0,
      benefits: annual ? annual.benefits * f : 0,
      oneTime: 0,
      vacancy: 0,
    }
    const needed = local.base !== 0 || local.bonus !== 0 || local.burden !== 0 || local.benefits !== 0
    const found = rateOf(input.rates, currency, 'actual', month)
    if (found == null && needed) throw new Error(`No actual rate for ${currency} in ${month}.`)
    const rate = found ?? 0
    const usd = {
      base: local.base * rate,
      bonus: local.bonus * rate,
      burden: local.burden * rate,
      benefits: local.benefits * rate,
      oneTime: 0,
      vacancy: 0,
      equity: unpaid ? 0 : ((std.equityUsd * a.fte) / 12) * active,
      loaded: 0,
    }
    usd.loaded = usd.base + usd.bonus + usd.burden + usd.benefits + usd.oneTime
    out.push({
      employeeId: a.employeeId,
      positionId: a.positionId,
      month,
      heads: headOf.get(a.employeeId) === i ? 1 : 0,
      fte: a.fte,
      active,
      currency,
      rate,
      local,
      usd,
      leave,
    })
  })
  for (const l of oneTimeActuals(input)) out.push(l)
  return out
}

/**
 * The one-time items booked in the month (15.2 C32), as one-time lines at the month's actual rate:
 * cost.ts `monthLine` for every seat on a context read as known on `asOf` (default the month's last
 * day), with the actual rate set, keeping each line's one-time part. An addition to the contract.
 */
export function oneTimeActuals(input: ActualsInput): ActualLine[] {
  const { month } = input
  const ctx = lineContext({
    version: {
      versionId: input.versionId,
      name: input.versionName,
      fiscalYear: fiscalYearOf(month),
      grid: { from: month, to: month },
      proration: 'daily',
    },
    asOf: input.asOf ?? monthEnd(month),
    positions: input.positions,
    workers: input.workers,
    comp: input.comp,
    reqs: input.reqs ?? [],
    requests: [],
    assumptions: input.assumptions,
    rates: { table: input.rates, use: 'actual-forecast', closedThrough: month },
    vacancyAllowance: false,
  })
  const out: ActualLine[] = []
  for (const positionId of ctx.positionIds) {
    const rows = ctx.rowsOf(positionId)
    if (rows.length === 0) continue
    for (const l of oneTimeMonthLine(toPosition(rows[0]), month, ctx)) {
      if (l.local.oneTime === 0) continue
      const usd = l.usd.oneTime
      out.push({
        employeeId: l.holderId ?? positionId,
        positionId,
        month,
        heads: 0,
        fte: 0,
        active: 0,
        currency: l.currency,
        rate: l.rate,
        local: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: l.local.oneTime, vacancy: 0 },
        usd: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: usd, vacancy: 0, equity: 0, loaded: usd },
        leave: 'none',
      })
    }
  }
  return out
}

/**
 * 'sha256-<hex>' over the canonical JSON of a close without `hash` (its month, closedAt, by, lines and
 * atom index). An addition to the contract, so the store and workspace files can check a close.
 */
export function closeHash(close: Omit<MonthClose, 'hash'>): string {
  return `sha256-${sha256(
    canonicalJson({
      month: close.month,
      closedAt: close.closedAt,
      by: close.by,
      lines: close.lines,
      atoms: close.atoms,
    }),
  )}`
}

/** True when a close's stored hash still matches its content. An addition to the contract. */
export const verifyClose = (close: MonthClose): boolean => close.hash === closeHash(close)

/**
 * Closes a month: its actual lines as a table, the atom index at the month's end, and
 * 'sha256-<hex>' over the canonical JSON of the close without `hash`.
 */
export function closeMonth(input: ActualsInput, at: ISODateTime, by: string): MonthClose {
  const body = {
    month: input.month,
    closedAt: at,
    by,
    lines: toActualLineTable(actualLines(input)),
    atoms: atomIndex(input.positions, monthEnd(input.month), input.listedLeaders),
  }
  return { ...body, hash: closeHash(body) }
}

/**
 * A month closes only once the as-of date is on or after its month-end (15.1 R47, browser B8): the
 * refusal ("Oct 2026 closes once the data is as of 31 Oct 2026 or later."), or null when it may
 * close. The closeMonth action refuses with it and Finance > Versions shows it beside the disabled
 * button. An addition to the contract.
 */
export function closeTooEarlyText(month: Month, asOf: ISODate): string | null {
  const end = monthEnd(month)
  return asOf >= end ? null : `${formatMonth(end)} closes once the data is as of ${formatDate(end)} or later.`
}

/** The last closed month (the latest close), or null before the first close. */
export function closedThrough(closes: readonly MonthClose[]): Month | null {
  let last: Month | null = null
  for (const c of closes) if (last === null || c.month > last) last = c.month
  return last
}

/** The latest close's month-end, which `periodWindow`'s `closedThrough` takes; null before the first close. */
export function lastCloseDate(closes: readonly MonthClose[]): ISODate | null {
  const m = closedThrough(closes)
  return m === null ? null : monthEnd(m)
}

/**
 * The first month after the last close (the month adjustments post in); the grid's first month before
 * any close. A grid that starts after that month (FY28's, while FY27 closes) reads its own first
 * month: no month before a grid is open in it.
 */
export function firstOpenMonth(closes: readonly MonthClose[], gridFrom: Month): Month {
  const m = closedThrough(closes)
  if (m === null) return gridFrom
  const next = shiftMonth(m, 1)
  return next > gridFrom ? next : gridFrom
}

/** One employee's lines in a month, added up. */
interface Sum {
  positionId: string | null
  currency: string
  rate: number
  leave: LeaveState
  heads: number
  fte: number
  active: number
  local: ActualLine['local']
  usd: ActualLine['usd']
}

const zeroSum = (): Sum => ({
  positionId: null,
  currency: 'USD',
  rate: 0,
  leave: 'none',
  heads: 0,
  fte: 0,
  active: 0,
  local: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
  usd: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0, equity: 0, loaded: 0 },
})

const LOCAL_KEYS = ['base', 'bonus', 'burden', 'benefits', 'oneTime', 'vacancy'] as const
const USD_KEYS = ['base', 'bonus', 'burden', 'benefits', 'oneTime', 'vacancy', 'equity', 'loaded'] as const

/** Adds a line (or a delta, with sign) into a sum. */
function addInto(s: Sum, l: Omit<ActualLine, 'employeeId' | 'month'>, sign = 1, first = false): void {
  if (first || (s.positionId === null && l.positionId !== null) || l.heads > 0) s.positionId = l.positionId
  if (first) {
    s.currency = l.currency
    s.rate = l.rate
  }
  if (l.leave === 'unpaid' || (l.leave === 'paid' && s.leave === 'none')) s.leave = l.leave
  s.heads += sign * l.heads
  s.fte += sign * l.fte
  s.active += sign * l.active
  for (const k of LOCAL_KEYS) s.local[k] += sign * l.local[k]
  for (const k of USD_KEYS) s.usd[k] += sign * l.usd[k]
}

function sumsByEmployee(lines: Iterable<ActualLine>): Map<string, Sum> {
  const out = new Map<string, Sum>()
  for (const l of lines) {
    let s = out.get(l.employeeId)
    const first = !s
    if (!s) {
      s = zeroSum()
      out.set(l.employeeId, s)
    }
    addInto(s, l, 1, first)
  }
  return out
}

const NUM_EPS = 1e-9
const CENT_EPS = 0.005

/** Whether a sum holds anything: a head, an active day or an amount. */
const present = (s: Sum | undefined): boolean =>
  s !== undefined &&
  (Math.abs(s.heads) > NUM_EPS || Math.abs(s.active) > NUM_EPS || Math.abs(s.usd.loaded) > CENT_EPS)

/** Whether a sum holds a person in the month (a head or an active day), not only a one-time amount. */
const person = (s: Sum | undefined): boolean =>
  s !== undefined && (Math.abs(s.heads) > NUM_EPS || Math.abs(s.active) > NUM_EPS)

/**
 * Back-dated changes: for each closed month, the difference between its stored lines and the same
 * month recomputed from today's data (`recompute`), per employee. A line that appears is a 'hire', a
 * line that disappears or ends earlier is an 'exit', any other difference (pay, comp, FTE, leave) is
 * 'other'. Each posts in `postIn` with `delta` = recomputed − stored and `reason` from
 * ADJUSTMENT_REASON. Adjustments already posted (by `existing` id) are not posted again. IDs are
 * 'adj-<forMonth>-<employeeId>-<kind>'.
 *
 * "Stored" includes the adjustments already posted for that month and employee, so a change posted
 * once never posts again, and a change that moves again posts only the new difference.
 */
export function adjustmentsFor(
  closes: readonly MonthClose[],
  recompute: (month: Month) => readonly ActualLine[],
  postIn: Month,
  existing: readonly Adjustment[],
): Adjustment[] {
  const ids = new Set(existing.map((a) => a.id))
  const out: Adjustment[] = []
  const sorted = [...closes].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
  for (const close of sorted) {
    const stored = sumsByEmployee(actualLineRows(close.lines))
    for (const adj of existing) {
      if (adj.forMonth !== close.month) continue
      let s = stored.get(adj.delta.employeeId)
      const first = !s
      if (!s) {
        s = zeroSum()
        stored.set(adj.delta.employeeId, s)
      }
      addInto(s, adj.delta, 1, first)
    }
    const fresh = sumsByEmployee(recompute(close.month))
    const employees = [...new Set([...stored.keys(), ...fresh.keys()])].sort()
    for (const employeeId of employees) {
      const before = stored.get(employeeId)
      const after = fresh.get(employeeId)
      const had = present(before)
      const has = present(after)
      if (!had && !has) continue
      const a = after ?? zeroSum()
      const b = before ?? zeroSum()
      const d = zeroSum()
      d.heads = a.heads - b.heads
      d.fte = a.fte - b.fte
      d.active = a.active - b.active
      for (const k of LOCAL_KEYS) d.local[k] = a.local[k] - b.local[k]
      for (const k of USD_KEYS) d.usd[k] = a.usd[k] - b.usd[k]
      const moved =
        Math.abs(d.heads) > NUM_EPS ||
        Math.abs(d.fte) > NUM_EPS ||
        Math.abs(d.active) > NUM_EPS ||
        LOCAL_KEYS.some((k) => Math.abs(d.local[k]) > CENT_EPS) ||
        USD_KEYS.some((k) => Math.abs(d.usd[k]) > CENT_EPS)
      if (!moved) continue
      // A one-time item that appears, moves or goes (no head or active day either side) is 'other'.
      const kind: AdjustmentKind =
        !person(before) && person(after)
          ? 'hire'
          : person(before) && !person(after)
            ? 'exit'
            : d.active < -NUM_EPS
              ? 'exit'
              : d.active > NUM_EPS
                ? 'hire'
                : 'other'
      const base = `adj-${close.month}-${employeeId}-${kind}`
      let id = base
      for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
      ids.add(id)
      const source = after ?? before ?? zeroSum()
      out.push({
        id,
        postedIn: postIn,
        forMonth: close.month,
        positionId: source.positionId,
        kind,
        delta: {
          employeeId,
          positionId: source.positionId,
          month: close.month,
          heads: d.heads,
          fte: d.fte,
          active: d.active,
          currency: source.currency,
          rate: source.rate,
          local: d.local,
          usd: d.usd,
          leave: after?.leave ?? 'none',
        },
        reason: ADJUSTMENT_REASON[kind],
      })
    }
  }
  return out
}
