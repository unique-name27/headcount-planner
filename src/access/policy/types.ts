/**
 * The policy's shapes (docs/PLAN.md 8.3). A mode's policy is a plain data table (`RolePolicy`): no
 * functions, so a test round-trips it through JSON and the tables can be listed in docs. The
 * template app's fields, plus `actions` (every `action:` id has a decision in every mode). Pure
 * types and three tiny constructors.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). `Decision` here is the policy's answer for a
 * surface; it is not `src/plan/types.ts` `Decision` (an approval step's decision).
 */
import type { DatasetKey, PageKey, ViewKey } from '@/data/schema'
import type { ActionId, DrillKind } from '../ids'
import type { Mode } from '../modes'

export type Access = 'shown' | 'limited' | 'hidden'

export interface Decision {
  access: Access
  /** For limited and hidden: one plain sentence, worded for the mode (the snapshot `access-how.txt`). */
  how?: string
}

/** Where a surface sits: the view (or page) and tab on screen. */
export interface At {
  view: string
  tab?: string
}

/** What `decide` needs beyond the surface for a few kinds. */
export interface DecideInfo {
  /** The views a metric is listed on (`MetricDef.views`); without it only the hide lists apply. */
  metricViews?: (id: string) => readonly string[] | undefined
  /** For `kpi:<id>`: the tile's metric id. */
  metric?: string
}

export const SHOWN: Decision = Object.freeze({ access: 'shown' })
export const limited = (how: string): Decision => ({ access: 'limited', how })
export const hidden = (how: string): Decision => ({ access: 'hidden', how })

/** One tab of a shown view: its key, its label (for the redirect toast) and the mode's decision. */
export interface RoleTab {
  key: string
  label: string
  decision: Decision
}

/** Folder-tab views and the masthead pages (`data`, `actions`, `audit`). */
export type PolicyPlace = ViewKey | PageKey

/** A part of a shown tab, picked in its address with the colon form, hidden with where it goes instead. */
export interface HiddenPart {
  label: string
  /** The tab and part to open instead ("assumptions"). */
  instead: string
  insteadLabel: string
}

/**
 * One mode's table (docs/PLAN.md 8.3). What the table does not name is hidden with "Not named by
 * the <mode> mode policy." Built with the template app's kit helpers (the access builder ports
 * `table.ts` and `kit.ts`).
 */
export interface RolePolicy {
  mode: Mode
  /** Every view and page; a missing one is hidden (the matrix test fails while one is missing). */
  views: Readonly<Record<PolicyPlace, Decision>>
  /** Every tab of every view this mode shows, in tab order. A tab missing here is hidden. */
  tabs: Readonly<Partial<Record<PolicyPlace, readonly RoleTab[]>>>
  /** Parts of shown tabs hidden by address (`'finance.assumptions:trade-rates'`); their decisions are `surfaces` entries. */
  hiddenParts: Readonly<Record<string, HiddenPart>>
  metrics: {
    /** When set, only metrics under these prefixes show. */
    allow?: readonly string[]
    hidePrefixes: readonly string[]
    hide: readonly string[]
  }
  hiddenFigures: readonly string[]
  /** Figure id prefixes hidden wherever they are drawn. */
  hiddenFigurePrefixes: readonly string[]
  /** Drill kinds whose records the mode lists. */
  drillKinds: readonly DrillKind[]
  /**
   * Standard columns of a listed drill kind left out everywhere (`'reqs.offerBase'`); each column's
   * how is `surfaces['column:<kind>.<key>']`. Absent: none.
   */
  hiddenColumns?: readonly string[]
  /** The decision for a listed drill kind (scoped modes: limited, rows outside the scope left out). */
  drillListed: Decision
  datasets: readonly DatasetKey[]
  /** Action center items left out by id prefix; each prefix's how is `surfaces['item:<prefix>']`. */
  hiddenItemPrefixes: readonly string[]
  articles: Readonly<Record<string, Decision>>
  tours: Readonly<Record<string, Decision>>
  /**
   * Every other named surface (masthead, header, settings, help, filter, export, focus, shortcut,
   * ui, pay, leave, cost, page, item, tab parts, single metrics). An exact surface here wins.
   */
  surfaces: Readonly<Record<string, Decision>>
  /** Every action (`action:<id>`, docs/PLAN.md 8.3 and 11.6), each with its decision. */
  actions: Readonly<Record<ActionId, Decision>>
}
