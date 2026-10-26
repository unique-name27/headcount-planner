/**
 * The cost guard (docs/PLAN.md 7): every cost amount any reader sees (a tile, chart, table, export,
 * workspace file, calculation card or help text) is built here, in the engines' model builders,
 * before the UI reads it. The UI never decides privacy on its own.
 *
 * The rules, in every mode (7.2):
 *  1. Minimum: every amount needs `rules.minCosted` (5) costed people over its own version and
 *     window, else it reads "—" with `hiddenNote`. The component split (base, bonus, burden,
 *     benefits, one-time, vacancy, equity) shows only on unit and company figures, and only when the
 *     figure's window passes `componentGate` in every unit it covers (lead decision D-FIN (b), PLAN
 *     change C33; reviews RF-1 and RF-2): otherwise the figure shows loaded cost only
 *     (`componentsHidden`). Leave never changes who is costed: nothing here reads `onLeave` or
 *     `leavePaid`, and given the lines' paid twins the gate counts component contributors at
 *     leave-neutral prices (`ComponentGateInput.paidLineOf`, C26, R44).
 *  2. Fold: groups under the minimum fold into "Other (k)" (./fold.ts).
 *  3. Band apart: Open and Planned seats at band estimate are the band part ("Open and Planned at
 *     band estimate"), never added into a filled total under the minimum; in rounded modes the filled
 *     part and the band part are separate rounding parts, added only by `sumRounded`.
 *  4. Per position: outside 'open', nothing tied to one Filled seat, accepted offer or request person.
 *  5. Differences: ./differences.ts.
 *  6. Text: no amount in an item, toast, finding title or comment outside its audience.
 *
 * By mode (`GuardMode`, from src/access/pay.ts `guardModeIn`): 'none' (Manager: no amount at all),
 * 'rounded' (HRBP, Leader: per cost atom, the last close's index, $0.1M down per part from
 * `rules.floorUsd`, atoms under the minimum left out, rows only for whole unions of atoms; 7.3),
 * 'exact' (Finance, and HR admin with the switch off: 5 or more, one cost-center fold per unit; 7.4,
 * 7.5), 'open' (HR admin with the switch on: per-person amounts, exact totals, no minimum).
 *
 * Every threshold and step comes from `rules` (src/metrics/costGuard.ts `costGuardOf(ctx.metrics)`,
 * the locked, raise-only `cost.guard.*` entries), never a constant.
 *
 * How a model builder uses it: `costMembers` over the figure's lines and window (Finance also builds
 * the units' folds once per version and as-of date with `financeFolds` over the version's grid),
 * then `guardModel` with the mode, the rules, the folds and `costFit`'s reason; tiles, charts,
 * tables, exports and calculation cards all read the one `GuardedFigure`.
 *
 * Readings taken here (cost guard builder, M2):
 *  - Costed people (7.2 rule 1) are the holder IDs of a member's 'hris' and 'offer' lines with an
 *    active fraction above 0 (employee IDs and accepted offers' req IDs). Band-basis lines (an Open or
 *    Planned seat, and also a holder with no comp row or an offer with no `offerBase`, which are
 *    costed at band) are the band part and bring nobody, as the contract's `CostMember.people` says.
 *    Allowance lines (vacancy) and severance lines are in the filled part and bring nobody either.
 *  - A member's currency is its last line's in month order. A forecast cohort line (positionId '') is
 *    filed under its cohort key ('cohort:<unit>|<currency>'), so the caller's `seatOf` places it.
 *  - `hidden` means every filled amount is null: under the minimum, a row that is not a whole union
 *    of atoms (rounded) or of shown cost centers (exact), the mode, or the fit; `reason` says which.
 *    `componentsHidden` means the loaded amount shows and the components do not: by the component rule
 *    in exact modes (reason `componentsHiddenNote`), and always in rounded modes, which show loaded
 *    cost only (reason null there: the components are a Finance surface, `SHOWS_IN_FINANCE_NOTE`).
 *  - Per head is the filled part's loaded cost over its costed people (rounded: `perHeadOfRounded`
 *    of the rounded filled part), never with the band part, which brings nobody.
 *  - In rounded modes every row, the total and `costRow` itself leave out atoms under the minimum
 *    (counted over the row's own members, the same set when the row is a union), so a row never adds a
 *    small atom's part; members with no atom are left out too. The band line is the atoms' band parts,
 *    rounded on their own and added with `sumRounded`.
 *  - In exact modes with the units' folds, a unit whose one Other would hold 1 to 4 costed people
 *    (the whole unit is under the minimum in some month of the grid) is left out of every total, the
 *    template app's `wholeUnits` for Finance; a filter's share of a unit (`partial`) keeps only the
 *    unit's shown cost centers. Both say "n people in cost centers under 5 are left out".
 *  - Exact breakdowns with folds: a member of a shown cost center goes to its group, a member of a
 *    unit's Other goes to Other unless the breakdown's key holds one value over the whole unit (then
 *    the group holds the whole unit, as a unit row does). A group that cuts a shown cost center shows
 *    heads only (`WHOLE_CENTERS_NOTE`); in rounded modes a group that cuts an atom does
 *    (`WHOLE_TEAMS_NOTE`). Rows that show amounts are ranked by what they show; `top` names only rows
 *    with an amount, and the rest join Other, which only ever holds whole cells.
 *  - The component split (C33, `componentGate`): a row or total shows it only when its filled
 *    members are whole units of the gate (every position of each unit it touches with a filled line
 *    in the window) and each of those units passes: every component has 0 or 5 or more contributing
 *    positions, and each capped burden component's split into the people below its cap and the
 *    people at or above it holds 0 or 5 or more people, in every month of the window and over the
 *    window as a whole (a person whose cap binds in only some months counts on both sides). A
 *    cost-center, country, legal-entity, currency, department or org row is never whole units (unless
 *    it holds the unit whole), so it shows loaded cost only. Without a gate (a caller that does not
 *    pass one) every exact row shows loaded cost only. So the split never gives a hire's sign-on
 *    between two selections (RF-2) and a capped burden never gives Σ min(base + bonus, cap) of 1 to 4
 *    people (RF-1); the classes of any shown split are unions of whole units' classes.
 *  - Component contributors are positions of the filled part with half a cent or more in the
 *    component over the cell (band seats' components are structure and never counted).
 *  - A member counts its costed people per line currency too (`costedByCurrency`), so Finance's fold
 *    keeps each currency's share of a unit's Other at 0 or 5 or more by the lines' own currencies,
 *    not by the first member's (review RF-5).
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md); bodies filled by the cost guard builder.
 * `expectGuarded` is the test helper PLAN 7.8 puts here: it throws an Error listing what broke (no
 * test library import, so app code can import this module).
 */
import type { Level, Month } from '@/data/schema'
import {
  addedStepsTo,
  isRoundedCostTo,
  perHeadOfRounded,
  roundCostTo,
  sumRoundedTo,
} from '@/lib/costRounding'
import type { CostGuardSettings } from '@/metrics/costGuard'
import type { CostBasis, PlanLine } from '@/plan/types'
import { type AtomIndex, atomOf } from './atoms'
import { NO_AMOUNTS_NOTE, WHOLE_CENTERS_NOTE, WHOLE_TEAMS_NOTE } from './fit'
import {
  type FinanceFold,
  type FoldCenter,
  financeFold,
  type Group,
  groupBy,
  guardGroups,
  NONE,
  OTHER,
  otherLabel,
  wholeParts,
} from './fold'

