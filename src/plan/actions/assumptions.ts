/**
 * Assumption edits in Working (docs/PLAN.md 5.2, 7.4, 8.3, 15.1 R18, R35, R37; Finance > Assumptions).
 * Each row sets one value (table, org, key) for one Working version; it replaces the imported row
 * with the same key in `state.overlay.assumptions`, one audit entry per row (object 'assumption',
 * `id` '<version>|<table>|<org>|<key>', field 'value'; auditView reads it "changed" wherever
 * `cost:band` is hidden). Locked versions are read only (WORKING_ONLY_TEXT). Pure.
 *
 * - editAssumptions (`assumptions.edit`; Finance limited, HR admin shown): Finance edits FX, bands,
 *   burden rates, benefits, severance months, equity, forecast drivers (attrition included), GL
 *   accounts and trade rates; burden caps, the merit date and cutoff, the promotion-pool date, bonus
 *   target and funding and the merit and promotion-pool percentages are HR admin's ("Set by
 *   import."). Every Finance edit passes 7.4's edit rule through `env.assumptionEditRefusal` (refused
 *   with "This change would move cost for fewer than 5 costed people." when it moves 1 to 4
 *   contributors in all, or in any one month within one part of Finance's fold). HR admin's edits
 *   are not refused by the rule.
 * - editOperational (`assumptions.edit-operational`; HRBP limited, Finance and HR admin shown): time
 *   to fill, fill rate, backfill rate and backfill lag only (OPERATIONAL_ONLY_TEXT), and for HRBP
 *   only its own unit's rows (org = its unit or a department in it: OUTSIDE_UNIT_TEXT), in Working.
 *   These move only the band part (7.2 rule 3), so they pass no edit rule.
 * - removeOverride (M3 review, CONTRACTS-M3 7.4 item 2): an org's row (a unit's or a department's)
 *   taken back, so the value falls back to its parent's (the unit's, then the company's), under the
 *   id the row's owner edits it with: `assumptions.edit` where the mode has it (Finance through 7.4's
 *   edit rule, priced as setting the org's value to the parent's; HR admin), else
 *   `assumptions.edit-operational` (an HRBP's own unit's operational rows). The overlay drops its own
 *   row for the key and records the key in `overlay.removedAssumptions`, so an imported row goes too
 *   (src/plan/store/overlay.ts); setting the key again later takes the removal back. One audit entry
 *   (field 'override removed', old the override's value, new the parent's).
 * - FX rates are the company's: an FX row keyed to an org is refused in every mode (ORG_FX_TEXT), and
 *   Remove override has no FX row to take back (review recheck: such a row was read by no engine
 *   but still priced by a month close).
 * - Every value is checked against its table's unit before anything else (review IN-8): a value that
 *   is not a finite number, or outside the unit's range (a fraction from 0 to 1, days, months and
 *   amounts 0 or more, an FTE above 0 and at most 1, a flag 0 or 1, a date as YYYYMMDD), is refused
 *   with one sentence naming the table (`assumptionRangeText`).
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import {
  ASSUMPTION_ANY_KEY,
  ASSUMPTION_KEY_SEP,
  ASSUMPTION_KEYS,
  type AssumptionTable,
  type AssumptionUnit,
  isHrAdminOnly,
  splitAssumptionKey,
} from '@/data/schema'
import { isCalendarDate } from '@/lib/dates'
import { assumptionLookup } from '../engine/assumptions'
import type { AssumptionRow, PlanState } from '../types'
import {
  ASSUMPTIONS_SAVED_NOTICE,
  assumptionRangeText,
  NO_OVERRIDE_TEXT,
  NO_PARENT_VALUE_TEXT,
  NO_VALUE_TEXT,
  NOT_FOUND_TEXT,
  OPERATIONAL_ONLY_TEXT,
  ORG_FX_TEXT,
  OUTSIDE_UNIT_TEXT,
  OVERRIDE_REMOVED_NOTICE,
  SET_BY_IMPORT_TEXT,
  WORKING_ONLY_TEXT,
} from './copy'
import { decisionOf, gate, isLimited } from './gate'
import { auditOf, no, ok, putAssumptions } from './shared'
import type { ActionContext, ActionResult } from './types'
import {
  assumptionAudit,
  assumptionAuditId,
  editRefusal,
  orgFxRow,
  rowFor,
  rowKeyOf,
  rowsOfVersion,
} from './versions'

export interface AssumptionEditInput {
  /** A Working version. */
  versionId: string
  /** The values set; each row's `version` is replaced by `versionId`. */
  rows: readonly AssumptionRow[]
}

