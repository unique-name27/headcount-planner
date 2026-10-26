/**
 * The scopes a mode holds (docs/PLAN.md 8.2): Manager and Leader hold a position tree, HRBP holds
 * one business unit; Finance and HR admin hold none (the whole company), and so do the CEO, CFO and
 * CHRO in Leader mode. HCP plans positions, not people, so every scope is a set of position IDs,
 * with the people in them (current and former) beside it for the position card and the records
 * guard.
 *
 * An unset or gone pick holds an EMPTY scope of its kind (`unset: true`), never the whole company
 * (the template app's rule).
 *
 * Types only: `src/cost/` may `import type` from this file (`ScopeLock` in `costFit`, docs/PLAN.md 4),
 * so it never imports anything at runtime.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md).
 */

import type { ListDimension } from '@/data/scope'

/** The scope kinds: a position tree (Manager, Leader) or one business unit (HRBP). */
export type ScopeKind = 'tree' | 'unit'

/**
 * The values each list filter takes over a scope's positions (null: some position has none), so the
 * clamp can drop a filter that would leave out every position of the scope (a filter another mode
 * left behind). An addition to the M2 freeze; an empty scope has none.
 */
export type ScopeValues = Readonly<Record<ListDimension, ReadonlySet<string | null>>>

/** One direct sub-org of a tree: a direct report seat's subtree (Leader targets, rounded cost rows). */
export interface SubOrg {
  /** The direct report seat heading the sub-org. */
  positionId: string
  /** "Design Verification (Dana Ito)": what a row says. */
  label: string
  /** The seat and every position below it, as of the as-of date. */
  positionIds: ReadonlySet<string>
  /**
   * The cost atoms (src/cost/atoms.ts, last close's index) the sub-org is a whole union of; null when
   * it cuts an atom, so its row shows heads only in rounded modes (docs/PLAN.md 7.3a).
   */
  atoms: readonly string[] | null
}

/**
 * A Manager's or Leader's tree (docs/PLAN.md 8.2). A Manager's tree excludes their own seat and
 * everything above it (R23), so nothing about their own seat can reach them.
 */
export interface TreeScope {
  kind: 'tree'
  /** The Acting as person. */
  rootPersonId: string
  rootName: string
  /** The acting person's own seats. */
  rootPositionIds: ReadonlySet<string>
  /** Every position strictly below the roots via managerPositionId, as of the as-of date. */
  positionIds: ReadonlySet<string>
  /** People in those positions, current and former. */
  personIds: ReadonlySet<string>
  /** The direct sub-orgs, in seat order. */
  subOrgs: readonly SubOrg[]
  /** Active employees in the scope. */
  size: number
  /** For copy: "Priya Raman's team", "Dana Ito's org". */
  label: string
  /** The values each list filter takes over `positionIds`; none for an empty tree. */
  values?: ScopeValues
}

/** An HRBP's business unit (docs/PLAN.md 8.2). */
export interface UnitScope {
  kind: 'unit'
  unit: string
  /** Every position of the unit, as of the as-of date. */
  positionIds: ReadonlySet<string>
  /** People in those positions, current and former. */
  personIds: ReadonlySet<string>
  /** Departments whose official parent (else majority unit in the data) is another unit: the clamp drops them. */
  otherDepartments: ReadonlySet<string>
  /** Leader seats whose tree holds a position of the unit: the leader filter keeps only these. */
  leaderPositionIds: ReadonlySet<string>
  /** Active employees in the scope. */
  size: number
  /** For copy: "Silicon Engineering". */
  label: string
  /** The values each list filter takes over `positionIds`; none for an empty unit. */
  values?: ScopeValues
}

/** The scope a mode holds. */
export type ScopeLock = TreeScope | UnitScope

/** A scope and whether its pick is still to be made (an unset pick holds an empty scope). */
export interface HeldScope<S extends ScopeLock = ScopeLock> {
  scope: S
  unset: boolean
}