/** How the guard treats amounts in a mode (see the module comment). */
export type GuardMode = 'none' | 'exact' | 'rounded' | 'open'

/** The components of a cost amount; loaded is their sum less equity ("incl. SBC" adds equity apart). */
export const COST_COMPONENTS = [
  'base',
  'bonus',
  'burden',
  'benefits',
  'oneTime',
  'vacancy',
  'equity',
] as const
export type CostComponent = (typeof COST_COMPONENTS)[number]
/** Every amount field: the components and `loaded` (base + bonus + burden + benefits + oneTime + vacancy). */
export type CostField = CostComponent | 'loaded'
export const COST_FIELDS: readonly CostField[] = [...COST_COMPONENTS, 'loaded']

/** USD amounts per field. */
export type Amounts = Readonly<Record<CostField, number>>
/** USD amounts per field as shown: null where the guard hides it. */
export type ShownAmounts = Readonly<Record<CostField, number | null>>

/** Which rounding part an amount sits in (7.2 rule 3): HRIS pay and accepted offers, or band estimates. */
export type CostPart = 'filled' | 'band'

/** A line's part: 'band' for a band-estimate line, else 'filled' (hris and offer lines, and allowance lines). */
export const partOfBasis = (basis: CostBasis): CostPart => (basis === 'band' ? 'band' : 'filled')

/** The total row's key in a `GuardedFigure`. */
export const TOTAL_KEY = '__total'

/** An amount counts as non-zero from half a cent (7.2 rule 1 components; rule 5 uses the same eps). */
const NON_ZERO = 0.005

/** Where a position sits, for grouping (joined at read time, R26: its latest row). */
export interface CostSeat {
  businessUnit: string
  department: string | null
  costCenter: string
  location: string
  legalEntity: string
  country: string
  level: Level
  /** For a position created since the last close: it takes its manager position's atom (7.3a). */
  managerPositionId: string | null
}

/**
 * One position's cost in one part over one figure's window: what every guard function reads. A
 * position with lines in both parts in the window (a holder's last day, then a band-costed opening)
 * is two members.
 */
export interface CostMember {
  positionId: string
  part: CostPart
  /**
   * The costed people it brings over the window (7.2 rule 1): holder employee IDs of `hris` lines with
   * an active fraction above 0, and req IDs of accepted offers from their start. Empty for the band
   * part. Never reads leave.
   */
  people: readonly string[]
  /** Costed people in each month of the window, in month order (Finance sizes groups by the fewest, 7.4). */
  costedByMonth: readonly number[]
  /** USD over the window, summed in a fixed order. */
  amounts: Amounts
  /** Its currency (one per position and line; the FX effect counts non-USD people only). */
  currency: string
  /**
   * Costed people in each month of the window by the currency of the line that costs them, in month
   * order (Finance's fold keeps each currency's share of a unit's Other at 0 or 5 or more by line
   * currency, review RF-5). Absent on members built elsewhere (then `currency` stands for them all).
   */
  costedByCurrency?: Readonly<Record<string, readonly number[]>>
  seat: CostSeat
  /** Its atom in the last close's index (rounded modes), or null where there is none. */
  atomId: string | null
}

/** What `costMembers` reads. */
export interface CostMembersInput {
  /** A version's lines (or the forecast's, or a close's), any order. */
  lines: Iterable<PlanLine>
  /** The window's months, in order: the figure's month, QTD, YTD or FY. */
  months: readonly Month[]
  /** Each position's seat, or null for a position not in the data (its lines are left out and counted). */
  seatOf: (positionId: string) => CostSeat | null
  /** The last close's atom index (`ctx.guard.atoms`). */
  atoms: AtomIndex | null
}

/** `costMembersOf`'s result: the members, and the lines left out because their position has no seat. */
export interface CostMembersResult {
  members: CostMember[]
  leftOut: { positions: number; lines: number }
}

/** The id a line's member is filed under: its position, or a forecast cohort line's cohort key. */
export function memberIdOf(l: PlanLine): string {
  if (l.positionId !== '') return l.positionId
  const cohort = (l as { cohort?: { key?: unknown } }).cohort
  return typeof cohort?.key === 'string' ? cohort.key : ''
}

/** A line that brings a costed person (7.2 rule 1): 'hris' or 'offer', a holder, active above 0. */
export const isCostedLine = (l: PlanLine): boolean =>
  l.basis !== 'band' && l.holderId != null && l.holderId !== '' && l.active > 0

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const zero = (): Record<CostField, number> => ({
  base: 0,
  bonus: 0,
  burden: 0,
  benefits: 0,
  oneTime: 0,
  vacancy: 0,
  equity: 0,
  loaded: 0,
})

const NULL_AMOUNTS: ShownAmounts = Object.freeze({
  base: null,
  bonus: null,
  burden: null,
  benefits: null,
  oneTime: null,
  vacancy: null,
  equity: null,
  loaded: null,
})

/** The members and the lines left out (positions with no seat), see `costMembers`. */
export function costMembersOf(input: CostMembersInput): CostMembersResult {
  const monthAt = new Map<Month, number>()
  for (const [i, m] of input.months.entries()) monthAt.set(m, i)
  const seats = new Map<string, CostSeat | null>()
  const seatOf = (id: string): CostSeat | null => {
    if (!seats.has(id)) seats.set(id, id === '' ? null : input.seatOf(id))
    return seats.get(id) ?? null
  }
  const byId = new Map<string, { filled: PlanLine[]; band: PlanLine[] }>()
  const unseated = new Set<string>()
  let unseatedLines = 0
  for (const l of input.lines) {
    if (!monthAt.has(l.month)) continue
    const id = memberIdOf(l)
    if (!seatOf(id)) {
      unseated.add(id)
      unseatedLines++
      continue
    }
    let entry = byId.get(id)
    if (!entry) {
      entry = { filled: [], band: [] }
      byId.set(id, entry)
    }
    entry[partOfBasis(l.basis)].push(l)
  }
  const managerOf = (id: string): string | null => seatOf(id)?.managerPositionId ?? null
  const members: CostMember[] = []
  for (const id of [...byId.keys()].sort(cmp)) {
    const entry = byId.get(id) as { filled: PlanLine[]; band: PlanLine[] }
    const seat = seatOf(id) as CostSeat
    const atomId = input.atoms ? atomOf(id, input.atoms, managerOf) : null
    for (const part of ['filled', 'band'] as const) {
      const lines = entry[part]
      if (!lines.length) continue
      lines.sort(
        (a, b) =>
          (monthAt.get(a.month) ?? 0) - (monthAt.get(b.month) ?? 0) ||
          cmp(a.holderId ?? '', b.holderId ?? '') ||
          cmp(a.basis, b.basis),
      )
      const amounts = zero()
      const people = new Set<string>()
      const perMonth = input.months.map(() => new Set<string>())
      const perCurrency = new Map<string, Set<string>[]>()
      for (const l of lines) {
        for (const f of COST_FIELDS) amounts[f] += l.usd[f]
        if (part === 'filled' && isCostedLine(l)) {
          const holder = l.holderId as string
          const at = monthAt.get(l.month) ?? 0
          people.add(holder)
          perMonth[at].add(holder)
          let byMonth = perCurrency.get(l.currency)
          if (!byMonth) {
            byMonth = input.months.map(() => new Set<string>())
            perCurrency.set(l.currency, byMonth)
          }
          byMonth[at].add(holder)
        }
      }
      const costedByCurrency: Record<string, readonly number[]> = {}
      for (const cur of [...perCurrency.keys()].sort(cmp))
        costedByCurrency[cur] = (perCurrency.get(cur) as Set<string>[]).map((x) => x.size)
      members.push({
        positionId: id,
        part,
        people: [...people].sort(cmp),
        costedByMonth: perMonth.map((s) => s.size),
        amounts,
        currency: lines[lines.length - 1].currency,
        ...(part === 'filled' ? { costedByCurrency } : {}),
        seat,
        atomId,
      })
    }
  }
  return { members, leftOut: { positions: unseated.size, lines: unseatedLines } }
}