/** Remove override: one org's row of a table in a Working version (CONTRACTS-M3 8.x). */
export interface RemoveOverrideInput {
  /** A Working version. */
  versionId: string
  table: AssumptionTable
  /** The unit or department whose row is taken back; never blank (the company's row is no override). */
  org: string
  key: string
}

/* ───────────── values (review IN-8) ───────────── */

/** A row's unit: the table's, or its part's for a table keyed by part. */
function unitOf(r: Pick<AssumptionRow, 'table' | 'key'>): { unit: AssumptionUnit; label: string } | null {
  const def = ASSUMPTION_KEYS[r.table]
  if (!def) return null
  if (def.unit !== 'by part') return { unit: def.unit, label: def.label }
  const at = def.dims.indexOf('part')
  const part = def.parts?.[splitAssumptionKey(r.key)[at] ?? '']
  return part ? { unit: part.unit, label: part.label } : null
}

/** What each unit allows: the test and the words. */
const RANGES: Readonly<Record<AssumptionUnit, { ok: (v: number) => boolean; words: string }>> = {
  fraction: { ok: (v) => v >= 0 && v <= 1, words: 'is from 0 to 1' },
  local: { ok: (v) => v >= 0, words: 'is 0 or more' },
  usd: { ok: (v) => v >= 0, words: 'is 0 or more' },
  months: { ok: (v) => v >= 0, words: 'is 0 or more' },
  days: { ok: (v) => v >= 0, words: 'is 0 or more' },
  usdPerLocal: { ok: (v) => v > 0, words: 'is above 0' },
  fte: { ok: (v) => v > 0 && v <= 1, words: 'is above 0 and at most 1' },
  flag: { ok: (v) => v === 0 || v === 1, words: 'is 0 or 1' },
  code: { ok: (v) => Number.isInteger(v) && v >= 0, words: 'is a whole number, 0 or more' },
  yyyymmdd: {
    ok: (v) => {
      if (!Number.isInteger(v)) return false
      const t = String(v)
      return t.length === 8 && isCalendarDate(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`)
    },
    words: 'is a date written as YYYYMMDD',
  },
}

/** Tables whose fraction may pass 1 (a bonus pool funded above target). */
const OVER_ONE: ReadonlySet<AssumptionTable> = new Set(['bonusFunding'])

/** The first row whose value its unit does not allow, as a refusal; null when every value fits. */
export function valueRefusal(rows: readonly AssumptionRow[]): string | null {
  for (const r of rows) {
    const u = unitOf(r)
    const v = r.value
    const range =
      u?.unit === 'fraction' && OVER_ONE.has(r.table) ? RANGES.local : u ? RANGES[u.unit] : RANGES.local
    if (typeof v !== 'number' || !Number.isFinite(v) || !range.ok(v))
      return assumptionRangeText(u?.label ?? ASSUMPTION_KEYS[r.table]?.label ?? 'This table', range.words)
  }
  return null
}

/** The tables an HRBP may edit in Working for its unit (R18). */
export const OPERATIONAL_TABLES: ReadonlySet<AssumptionTable> = new Set([
  'timeToFill',
  'fillRate',
  'backfillRate',
  'backfillLag',
])

/** The version edited, a Working one; or the refusal. */
function workingVersion(state: PlanState, versionId: string) {
  const v = state.versions.find((x) => x.versionId === versionId)
  if (!v) return { refused: NOT_FOUND_TEXT }
  if (v.state !== 'working') return { refused: WORKING_ONLY_TEXT }
  return { v }
}

/** Whether a row names a version, by ID or by name. */
const ofVersion = (r: Pick<AssumptionRow, 'version'>, v: { versionId: string; name: string }): boolean => {
  const x = (r.version ?? '').trim()
  return x === v.versionId.trim() || x === v.name.trim()
}

/** A key as stored: its dimensions trimmed and re-joined; an empty key is '*'. */
const normalKey = (key: string): string => {
  const parts = splitAssumptionKey(key)
  return parts.length === 1 && parts[0] === '' ? ASSUMPTION_ANY_KEY : parts.join(ASSUMPTION_KEY_SEP)
}

/** Plan state with removals of these rows' keys taken back (a value set again after Remove override). */
function unremoved(state: PlanState, rows: readonly AssumptionRow[], v: { versionId: string; name: string }) {
  const removed = state.overlay.removedAssumptions ?? []
  if (!removed.length) return state
  const keys = new Set(rows.map((r) => rowKeyOf(r)))
  const kept = removed.filter((r) => !(ofVersion(r, v) && keys.has(rowKeyOf(r))))
  return kept.length === removed.length
    ? state
    : { ...state, overlay: { ...state.overlay, removedAssumptions: kept } }
}

/** Writes the rows (each naming the version) with one audit entry per row. */
function save(
  state: PlanState,
  ctx: ActionContext,
  versionId: string,
  rows: readonly AssumptionRow[],
  v: Parameters<typeof rowsOfVersion>[1],
): ActionResult {
  const named = rows.map((r) => rowFor(r, versionId))
  const before = new Map(rowsOfVersion(ctx, v).map((r) => [rowKeyOf(r), r.value]))
  for (const r of state.overlay.assumptions)
    if ((r.version ?? '').trim() === versionId) before.set(rowKeyOf(r), r.value)
  return ok(
    putAssumptions(unremoved(state, named, v), named),
    assumptionAudit(ctx, versionId, named, before),
    ASSUMPTIONS_SAVED_NOTICE,
  )
}

/** The HRBP's own org (its unit, or a department that sits only in its units), as the action reads it. */
function ownOrgOf(ctx: ActionContext): (org: string | null | undefined) => boolean {
  const units = ctx.rules.hrbpUnits
  const deptUnit = new Map<string, Set<string>>()
  for (const p of ctx.datasets.positions)
    if (p.department) {
      const s = deptUnit.get(p.department) ?? new Set<string>()
      s.add(p.businessUnit)
      deptUnit.set(p.department, s)
    }
  return (org) => {
    const o = (org ?? '').trim()
    if (!o) return false
    if (units.has(o)) return true
    const of = deptUnit.get(o)
    return !!of && [...of].every((u) => units.has(u))
  }
}

/** `assumptions.edit`: Finance's and HR admin's assumption edits, under 7.4's edit rule for Finance. */
export function editAssumptions(
  state: PlanState,
  ctx: ActionContext,
  input: AssumptionEditInput,
): ActionResult {
  const g = gate(ctx, 'assumptions.edit')
  if (g) return no(g)
  const found = workingVersion(state, input.versionId)
  if ('refused' in found) return no(found.refused ?? NOT_FOUND_TEXT)
  if (!input.rows.length) return no(NO_VALUE_TEXT)
  const bad = valueRefusal(input.rows)
  if (bad) return no(bad)
  // FX rates are the company's: an org's FX row is read by no engine (review recheck).
  if (input.rows.some(orgFxRow)) return no(ORG_FX_TEXT)
  const rows = input.rows.map((r) => rowFor(r, input.versionId))
  const why = editRefusal(ctx, rows, input.versionId, state.closes)
  if (why) return no(why)
  return save(state, ctx, input.versionId, rows, found.v)
}

/** `assumptions.edit-operational`: time to fill, fill rate and backfill settings (HRBP: its unit). */
export function editOperational(
  state: PlanState,
  ctx: ActionContext,
  input: AssumptionEditInput,
): ActionResult {
  const g = gate(ctx, 'assumptions.edit-operational')
  if (g) return no(g)
  const found = workingVersion(state, input.versionId)
  if ('refused' in found) return no(found.refused ?? NOT_FOUND_TEXT)
  if (!input.rows.length) return no(NO_VALUE_TEXT)
  if (input.rows.some((r) => !OPERATIONAL_TABLES.has(r.table))) return no(OPERATIONAL_ONLY_TEXT)
  const bad = valueRefusal(input.rows)
  if (bad) return no(bad)
  if (isLimited(ctx, 'assumptions.edit-operational')) {
    // HRBP: its own unit's rows only (the unit, or a department of it); never the company's.
    const ownOrg = ownOrgOf(ctx)
    if (input.rows.some((r) => !ownOrg(r.org))) return no(OUTSIDE_UNIT_TEXT)
  }
  return save(state, ctx, input.versionId, input.rows, found.v)
}

/**
 * Remove override (see the module comment): an org's row of a table taken back in Working, so the
 * value is its parent's again.
 */
export function removeOverride(
  state: PlanState,
  ctx: ActionContext,
  input: RemoveOverrideInput,
): ActionResult {
  // assumptions.edit where the mode has it (Finance, HR admin), else the HRBP's operational id,
  // whose refusal is the one a mode with neither reads (ACTION_CHECKS lists it first).
  const id =
    decisionOf(ctx, 'assumptions.edit').access === 'hidden'
      ? 'assumptions.edit-operational'
      : 'assumptions.edit'
  const g = gate(ctx, id)
  if (g) return no(g)
  const found = workingVersion(state, input.versionId)
  if ('refused' in found) return no(found.refused ?? NOT_FOUND_TEXT)
  const v = found.v
  const org = (input.org ?? '').trim()
  const key = normalKey(input.key ?? '')
  if (!org || !ASSUMPTION_KEYS[input.table]) return no(NO_OVERRIDE_TEXT)
  if (input.table === 'fx') return no(ORG_FX_TEXT)
  if (id === 'assumptions.edit-operational') {
    if (!OPERATIONAL_TABLES.has(input.table)) return no(OPERATIONAL_ONLY_TEXT)
    if (isLimited(ctx, id) && !ownOrgOf(ctx)(org)) return no(OUTSIDE_UNIT_TEXT)
  } else if (ctx.mode !== 'hr-admin' && isHrAdminOnly(input.table)) return no(SET_BY_IMPORT_TEXT)

  const rows = rowsOfVersion(ctx, v)
  const isIt = (r: AssumptionRow): boolean =>
    r.table === input.table && (r.org ?? '').trim() === org && normalKey(r.key) === key
  const row = rows.find(isIt)
  if (!row) return no(NO_OVERRIDE_TEXT)
  // The parent's value: the same key read for the org with the org's own row left out.
  const unit = ctx.datasets.positions.some((p) => p.businessUnit === org)
    ? org
    : (ctx.datasets.positions.find((p) => p.department === org)?.businessUnit ?? '')
  const path =
    unit === org ? { businessUnit: org, department: null } : { businessUnit: unit, department: org }
  const parent = assumptionLookup(
    rows.filter((r) => !isIt(r)),
    v,
  ).get(input.table, splitAssumptionKey(key), path)
  if (!parent) return no(NO_PARENT_VALUE_TEXT)
  // 7.4's edit rule prices the removal as the org's value set to the parent's (Finance).
  if (id === 'assumptions.edit') {
    const why = editRefusal(
      ctx,
      [rowFor({ ...row, value: parent.value }, v.versionId)],
      v.versionId,
      state.closes,
    )
    if (why) return no(why)
  }
  const named = rowFor(row, v.versionId)
  const k = rowKeyOf(named)
  const overlay = state.overlay
  const next: PlanState = {
    ...state,
    overlay: {
      ...overlay,
      assumptions: overlay.assumptions.filter((r) => !(ofVersion(r, v) && rowKeyOf(r) === k)),
      removedAssumptions: [
        ...(overlay.removedAssumptions ?? []).filter((r) => !(ofVersion(r, v) && rowKeyOf(r) === k)),
        named,
      ],
    },
  }
  const audit = [
    auditOf(
      ctx,
      'assumption',
      assumptionAuditId(v.versionId, named),
      'override removed',
      row.value,
      parent.value,
    ),
  ]
  return ok(next, audit, OVERRIDE_REMOVED_NOTICE)
}
