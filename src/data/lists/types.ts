/**
 * Official lists: the approved values Headcount Planner checks the data against, one list per
 * category, with their hierarchy (business unit → department → cost center) and the attributes
 * the app reads (a unit's HR business partner, a level's leader marking, a site's legal entity).
 * Pure shapes; the module never imports the store.
 */
import type { FieldRef } from '../quality/fieldRef'
import type { DatasetKey } from '../schema'

export type ListId =
  | 'businessUnit'
  | 'department'
  | 'costCenter'
  | 'location'
  | 'region'
  | 'legalEntity'
  | 'currency'
  | 'level'
  | 'jobFamily'
  | 'reasonCode'
  | 'workerType'
  | 'role'

/**
 * - org: your company's own list (org units, cost centers, sites, legal entities, job families).
 *   Built from the sample company or proposed from your data; checks the data once it is official.
 * - vocab: the app's list for a field, plus values you add (currencies).
 * - fixed: values the app reads exactly (level codes, reason codes, worker types, roles). They can
 *   be retired from the template dropdowns, and their attributes (a level's label and leader
 *   marking, a role's people) can be changed.
 */
export type ListKind = 'org' | 'vocab' | 'fixed'

export type AttrValue = string | number | null

export interface ListAttrDef {
  key: string
  label: string
  type?: 'text' | 'number'
  /** A choice from these values (blank allowed). */
  options?: readonly string[]
  /** The app's own values keep this attribute as the app defines it; values you add can set it. */
  builtInFixed?: boolean
  /** Worked out by the app (a level's track); never edited. */
  derived?: boolean
  /**
   * The number or view that reads it, in one plain sentence ("HRBP mode offers this person for the
   * unit."). Without it the attribute is for reference only.
   */
  readBy?: string
}

export interface ListDef {
  id: ListId
  /** Plural, sentence case: "Departments". */
  label: string
  /** Singular, sentence case: "Department". */
  singular: string
  kind: ListKind
  /** The fields the list checks (and counts rows in), in the order the views read them. */
  refs: readonly FieldRef[]
  /** The list one level up: a department's business unit. */
  parent?: ListId
  attrs: readonly ListAttrDef[]
  /** Workbook sheet name. */
  sheet: string
  /** Workbook defined name for the dropdown range, e.g. "BusinessUnits". */
  name: string
  /** One plain sentence on what the list holds. */
  about: string
  /**
   * For a list no field is checked against (`refs` empty): the datasets its values describe, so it
   * is the sample company's list while they are the sample (the Roles list's people).
   */
  reads?: readonly DatasetKey[]
}

export interface ListValue {
  /** The name (the code for levels and cost centers). */
  value: string
  /** The value one level up (business unit of a department), or null when none is set. */
  parent?: string | null
  attrs?: Record<string, AttrValue>
  /** Retired: no longer offered in template dropdowns, still recognized in older rows. */
  retired?: boolean
  /** For a retired value: the value that replaced it. */
  replacedBy?: string | null
  /** One of the app's own values (vocabulary and fixed lists): its name stays. */
  builtIn?: boolean
  /** Added by you; it can be deleted while no row uses it. */
  added?: boolean
}

export type ListStatus = 'official' | 'proposed'

/** Where a list came from. */
export type ListSource =
  /** Saved by you (made official, edited or imported). */
  | 'saved'
  /** The sample company's list, shipped as official while the sample is loaded. */
  | 'sample'
  /** Proposed from your data; not official until you make it so. */
  | 'data'
  /** The app's own vocabulary. */
  | 'builtin'

/**
 * A list you saved. It stays as saved whatever data is loaded, and checks the kind of data it was
 * built for: one saved from the sample company's list checks the sample, one built from your data
 * or a file checks yours (the app's own lists check both). With the other kind loaded it reads as
 * proposed until you keep checking against it (`always`) or rebuild it.
 */
export interface SavedList {
  values: ListValue[]
  /** What it was built from when first saved: the sample company, your data, the app's list, or a file. */
  basis: 'sample' | 'data' | 'builtin' | 'file'
  /** ISO date-time it was first saved. */
  at: string
  /** Changes to a proposed list: kept, but it checks nothing until you make it official. */
  draft?: boolean
  /** You chose to keep checking against it whatever data is loaded. */
  always?: boolean
}

/**
 * Why a saved list checks nothing now: it is a draft, or it was built for the other kind of data
 * ('sample': saved from the sample's list while your data is loaded; 'yours': built from your data
 * or a file while the sample is loaded).
 */
export type ListPause = 'draft' | 'sample' | 'yours'

/** One step of a change; each has an exact inverse, so any change can be undone. */
export type ListOp =
  /** A list becomes saved (before null), stops being saved (after null) or is replaced whole. */
  | { op: 'save'; list: ListId; before: SavedList | null; after: SavedList | null }
  | { op: 'add'; list: ListId; value: ListValue; index: number }
  | { op: 'remove'; list: ListId; value: ListValue; index: number }
  /** Renames the value, and the values that name it as their parent or replacement. */
  | { op: 'rename'; list: ListId; from: string; to: string }
  /** Changes parent, retired, replacedBy or attributes of one value. */
  | { op: 'set'; list: ListId; value: string; before: ValuePatch; after: ValuePatch }

export interface ValuePatch {
  parent?: string | null
  retired?: boolean
  replacedBy?: string | null
  attrs?: Record<string, AttrValue>
}

export interface ListChange {
  id: string
  /** ISO date-time. */
  at: string
  /** Who made it; null reads "you". */
  by: string | null
  /** Plain sentence: "Added Photonics to departments." */
  what: string
  /** Every list the change touched. */
  lists: ListId[]
  ops: ListOp[]
  /** The change this one undid, when it is an undo. */
  undoes?: string
}

/** What is kept in this browser under `hcp:lists`. */
export interface ListsState {
  lists: Partial<Record<ListId, SavedList>>
  /** Newest first. */
  log: ListChange[]
}

/** A list as the app uses it now: saved, the sample's, proposed from your data or the app's own. */
export interface EffectiveList {
  def: ListDef
  status: ListStatus
  source: ListSource
  /** For a saved list, what it was first built from. */
  basis: SavedList['basis'] | null
  values: readonly ListValue[]
  /** Values in the data that are not on the list count as not recognized. */
  validates: boolean
  /** For a saved list that checks nothing now: why. */
  paused?: ListPause
}

export type EffectiveLists = Readonly<Record<ListId, EffectiveList>>

/** What the change functions are asked to do. */
export type ListEdit =
  | { kind: 'add'; list: ListId; value: string; parent?: string | null; attrs?: Record<string, AttrValue> }
  | { kind: 'add-many'; list: ListId; values: readonly ListValue[] }
  | { kind: 'rename'; list: ListId; from: string; to: string }
  | { kind: 'retire'; list: ListId; value: string; replacedBy?: string | null }
  | { kind: 'restore'; list: ListId; value: string }
  | { kind: 'move'; list: ListId; value: string; parent: string | null }
  | { kind: 'attrs'; list: ListId; value: string; attrs: Record<string, AttrValue> }
  | { kind: 'delete'; list: ListId; value: string }
  | { kind: 'make-official'; list: ListId }
  /** Replace the whole list (start over from your data). */
  | { kind: 'replace'; list: ListId; values: readonly ListValue[]; basis: SavedList['basis'] }