/** The window's lines as members, one per position and part, in positionId order. */
export function costMembers(input: CostMembersInput): CostMember[] {
  return costMembersOf(input).members
}

/** A member's rounding part in rounded modes: its atom and its part (`<atomId>|filled`, `<atomId>|band`). */
export function atomPart(m: CostMember): string {
  return `${m.atomId ?? NONE}|${m.part}`
}

/** Amounts with each part rounded down on its own and added with `sumRounded`, and what the adding put on top. */
export interface RoundedAmounts {
  amounts: Amounts
  /** How many parts were rounded on their own. */
  parts: number
  /** Per field, the steps `sumRounded` added on top of the plain sum of the rounded parts. */
  added: Amounts
}

/** The members' amounts summed in their order. */
export function sumAmounts(members: readonly CostMember[]): Amounts {
  const out = zero()
  for (const m of members) for (const f of COST_FIELDS) out[f] += m.amounts[f]
  return out
}

/** The members split by part, in first-seen order. */
function partsOf(
  members: readonly CostMember[],
  partOf: (m: CostMember) => string,
): Map<string, CostMember[]> {
  const parts = new Map<string, CostMember[]>()
  for (const m of members) {
    const k = partOf(m)
    const list = parts.get(k)
    if (list) list.push(m)
    else parts.set(k, [m])
  }
  return parts
}

/**
 * The members' amounts rounded per part (the template app's `roundedAmounts`): members grouped by
 * `partOf` (`atomPart` in rounded modes), each part's every field rounded down to a whole
 * `rules.floorUsd` on its own (toward zero), then added with `sumRounded`.
 */
export function roundedAmounts(
  members: readonly CostMember[],
  partOf: (m: CostMember) => string,
  rules: Pick<CostGuardSettings, 'floorUsd'>,
): RoundedAmounts {
  const step = rules.floorUsd
  const parts = partsOf(members, partOf)
  const each: Record<CostField, number[]> = {
    base: [],
    bonus: [],
    burden: [],
    benefits: [],
    oneTime: [],
    vacancy: [],
    equity: [],
    loaded: [],
  }
  for (const list of parts.values()) {
    const a = sumAmounts(list)
    for (const f of COST_FIELDS) each[f].push(roundCostTo(a[f], step))
  }
  const amounts = zero()
  const added = zero()
  for (const f of COST_FIELDS) {
    amounts[f] = sumRoundedTo(each[f], step)
    added[f] = addedStepsTo(each[f].filter((v) => v >= step).length, step)
  }
  return { amounts, parts: parts.size, added }
}

/** Each part's loaded cost rounded down on its own, part by part in first-seen order. */
function partValues(
  members: readonly CostMember[],
  partOf: (m: CostMember) => string,
  step: number,
): number[] {
  return [...partsOf(members, partOf).values()].map((list) => roundCostTo(sumAmounts(list).loaded, step))
}

/** One group's cost, or the scope's total, as shown. USD over the figure's window. */
export interface CostRow {
  /** Unique in its breakdown: the group's value, `NONE` for no value, `OTHER` for Other. */
  key: string
  /** What the reader sees: "Silicon Engineering", "1110-SJC", "Other (3)". */
  label: string
  isOther: boolean
  /** Groups folded into this row (Other only). */
  folded: number
  /** Distinct costed people behind the filled part over the window. */
  costed: number
  /** The filled part's amounts; null where hidden (under the minimum, a component under its own, or the mode). */
  amounts: ShownAmounts
  /** The band part's loaded amount ("Open and Planned at band estimate"), apart; null where band estimates do not show. */
  bandUsd: number | null
  /**
   * The row's loaded cost with both parts (rounded modes: `sumRounded` over every part of every atom);
   * null when the filled part is hidden (the band line still shows on its own, rule 3).
   */
  totalUsd: number | null
  /** Loaded cost per costed person (rounded modes: `perHeadOfRounded` of the rounded total). */
  perHeadUsd: number | null
  /**
   * Under the minimum costed people: every filled amount null. Also set (with `reason`) for a row that
   * shows heads only: not a whole union of atoms or of shown cost centers, the mode, or the fit.
   */
  hidden: boolean
  /**
   * A component under its minimum contributing positions: the row shows loaded only. Always set in
   * rounded modes while the loaded amount shows (they show loaded cost only; `reason` stays null).
   */
  componentsHidden: boolean
  /**
   * Why amounts read "—" (`hiddenNote`, `componentsHiddenNote`, `WHOLE_TEAMS_NOTE`,
   * `WHOLE_CENTERS_NOTE`, `NO_AMOUNTS_NOTE`, a fit reason), else null.
   */
  reason: string | null
  /** The positions behind the filled part (empty when hidden): a cost drill lists them with no amount column. */
  positionIds: readonly string[]
  /** Rounded modes: how many parts were rounded on their own, and what `sumRounded` added to the loaded total. */
  parts?: number
  added?: number
  /** Rounded modes: costed people in atoms under the minimum (or in no atom), left out of the row. */
  leftOut?: number
}

/** How `costRow` and `breakdown` treat amounts. */
export interface CostRowOptions {
  mode: GuardMode
  rules: CostGuardSettings
  /** Band estimates show in this mode (`cost:band`: every mode but Manager). */
  bandShown: boolean
  /** The rounding parts (rounded modes: `atomPart`). */
  partOf?: (m: CostMember) => string
  isOther?: boolean
  folded?: number
  /**
   * Exact modes: which units' component split may show for the members' window (`componentGate`,
   * C33). Without one, every exact row shows loaded cost only.
   */
  components?: ComponentGate | null
}

/** Distinct costed people of the members' filled part. */
export function peopleOf(members: readonly CostMember[]): Set<string> {
  const out = new Set<string>()
  for (const m of members) if (m.part === 'filled') for (const p of m.people) out.add(p)
  return out
}

/** Rounded modes: the members of atoms with the minimum or more, and the costed people left out. */
function keptAtoms(members: readonly CostMember[], min: number): { kept: CostMember[]; leftOut: number } {
  const placed = members.filter((m) => m.atomId != null)
  const { kept, left } = wholeParts(
    placed,
    (m) => m.atomId as string,
    min,
    (rs) => peopleOf(rs).size,
  )
  const keptPeople = peopleOf(kept)
  let leftOut = 0
  for (const p of peopleOf([...left, ...members.filter((m) => m.atomId == null)]))
    if (!keptPeople.has(p)) leftOut++
  return { kept, leftOut }
}

/** Exact modes with folds: whether a member sits in a cost center its unit's fold shows. */
const inShownCenter = (m: CostMember, folds: ReadonlyMap<string, FinanceFold>): boolean =>
  folds.get(m.seat.businessUnit)?.shown.includes(m.seat.costCenter) === true

/**
 * Exact modes with folds: the members the fold lets into a total. A unit whose Other would hold fewer
 * than the minimum is left out; under a filter's share of a unit (`partial`) only its shown cost
 * centers are kept.
 */
function exactPool(
  members: readonly CostMember[],
  folds: ReadonlyMap<string, FinanceFold>,
  min: number,
  partial: boolean,
): { kept: CostMember[]; leftOut: number } {
  const byUnit = new Map<string, CostMember[]>()
  for (const m of members) {
    const list = byUnit.get(m.seat.businessUnit)
    if (list) list.push(m)
    else byUnit.set(m.seat.businessUnit, [m])
  }
  const small = new Set<string>()
  for (const [unit, list] of byUnit) {
    const fold = folds.get(unit)
    if (fold ? fold.other.length > 0 && fold.otherSize < min : peopleOf(list).size < min) small.add(unit)
  }
  const kept: CostMember[] = []
  const dropped: CostMember[] = []
  for (const m of members) {
    const out = small.has(m.seat.businessUnit) || (partial && !inShownCenter(m, folds))
    ;(out ? dropped : kept).push(m)
  }
  const keptPeople = peopleOf(kept)
  let leftOut = 0
  for (const p of peopleOf(dropped)) if (!keptPeople.has(p)) leftOut++
  return { kept, leftOut }
}

/* ───────────── the component split (7.2 rule 1, lead decision D-FIN (b), C33) ───────────── */

/** One capped burden component a costed line pays, and the side of its cap the line sits on. */
export interface CapSide {
  /** The component, keyed by country: 'United States|socialSecurity'. */
  key: string
  /** The line's annual base + bonus is below the cap (the cap does not bind). */
  below: boolean
}

/** What `componentGate` reads: every position's lines over the figure's window, unfiltered. */
export interface ComponentGateInput {
  /** The lines the figure's members were built from (any months: only the window's are read). */
  lines: Iterable<PlanLine>
  /** The figure's window, in order. */
  months: readonly Month[]
  /** Each position's seat (its unit), or null for a position not in the data (left out). */
  seatOf: (positionId: string) => CostSeat | null
  /**
   * A costed line's capped burden components and the side of each cap it sits on (never reading
   * leave: an unpaid month is told from the line priced as paid), or null when the side cannot be
   * told, which hides the split for the line's unit. Not given: no cap is checked.
   */
  capSides?: ((l: PlanLine) => readonly CapSide[] | null) | null
  /**
   * A costed line on unpaid leave priced as paid (its paid twin: the same seat, month and holder,
   * src/views/lineSource.ts `paidLineOf`), or null when none can be found. Given, the component
   * contributors are counted at leave-neutral prices (C26, R44, as the bridge counts them): an unpaid
   * month counts the twin's base, bonus, burden, benefits and equity, so flipping a leave between
   * paid and unpaid never changes which units pass; a line with no twin hides its unit's split, as a
   * cap side that cannot be told does. Not given: the lines' own amounts are counted. An addition to
   * the M2 contract (finance-ui builder, M3).
   */
  paidLineOf?: ((l: PlanLine) => PlanLine | null) | null
}

/** The components unpaid leave sets to 0 for a month (src/plan/engine/cost.ts); one-time items and the vacancy allowance stay. */
export const LEAVE_COMPONENTS: ReadonlySet<CostComponent> = new Set<CostComponent>([
  'base',
  'bonus',
  'burden',
  'benefits',
  'equity',
])

/** A costed line with no base and no bonus: a month of unpaid leave (src/views/lineSource.ts `isUnpaidLine`). */
export const isUnpaidCostedLine = (l: PlanLine): boolean =>
  isCostedLine(l) && Math.abs(l.local.base) < 1e-9 && Math.abs(l.local.bonus) < 1e-9

/** One unit's facts for the split. */
export interface UnitComponents {
  /** The unit's positions with a filled line in the window: a whole-unit row holds every one. */
  positions: ReadonlySet<string>
  /** Every class of the unit holds 0 or the minimum or more, in every month and over the window. */
  ok: boolean
}

/** Which units' component split may show for one window of one line source (`componentGate`). */
export interface ComponentGate {
  units: ReadonlyMap<string, UnitComponents>
}

/** 1 to `min` − 1: a class the split must never show. */
const isShort = (n: number, min: number): boolean => n > 0 && n < min

/**
 * Each unit's component split facts for a window (lead decision D-FIN (b), C33): per unit, every
 * component's contributing positions (half a cent or more in the component) and, per capped burden
 * component, the people below its cap and at or above it, in each month of the window and over the
 * window as a whole (a person whose cap binds in only some months is on both sides). A unit is `ok`
 * when every one of these classes holds 0 or `min` or more; a line whose cap side cannot be told
 * makes its unit not ok. Band lines are structure and never counted. With `paidLineOf` the
 * contributors are counted at leave-neutral prices (M2 carry-over, C26 and R44): a month of unpaid
 * leave counts its paid twin's leave-zeroed components (`LEAVE_COMPONENTS`), so no unit's decision
 * reads anyone's leave; the amounts a figure shows keep their real prices. Pure.
 */
export function componentGate(input: ComponentGateInput, min: number): ComponentGate {
  const monthAt = new Map<Month, number>()
  for (const [i, m] of input.months.entries()) monthAt.set(m, i)
  const n = input.months.length
  const C = COST_COMPONENTS.length
  interface Cap {
    below: Set<string>[]
    at: Set<string>[]
    belowAll: Set<string>
    atAll: Set<string>
  }
  interface Acc {
    positions: Set<string>
    sums: Map<string, Float64Array>
    caps: Map<string, Cap>
    unknown: boolean
  }
  const seats = new Map<string, CostSeat | null>()
  const seatOf = (id: string): CostSeat | null => {
    if (!seats.has(id)) seats.set(id, id === '' ? null : input.seatOf(id))
    return seats.get(id) ?? null
  }
  const units = new Map<string, Acc>()
  for (const l of input.lines) {
    const i = monthAt.get(l.month)
    if (i === undefined || l.basis === 'band') continue
    const id = memberIdOf(l)
    const seat = seatOf(id)
    if (!seat) continue
    let u = units.get(seat.businessUnit)
    if (!u) {
      u = { positions: new Set(), sums: new Map(), caps: new Map(), unknown: false }
      units.set(seat.businessUnit, u)
    }
    u.positions.add(id)
    let arr = u.sums.get(id)
    if (!arr) {
      arr = new Float64Array(n * C)
      u.sums.set(id, arr)
    }
    // Leave-neutral counts (C26, R44): an unpaid month is counted at its paid twin's prices.
    let paid: PlanLine = l
    if (input.paidLineOf && isUnpaidCostedLine(l)) {
      const twin = input.paidLineOf(l)
      if (twin) paid = twin
      else u.unknown = true
    }
    for (let c = 0; c < C; c++) {
      const comp = COST_COMPONENTS[c]
      arr[i * C + c] += (LEAVE_COMPONENTS.has(comp) ? paid : l).usd[comp]
    }
    if (!input.capSides || !isCostedLine(l)) continue
    const sides = input.capSides(l)
    if (sides == null) {
      u.unknown = true
      continue
    }
    const holder = l.holderId as string
    for (const side of sides) {
      let cap = u.caps.get(side.key)
      if (!cap) {
        cap = {
          below: input.months.map(() => new Set<string>()),
          at: input.months.map(() => new Set<string>()),
          belowAll: new Set(),
          atAll: new Set(),
        }
        u.caps.set(side.key, cap)
      }
      ;(side.below ? cap.below : cap.at)[i].add(holder)
      ;(side.below ? cap.belowAll : cap.atAll).add(holder)
    }
  }
  const out = new Map<string, UnitComponents>()
  for (const [unit, u] of units) {
    let ok = !u.unknown
    for (let c = 0; ok && c < C; c++) {
      const perMonth = new Array<number>(n).fill(0)
      let window = 0
      for (const arr of u.sums.values()) {
        let total = 0
        for (let i = 0; i < n; i++) {
          const v = arr[i * C + c]
          total += v
          if (Math.abs(v) >= NON_ZERO) perMonth[i]++
        }
        if (Math.abs(total) >= NON_ZERO) window++
      }
      if (isShort(window, min) || perMonth.some((k) => isShort(k, min))) ok = false
    }
    for (const cap of u.caps.values()) {
      if (!ok) break
      if (isShort(cap.belowAll.size, min) || isShort(cap.atAll.size, min)) ok = false
      for (let i = 0; ok && i < n; i++)
        if (isShort(cap.below[i].size, min) || isShort(cap.at[i].size, min)) ok = false
    }
    out.set(unit, { positions: u.positions, ok })
  }
  return { units: out }
}

/** A row whose component split cannot show because it is not whole units (C33). */
export const COMPONENTS_UNITS_NOTE = 'Components show for whole units and the company.'

/**
 * Whether a row's filled members may show the component split (see `componentGate`): null when they
 * may, else the reason. They must be whole units of the gate, each `ok`.
 */
function splitReason(
  gate: ComponentGate | null | undefined,
  filled: readonly CostMember[],
  min: number,
): string | null {
  if (!gate) return COMPONENTS_UNITS_NOTE
  const byUnit = new Map<string, Set<string>>()
  for (const m of filled) {
    const set = byUnit.get(m.seat.businessUnit)
    if (set) set.add(m.positionId)
    else byUnit.set(m.seat.businessUnit, new Set([m.positionId]))
  }
  if (!byUnit.size) return COMPONENTS_UNITS_NOTE
  let failed = false
  for (const [unit, ids] of byUnit) {
    const g = gate.units.get(unit)
    if (!g) return COMPONENTS_UNITS_NOTE
    for (const id of g.positions) if (!ids.has(id)) return COMPONENTS_UNITS_NOTE
    if (!g.ok) failed = true
  }
  return failed ? componentsHiddenNote(min) : null
}

const sortedIds = (members: readonly CostMember[]): string[] =>
  [...new Set(members.filter((m) => m.part === 'filled').map((m) => m.positionId))].sort(cmp)

/** A row that shows heads only, with the reason. */
function headsOnly(row: CostRow, reason: string): CostRow {
  const { parts: _p, added: _a, ...rest } = row
  return {
    ...rest,
    amounts: NULL_AMOUNTS,
    bandUsd: null,
    totalUsd: null,
    perHeadUsd: null,
    hidden: true,
    componentsHidden: false,
    reason,
    positionIds: [],
  }
}

/** One row of members under the guard. */
export function costRow(
  key: string,
  label: string,
  members: readonly CostMember[],
  opts: CostRowOptions,
): CostRow {
  const min = opts.rules.minCosted
  const step = opts.rules.floorUsd
  const head = { key, label, isOther: opts.isOther ?? false, folded: opts.folded ?? 0 }
  if (opts.mode === 'none')
    return {
      ...head,
      costed: peopleOf(members).size,
      amounts: NULL_AMOUNTS,
      bandUsd: null,
      totalUsd: null,
      perHeadUsd: null,
      hidden: true,
      componentsHidden: false,
      reason: NO_AMOUNTS_NOTE,
      positionIds: [],
    }
  if (opts.mode === 'rounded') {
    const { kept, leftOut } = keptAtoms(members, min)
    const filled = kept.filter((m) => m.part === 'filled')
    const band = kept.filter((m) => m.part === 'band')
    const costed = peopleOf(filled).size
    const hidden = costed < min
    const partOf = opts.partOf ?? atomPart
    // The filled part and the band part are rounded apart whatever `partOf` says (rule 3).
    const fv = partValues(filled, partOf, step)
    const bv = opts.bandShown ? partValues(band, partOf, step) : []
    const filledUsd = sumRoundedTo(fv, step)
    const all = [...fv, ...bv]
    return {
      ...head,
      costed,
      amounts: hidden ? NULL_AMOUNTS : { ...NULL_AMOUNTS, loaded: filledUsd },
      bandUsd: opts.bandShown ? sumRoundedTo(bv, step) : null,
      totalUsd: hidden ? null : sumRoundedTo(all, step),
      perHeadUsd: hidden ? null : perHeadOfRounded(filledUsd, costed),
      hidden,
      componentsHidden: !hidden,
      reason: hidden ? hiddenNote(min) : null,
      positionIds: hidden ? [] : sortedIds(filled),
      ...(hidden
        ? {}
        : { parts: all.length, added: addedStepsTo(all.filter((v) => v >= step).length, step) }),
      leftOut,
    }
  }
  // 'exact' and 'open'
  const open = opts.mode === 'open'
  const filled = members.filter((m) => m.part === 'filled')
  const band = members.filter((m) => m.part === 'band')
  const costed = peopleOf(filled).size
  const hidden = !open && costed < min
  const f = sumAmounts(filled)
  const bandUsd = opts.bandShown ? sumAmounts(band).loaded : null
  // The split shows only on whole units whose classes all pass (C33, `componentGate`).
  const split = open || hidden ? null : splitReason(opts.components, filled, min)
  const componentsHidden = split != null
  return {
    ...head,
    costed,
    amounts: hidden ? NULL_AMOUNTS : componentsHidden ? { ...NULL_AMOUNTS, loaded: f.loaded } : { ...f },
    bandUsd,
    totalUsd: hidden ? null : f.loaded + (bandUsd ?? 0),
    perHeadUsd: hidden || costed === 0 ? null : f.loaded / costed,
    hidden,
    componentsHidden,
    reason: hidden ? hiddenNote(min) : split,
    positionIds: hidden ? [] : sortedIds(filled),
  }
}

/** How `breakdown` groups members. */
export interface BreakdownOptions extends CostRowOptions {
  /** The group key of a member (a department, a cost center, an atom), or null for none. */
  key: (m: CostMember) => string | null | undefined
  /** The label of a group key (the key itself when not given). */
  label?: (key: string) => string
  noneLabel: string
  /** A fixed order of keys; otherwise largest shown amount first. */
  order?: readonly string[]
  top?: number
  /** The total is shown, so Other is filled to the minimum (`foldGroups`). */
  totalShown: boolean
  /** Exact modes: the units' one cost-center fold, which every row is built from and never re-folded (7.4). */
  folds?: ReadonlyMap<string, FinanceFold> | null
  /**
   * Exact modes with folds: the members are a filter's share of their units (a cost-center,
   * legal-entity, country, currency or department filter, one at a time under `costFit`), so only
   * the units' shown cost centers count and no Other shows (7.4). See `isPartialCostFilter` (./fit.ts).
   */
  partial?: boolean
}

/** What a row ranks by: the amount it shows (heads in Manager mode). */
const rankValue = (row: CostRow, mode: GuardMode): number =>
  mode === 'none' ? row.costed : (row.amounts.loaded ?? Number.NEGATIVE_INFINITY)

/** One breakdown of the members under the guard, Other last (shown rows plus Other equal the total). */
export function breakdown(members: readonly CostMember[], opts: BreakdownOptions): CostRow[] {
  const min = opts.rules.minCosted
  const rowOpts: CostRowOptions = {
    mode: opts.mode,
    rules: opts.rules,
    bandShown: opts.bandShown,
    ...(opts.partOf ? { partOf: opts.partOf } : {}),
  }
  const folds = opts.mode === 'exact' ? (opts.folds ?? null) : null
  let pool: readonly CostMember[] = members
  if (opts.mode === 'rounded') pool = keptAtoms(members, min).kept
  else if (folds) pool = exactPool(members, folds, min, opts.partial ?? false).kept
  const keyOf = (m: CostMember): string => {
    const k = opts.key(m)
    return k == null || k === '' ? NONE : k
  }
  const order = opts.order ? new Map(opts.order.map((k, i) => [k, i])) : null
  const byOrder = (a: { key: string; label: string }, b: { key: string; label: string }): number =>
    (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) ||
    (order?.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order?.get(b.key) ?? Number.MAX_SAFE_INTEGER) ||
    a.label.localeCompare(b.label)
  const otherRow = (rows: readonly CostMember[], keys: Iterable<string>): CostRow[] => {
    if (!rows.length) return []
    const k = new Set(keys).size
    return [costRow(OTHER, otherLabel(k), rows, { ...rowOpts, isOther: true, folded: k })]
  }

  if (opts.mode === 'rounded' || folds) {
    // Cells: the atom (rounded) or the shown cost center, else the unit's Other (exact).
    const cellOf = (m: CostMember): string =>
      folds
        ? inShownCenter(m, folds)
          ? `cc:${m.seat.businessUnit}|${m.seat.costCenter}`
          : `other:${m.seat.businessUnit}`
        : `atom:${m.atomId}`
    let moved: CostMember[] = []
    let rest: readonly CostMember[] = pool
    if (folds) {
      const keysOfUnit = new Map<string, Set<string>>()
      for (const m of pool) {
        const set = keysOfUnit.get(m.seat.businessUnit)
        if (set) set.add(keyOf(m))
        else keysOfUnit.set(m.seat.businessUnit, new Set([keyOf(m)]))
      }
      const stays = (m: CostMember) =>
        inShownCenter(m, folds) || (keysOfUnit.get(m.seat.businessUnit)?.size ?? 0) <= 1
      moved = pool.filter((m) => !stays(m))
      rest = pool.filter(stays)
    }
    const cellSize = new Map<string, number>()
    for (const m of rest) cellSize.set(cellOf(m), (cellSize.get(cellOf(m)) ?? 0) + 1)
    const whole = (g: Group<CostMember>): boolean => {
      const n = new Map<string, number>()
      for (const m of g.rows) n.set(cellOf(m), (n.get(cellOf(m)) ?? 0) + 1)
      for (const [cell, k] of n) if (k !== cellSize.get(cell)) return false
      return true
    }
    const note = folds ? WHOLE_CENTERS_NOTE : WHOLE_TEAMS_NOTE
    const cands = groupBy(rest, opts.key, opts.noneLabel, opts.label).map((g) => {
      const w = whole(g)
      // A row that cuts a cell counts its heads as they are (no atom is left out of a part of it).
      const row = w
        ? costRow(g.key, g.label, g.rows, rowOpts)
        : headsOnly(costRow(g.key, g.label, g.rows, { ...rowOpts, mode: 'none' }), note)
      return { g, whole: w, row }
    })
    cands.sort((a, b) =>
      order
        ? byOrder(a.g, b.g)
        : rankValue(b.row, opts.mode) - rankValue(a.row, opts.mode) || a.g.label.localeCompare(b.g.label),
    )
    // Whole rows under the minimum join Other; while Other is under it and the total is shown, the
    // smallest shown whole row joins too (ties: the first in order).
    const otherMembers = [...moved]
    const otherKeys = moved.map(keyOf)
    const drop = new Set<(typeof cands)[number]>()
    const fold = (c: (typeof cands)[number]) => {
      drop.add(c)
      otherMembers.push(...c.g.rows)
      otherKeys.push(c.g.key)
    }
    for (const c of cands) if (c.whole && c.row.hidden) fold(c)
    let showing = cands.filter((c) => c.whole && !drop.has(c))
    const short = () => otherMembers.some((m) => m.part === 'filled') && peopleOf(otherMembers).size < min
    while (opts.totalShown && short() && showing.length) {
      let i = 0
      for (let j = 1; j < showing.length; j++) if (showing[j].row.costed < showing[i].row.costed) i = j
      fold(showing[i])
      showing = showing.filter((c) => !drop.has(c))
    }
    if (opts.top != null && showing.length > opts.top) {
      const keep = new Set(
        showing
          .slice()
          .sort(
            (a, b) =>
              rankValue(b.row, opts.mode) - rankValue(a.row, opts.mode) || a.g.label.localeCompare(b.g.label),
          )
          .slice(0, opts.top),
      )
      for (const c of showing) if (!keep.has(c)) fold(c)
    }
    return [...cands.filter((c) => !drop.has(c)).map((c) => c.row), ...otherRow(otherMembers, otherKeys)]
  }

  // Exact with no folds (the template app's fold), 'open' (no minimum) and 'none' (heads only).
  const groups = groupBy(pool, opts.key, opts.noneLabel, opts.label)
  const rows = new Map(groups.map((g) => [g, costRow(g.key, g.label, g.rows, rowOpts)]))
  const rank = (g: Group<CostMember>) => rankValue(rows.get(g) as CostRow, opts.mode)
  groups.sort((a, b) => (order ? byOrder(a, b) : rank(b) - rank(a) || a.label.localeCompare(b.label)))
  const exact = opts.mode === 'exact'
  const { shown, folded } = guardGroups(groups, exact ? min : 0, exact && opts.totalShown, {
    ...(opts.top != null ? { top: opts.top } : {}),
    rank,
    size: (g) => (exact ? peopleOf(g.rows).size : g.rows.length),
  })
  return [
    ...shown.map((g) => rows.get(g) as CostRow),
    ...otherRow(
      folded.flatMap((g) => g.rows),
      folded.map((g) => g.key),
    ),
  ]
}

/** What `guardModel` builds a figure from. */
export interface GuardInput {
  /** The figure's members over its window (`costMembers`), already inside the scope and filters. */
  members: readonly CostMember[]
  mode: GuardMode
  rules: CostGuardSettings
  /** The last close's atom index (`ctx.guard.atoms`); rounded modes read only it. */
  atoms: AtomIndex | null
  /** Exact modes: the units' one cost-center fold (`financeFold`), reused under every filter. */
  folds?: ReadonlyMap<string, FinanceFold> | null
  /** `costFit`'s reason under the filters and period (./fit.ts), or null when cost may show. */
  fit: string | null
  /** Band estimates show in this mode (`cost:band`). */
  bandShown: boolean
  /** A breakdown to build with the total; none for a total alone. */
  by?: Omit<BreakdownOptions, keyof CostRowOptions>
  /**
   * Exact modes with folds: the members are a filter's share of their units (`isPartialCostFilter`),
   * so the units' Others are left out with `centersLeftOutNote` (7.4). Default: whole units.
   */
  partial?: boolean
  /** The total row's label ("Total" when not given). */
  label?: string
  /**
   * Exact modes: which units' component split may show for the members' window (`componentGate`,
   * C33). Without one, the figure shows loaded cost only.
   */
  components?: ComponentGate | null
}

/** One guarded figure: what a tile, chart, table, export and calculation card all read. */
export interface GuardedFigure {
  mode: GuardMode
  total: CostRow
  /** The breakdown's rows, Other last; empty without `by`. */
  rows: readonly CostRow[]
  /**
   * "n people in groups under 5 are left out" (rounded) or "n people in cost centers under 5 are left
   * out" (Finance under a filter); null when nobody is.
   */
  note: string | null
  /** Why every amount reads "—" (the mode, the fit), else null. */
  reason: string | null
  /** Rounded modes: each atom's rounded filled and band parts, for calculation cards (`atomId|part` to USD). */
  parts?: Readonly<Record<string, number>>
  /** Rounded modes: the rounding step in force (`cost.guard.floorUsd`), so a card names the step it used. */
  step?: number
}

/** The guarded figure (rules 1 to 4 for the mode). Calculation cards read this, never engine totals. */
export function guardModel(input: GuardInput): GuardedFigure {
  const { mode, rules } = input
  const min = rules.minCosted
  const label = input.label ?? 'Total'
  const rowOpts: CostRowOptions = {
    mode,
    rules,
    bandShown: input.bandShown,
    partOf: atomPart,
    components: input.components ?? null,
  }
  const folds = mode === 'exact' ? (input.folds ?? input.by?.folds ?? null) : null
  const partial = input.partial ?? input.by?.partial ?? false

  if (mode === 'none' || input.fit != null) {
    const reason = mode === 'none' ? NO_AMOUNTS_NOTE : (input.fit as string)
    const total = headsOnly(costRow(TOTAL_KEY, label, input.members, { ...rowOpts, mode: 'none' }), reason)
    const rows = input.by
      ? breakdown(input.members, { ...input.by, ...rowOpts, mode: 'none', totalShown: false }).map((r) =>
          headsOnly(r, reason),
        )
      : []
    return { mode, total, rows, note: null, reason }
  }

  let pool: readonly CostMember[] = input.members
  let note: string | null = null
  if (mode === 'rounded') {
    const r = keptAtoms(input.members, min)
    pool = r.kept
    if (r.leftOut > 0) note = leftOutNote(r.leftOut, min)
  } else if (folds) {
    const r = exactPool(input.members, folds, min, partial)
    pool = r.kept
    if (r.leftOut > 0) note = centersLeftOutNote(r.leftOut, min)
  }
  const total = costRow(TOTAL_KEY, label, pool, rowOpts)
  const rows = input.by
    ? breakdown(pool, {
        ...input.by,
        ...rowOpts,
        totalShown: input.by.totalShown && !total.hidden,
        folds,
        partial,
      })
    : []
  // Exact: the split shows only on whole units whose every class passes (C33), so the total less the
  // rows that show theirs is a union of whole units' classes too, and needs no check of its own.

  let parts: Record<string, number> | undefined
  if (mode === 'rounded' && !total.hidden) {
    parts = {}
    const step = rules.floorUsd
    for (const [k, list] of partsOf(pool, atomPart)) {
      if (!input.bandShown && list[0].part === 'band') continue
      parts[k] = roundCostTo(sumAmounts(list).loaded, step)
    }
  }
  return {
    mode,
    total,
    rows,
    note,
    reason: total.hidden ? total.reason : null,
    ...(parts ? { parts } : {}),
    ...(mode === 'rounded' ? { step: rules.floorUsd } : {}),
  }
}

/**
 * 7.2 rule 1 components: the positions with a non-zero amount in a component in the cell the lines
 * cover (sign-on and relocation count hires, the agency fee accepted offers, severance eliminated
 * Filled seats; all of them book in `oneTime`).
 */
export function componentContributors(
  lines: Iterable<PlanLine>,
  component: CostComponent,
): ReadonlySet<string> {
  const sums = new Map<string, number>()
  for (const l of lines) {
    if (l.basis === 'band') continue
    const id = memberIdOf(l)
    sums.set(id, (sums.get(id) ?? 0) + l.usd[component])
  }
  const out = new Set<string>()
  for (const [id, v] of sums) if (Math.abs(v) >= NON_ZERO) out.add(id)
  return out
}

/* ───────────── Finance's folds from members (7.4) ───────────── */

/**
 * Each unit's cost centers as Finance's fold sizes them, from members built over the version's grid
 * (`costMembers` with `months` = the grid): costed people per month summed over the center's filled
 * members (a person in two of its positions in one month counts twice), and every position with a
 * line. A center's department, site, country and legal entity are its first member's seat's; its
 * currency its first filled member's (else its first member's), and its costed people per month by
 * each line's own currency (`costedByCurrency`, review RF-5: a person paid in another currency than
 * the center's site counts in that currency's share of the unit's Other).
 */
export function foldCentersOf(members: readonly CostMember[]): Map<string, FoldCenter[]> {
  const byUnit = new Map<string, Map<string, CostMember[]>>()
  for (const m of members) {
    let centers = byUnit.get(m.seat.businessUnit)
    if (!centers) {
      centers = new Map()
      byUnit.set(m.seat.businessUnit, centers)
    }
    const list = centers.get(m.seat.costCenter)
    if (list) list.push(m)
    else centers.set(m.seat.costCenter, [m])
  }
  const out = new Map<string, FoldCenter[]>()
  for (const [unit, centers] of byUnit) {
    const list: FoldCenter[] = []
    for (const [costCenter, ms] of centers) {
      const n = ms.reduce((a, m) => Math.max(a, m.costedByMonth.length), 0)
      const costedByMonth = new Array<number>(n).fill(0)
      for (const m of ms)
        if (m.part === 'filled') for (let i = 0; i < n; i++) costedByMonth[i] += m.costedByMonth[i] ?? 0
      const first = ms[0]
      const currency = (ms.find((m) => m.part === 'filled') ?? first).currency
      const byCurrency: Record<string, number[]> = {}
      for (const m of ms) {
        if (m.part !== 'filled') continue
        const per = m.costedByCurrency ?? { [m.currency]: m.costedByMonth }
        for (const [cur, months] of Object.entries(per)) {
          byCurrency[cur] ??= new Array<number>(n).fill(0)
          const acc = byCurrency[cur]
          for (let i = 0; i < n; i++) acc[i] += months[i] ?? 0
        }
      }
      list.push({
        costCenter,
        department: first.seat.department,
        location: first.seat.location,
        country: first.seat.country,
        legalEntity: first.seat.legalEntity,
        currency,
        costedByMonth,
        costedByCurrency: byCurrency,
        positionIds: [...new Set(ms.map((m) => m.positionId))].sort(cmp),
      })
    }
    out.set(unit, list)
  }
  return out
}

/** Every unit's one cost-center fold (`financeFold`) from members built over the version's grid. */
export function financeFolds(members: readonly CostMember[], min: number): Map<string, FinanceFold> {
  const out = new Map<string, FinanceFold>()
  for (const [unit, centers] of foldCentersOf(members)) out.set(unit, financeFold(unit, centers, min))
  return out
}

/* ───────────── the notes (PLAN's wording, the minimum read from the rules) ───────────── */

/** "Hidden to protect anonymity (n < 5)". */
export const hiddenNote = (min: number): string => `Hidden to protect anonymity (n < ${min})`

/** Rounded modes: "12 people in groups under 5 are left out". */
export const leftOutNote = (people: number, min: number): string =>
  `${people.toLocaleString('en-US')} ${people === 1 ? 'person' : 'people'} in groups under ${min} ${people === 1 ? 'is' : 'are'} left out`

/** Finance: "3 people in cost centers under 5 are left out". */
export const centersLeftOutNote = (people: number, min: number): string =>
  `${people.toLocaleString('en-US')} ${people === 1 ? 'person' : 'people'} in cost centers under ${min} ${people === 1 ? 'is' : 'are'} left out`

/** A cell whose components cannot show (7.2 rule 1): the long CSV's `suppressedReason` too. */
export const componentsHiddenNote = (min: number): string =>
  `Components hidden (fewer than ${min} in a component)`

/** The band part's line (7.2 rule 3). */
export const BAND_LINE_LABEL = 'Open and Planned at band estimate'

/** Rounded modes: monthly cost, components, incl. SBC, the exit run rate and freeze savings (7.3). */
export const SHOWS_IN_FINANCE_NOTE = 'Shows in Finance mode.'

/* ───────────── the test helper (PLAN 7.8) ───────────── */

/**
 * Throws an Error naming every break of the fold invariant: shown rows plus Other cover the total's
 * costed people; their amounts add to the total (exactly, or within one step per part where
 * rounded, every rounded amount a whole step); every shown row has the minimum or more and an amount;
 * at most one Other. Hidden totals: every row's amounts are null.
 *
 * Rows that show heads only (not a whole union) are allowed while the total shows: together they
 * hold no costed people or the minimum or more, and the sums are then checked as "at most the
 * total" only.
 */
export function expectGuarded(
  rows: readonly CostRow[],
  total: CostRow,
  opts: { min: number; rounded?: boolean; step?: number; label?: string },
): void {
  const { min } = opts
  const step = opts.step ?? 100_000
  const problems: string[] = []
  const name = (r: CostRow) => `${r.label} (${r.key})`
  const covered = rows.reduce((a, r) => a + r.costed, 0)
  if (covered < total.costed)
    problems.push(`rows cover ${covered} costed people of the total's ${total.costed}`)
  const others = rows.filter((r) => r.isOther).length
  if (others > 1) problems.push(`${others} Other rows`)
  const amountsOf = (r: CostRow): (number | null)[] => [
    ...COST_FIELDS.map((f) => r.amounts[f]),
    r.totalUsd,
    r.perHeadUsd,
  ]
  if (total.amounts.loaded == null) {
    for (const r of rows)
      if (amountsOf(r).some((v) => v != null))
        problems.push(`${name(r)} shows an amount under a hidden total`)
  } else {
    const shown = rows.filter((r) => r.amounts.loaded != null)
    const headsOnly = rows.filter((r) => r.amounts.loaded == null)
    for (const r of shown)
      if (r.costed < min) problems.push(`${name(r)} shows an amount over ${r.costed} costed people`)
    for (const r of headsOnly) if (!r.reason) problems.push(`${name(r)} reads "—" with no reason`)
    const leftover = headsOnly.reduce((a, r) => a + r.costed, 0)
    if (leftover > 0 && leftover < min)
      problems.push(
        `rows with heads only hold ${leftover} costed people, so the total less the rest gives them`,
      )
    const fields: ('loaded' | 'totalUsd' | 'bandUsd' | CostComponent)[] = [
      'loaded',
      'totalUsd',
      'bandUsd',
      ...COST_COMPONENTS,
    ]
    const fieldOf = (r: CostRow, f: (typeof fields)[number]): number | null =>
      f === 'totalUsd' ? r.totalUsd : f === 'bandUsd' ? r.bandUsd : r.amounts[f]
    for (const f of fields) {
      const t = fieldOf(total, f)
      if (t == null) continue
      const vs = rows.map((r) => fieldOf(r, f))
      if (vs.some((v) => v == null)) {
        if (!headsOnly.length) continue
        const sum = vs.reduce<number>((a, v) => a + (v ?? 0), 0)
        if (!opts.rounded && sum > t + 0.005 && f !== 'bandUsd' && t >= 0)
          problems.push(`${f}: shown rows add to ${sum}, over the total ${t}`)
        continue
      }
      const sum = (vs as number[]).reduce((a, v) => a + v, 0)
      if (opts.rounded) {
        if (Math.abs(sum - t) > (rows.length + 1) * step)
          problems.push(`${f}: rows add to ${sum}, more than ${rows.length + 1} steps from the total ${t}`)
      } else if (Math.abs(sum - t) > 0.005) problems.push(`${f}: rows add to ${sum}, not the total ${t}`)
    }
  }
  if (opts.rounded)
    for (const r of [...rows, total])
      for (const v of [...COST_FIELDS.map((f) => r.amounts[f]), r.totalUsd, r.bandUsd])
        if (v != null && !isRoundedCostTo(v, step))
          problems.push(`${name(r)}: ${v} is not a whole step of ${step}`)
  if (problems.length)
    throw new Error(`expectGuarded${opts.label ? ` ${opts.label}` : ''}: ${problems.join('; ')}`)
}
