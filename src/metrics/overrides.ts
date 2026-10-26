/**
 * Your changes to the dictionary: wording, targets and settings, each validated against the
 * metric's definition, kept as differences from the defaults, and logged (what, from, to, when,
 * by whom). Every logged change can be undone while it is the latest for its field; a metric or
 * the whole dictionary can be reset. Pure reducers; the store holds the state and persists it.
 *
 * Ported from the template app. HCP's changes: a change's id is a checksum of the change and the
 * entry before it (no random part, so the same edits always log the same ids), and no setting has
 * moved home yet, so stored state is read as it is.
 */
import { fmt } from '@/lib/format'
import { sha256 } from '@/lib/sha256'
import { cloneParam, formatParam, sameParam, validateParam } from './params'
import { fieldLabel, isFieldOf, isTextField, type MetricCatalog, paramKeyOf, paramOf } from './registry'
import {
  type ChangeKind,
  type EditResult,
  type LoggedValue,
  type MetricChange,
  type MetricDef,
  type MetricEdit,
  type MetricField,
  type MetricOverride,
  type MetricOverrides,
  type MetricsState,
  type MetricTarget,
  type ParamValue,
  TEXT_FIELDS,
  type TextField,
} from './types'

export const EMPTY_METRICS: MetricsState = { overrides: {}, log: [] }

/** Change-log entries kept, newest first. */
export const MAX_LOG = 500

/** Longest wording accepted, in characters. */
export const MAX_TEXT: Record<TextField, number> = {
  definition: 2000,
  formula: 500,
  population: 1000,
  owner: 120,
}

export interface ChangeOpts {
  /** Who made the change (the Acting as name); blank means "you". */
  by?: string | null
  /** When (an ISO date-time, a Date or epoch ms); now by default, which only the store relies on. */
  at?: string | Date | number
  kind?: ChangeKind
}

const isoAt = (at: ChangeOpts['at']): string =>
  at == null ? new Date().toISOString() : typeof at === 'string' ? at : new Date(at).toISOString()

/**
 * A change's id: 'mc-' and a checksum of the change and the id of the entry logged before it, so
 * two changes never share an id in one log and the same edits always log the same ids.
 */
function changeId(prev: MetricChange | undefined, entry: Omit<MetricChange, 'id'>): string {
  const text = JSON.stringify([
    prev?.id ?? '',
    entry.metricId,
    entry.field,
    entry.from,
    entry.to,
    entry.at,
    entry.by ?? '',
    entry.kind,
  ])
  return `mc-${sha256(text).slice(0, 16)}`
}

/* ───────────── values ───────────── */

/** Two logged values are the same (numbers within float noise, deep for maps, ranges and targets). */
export const sameValue = (a: LoggedValue | undefined, b: LoggedValue | undefined): boolean =>
  sameParam(a ?? null, b ?? null)

function copyValue<T extends LoggedValue>(v: T): T {
  if (v == null || typeof v !== 'object') return v
  if (Array.isArray(v)) return [v[0], v[1]] as unknown as T
  return { ...(v as object) } as T
}

/** The default of a field: the registered wording, target or setting value (null for none). */
export function defaultValue(def: MetricDef, field: MetricField): LoggedValue {
  if (isTextField(field)) return def[field]?.trim() ? (def[field] as string) : null
  if (field === 'target') return def.target ? { ...def.target } : null
  const p = paramOf(def, paramKeyOf(field) ?? '')
  return p ? cloneParam(p.default) : null
}

/** The value in force: yours when you changed it, otherwise the default. */
export function currentValue(def: MetricDef, o: MetricOverride | undefined, field: MetricField): LoggedValue {
  if (o) {
    if (isTextField(field)) {
      const t = o.text[field]
      if (t !== undefined) return t === '' ? null : t
    } else if (field === 'target') {
      if (o.target !== undefined) return o.target ? { ...o.target } : null
    } else {
      const key = paramKeyOf(field)
      if (key != null && o.params[key] !== undefined) return cloneParam(o.params[key])
    }
  }
  return defaultValue(def, field)
}

/** Every field a metric has, in display order: wording, target, then settings. */
export const fieldsOf = (def: MetricDef): MetricField[] => [
  ...TEXT_FIELDS,
  'target',
  ...def.params.map((p) => `params.${p.key}` as MetricField),
]

/** The fields that differ from their defaults. */
export function changedFields(def: MetricDef, o: MetricOverride | undefined): MetricField[] {
  if (!o) return []
  return fieldsOf(def).filter((f) => !sameValue(currentValue(def, o, f), defaultValue(def, f)))
}

/* ───────────── checks ───────────── */

const PCT_UNITS = new Set(['pct', 'pct0', 'pct2'])
const NON_NEGATIVE_UNITS = new Set([
  'int',
  'compact',
  'days',
  'hours',
  'years',
  'money',
  'moneyFull',
  'num1',
  'num2',
  'ratio',
  'times',
])

/** "Opening age" → "opening age"; a leading acronym ("FX effect") keeps its case. */
const lowerFirst = (s: string): string =>
  /^[A-Z][A-Z0-9]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1)

export function checkTarget(
  def: MetricDef,
  value: unknown,
): { ok: true; value: MetricTarget | null } | { ok: false; error: string } {
  const fixed = def.targetRequired ? (def.target?.comparator ?? null) : null
  if (value == null)
    return fixed
      ? {
          ok: false,
          error: `${def.name} needs a target: the status marks and the readout are calculated with it. Change its value instead.`,
        }
      : { ok: true, value: null }
  const t = value as Partial<MetricTarget>
  // "Under" is kept for targets registered that way; a person picks at least or at most.
  const strictOk = t.comparator === '<' && def.target?.comparator === '<'
  if (typeof value !== 'object' || (t.comparator !== '>=' && t.comparator !== '<=' && !strictOk))
    return { ok: false, error: 'Choose "at least" or "at most" for the target.' }
  if (fixed && t.comparator !== fixed)
    return {
      ok: false,
      error: `The target of ${lowerFirst(def.name)} is always "${comparatorText(fixed).toLowerCase()}": the status marks are calculated that way. Change its value instead.`,
    }
  if (typeof t.value !== 'number' || !Number.isFinite(t.value))
    return { ok: false, error: 'Enter a number for the target.' }
  if (PCT_UNITS.has(def.unit) && (t.value < 0 || t.value > 1))
    return { ok: false, error: 'Enter a target from 0% to 100%.' }
  if (NON_NEGATIVE_UNITS.has(def.unit) && t.value < 0)
    return { ok: false, error: 'Enter a target of 0 or more.' }
  return {
    ok: true,
    value: { value: +t.value.toPrecision(12), comparator: t.comparator as MetricTarget['comparator'] },
  }
}

/** "At least", "At most" or "Under". */
export const comparatorText = (c: MetricTarget['comparator']): string =>
  c === '>=' ? 'At least' : c === '<' ? 'Under' : 'At most'

/** The direction a new target takes by default: "at most" when lower is better, otherwise "at least". */
export const defaultComparator = (def: Pick<MetricDef, 'goodDirection'>): MetricTarget['comparator'] =>
  def.goodDirection === 'down' ? '<=' : '>='

/**
 * A caution when a target points against the metric's good direction: "at most" on a metric where
 * higher is better rewards a lower number. Null when the direction agrees, or the metric has none.
 */
export function targetDirectionWarning(
  def: Pick<MetricDef, 'goodDirection'>,
  t: MetricTarget | null | undefined,
): string | null {
  if (!t || !def.goodDirection) return null
  const ceiling = t.comparator !== '>='
  if (def.goodDirection === 'up' && ceiling)
    return 'Higher is better for this metric, so a target is usually "at least". "At most" treats a higher number as a miss.'
  if (def.goodDirection === 'down' && !ceiling)
    return 'Lower is better for this metric, so a target is usually "at most". "At least" treats a lower number as a miss.'
  return null
}

/**
 * Validate a requested value for one field of a metric. Wording is trimmed (a definition can't be
 * empty; '' or null clears the optional fields); a target is "at least" or "at most" a number in
 * the metric's unit; a setting is checked against its definition, locks included. Locked rules
 * keep their wording and target.
 */
export function checkEdit(
  def: MetricDef,
  field: MetricField,
  value: unknown,
): { ok: true; value: LoggedValue } | { ok: false; error: string } {
  if (!isFieldOf(def, field)) return { ok: false, error: `${def.name} has no field called ${field}.` }
  if (isTextField(field)) {
    if (def.locked) return { ok: false, error: `The wording of ${lowerFirst(def.name)} is locked.` }
    if (value != null && typeof value !== 'string')
      return { ok: false, error: `${fieldLabel(def, field)}: enter text.` }
    const t = (value ?? '').replace(/\r\n?/g, '\n').trim()
    if (field === 'definition' && !t) return { ok: false, error: "A definition can't be empty." }
    if (t.length > MAX_TEXT[field])
      return {
        ok: false,
        error: `${fieldLabel(def, field)}: keep it under ${MAX_TEXT[field].toLocaleString('en-US')} characters.`,
      }
    return { ok: true, value: t || null }
  }
  if (field === 'target') {
    if (def.locked) return { ok: false, error: `The target of ${lowerFirst(def.name)} is locked.` }
    return checkTarget(def, value)
  }
  const p = paramOf(def, paramKeyOf(field) ?? '')!
  const check = validateParam(p, value)
  return check.ok ? { ok: true, value: check.value } : check
}

/* ───────────── state updates ───────────── */

const emptyOverride = (): MetricOverride => ({ text: {}, params: {} })

const isEmptyOverride = (o: MetricOverride): boolean =>
  Object.keys(o.text).length === 0 && o.target === undefined && Object.keys(o.params).length === 0

/** The override with one field set to `value`, or cleared when `value` is the default. */
function withValue(
  def: MetricDef,
  o: MetricOverride | undefined,
  field: MetricField,
  value: LoggedValue,
): MetricOverride | undefined {
  const next: MetricOverride = o
    ? {
        text: { ...o.text },
        ...(o.target !== undefined ? { target: o.target } : {}),
        params: { ...o.params },
      }
    : emptyOverride()
  const isDefault = sameValue(value, defaultValue(def, field))
  if (isTextField(field)) {
    if (isDefault) delete next.text[field]
    else next.text[field] = (value as string | null) ?? ''
  } else if (field === 'target') {
    if (isDefault) delete next.target
    else next.target = value ? { ...(value as MetricTarget) } : null
  } else {
    const key = paramKeyOf(field)!
    if (isDefault) delete next.params[key]
    else next.params[key] = cloneParam(value as ParamValue)
  }
  return isEmptyOverride(next) ? undefined : next
}

function setOverride(overrides: MetricOverrides, id: string, o: MetricOverride | undefined): MetricOverrides {
  const next = { ...overrides }
  if (o) next[id] = o
  else delete next[id]
  return next
}

function logEntry(
  prev: MetricChange | undefined,
  metricId: string,
  field: MetricField,
  from: LoggedValue,
  to: LoggedValue,
  opts: ChangeOpts,
): MetricChange {
  const by = opts.by?.trim()
  const entry: Omit<MetricChange, 'id'> = {
    metricId,
    field,
    from: copyValue(from),
    to: copyValue(to),
    at: isoAt(opts.at),
    ...(by ? { by } : {}),
    kind: opts.kind ?? 'edit',
  }
  return { id: changeId(prev, entry), ...entry }
}

/** Set a field to an already validated value, logging the change. */
function put(
  state: MetricsState,
  def: MetricDef,
  field: MetricField,
  to: LoggedValue,
  opts: ChangeOpts,
): EditResult {
  const o = state.overrides[def.id]
  const from = currentValue(def, o, field)
  if (sameValue(from, to)) return { ok: true, state, change: null }
  const change = logEntry(state.log[0], def.id, field, from, to, opts)
  return {
    ok: true,
    change,
    state: {
      overrides: setOverride(state.overrides, def.id, withValue(def, o, field, to)),
      log: [change, ...state.log].slice(0, MAX_LOG),
    },
  }
}

/**
 * Apply one change. Returns the new state and the logged change (null when the value was already
 * in force), or why it was refused.
 */
export function applyEdit(
  state: MetricsState,
  catalog: MetricCatalog,
  edit: MetricEdit,
  opts: ChangeOpts = {},
): EditResult {
  const def = catalog.byId.get(edit.metricId)
  if (!def) return { ok: false, error: `No metric has the id ${edit.metricId}.` }
  // Asking for the value already in force changes nothing, even on a locked field.
  if (isFieldOf(def, edit.field)) {
    const loose = typeof edit.value === 'string' ? edit.value.trim() || null : edit.value
    if (sameValue(loose as LoggedValue, currentValue(def, state.overrides[def.id], edit.field)))
      return { ok: true, state, change: null }
  }
  const check = checkEdit(def, edit.field, edit.value)
  if (!check.ok) return check
  return put(state, def, edit.field, check.value, opts)
}

export interface BatchResult {
  state: MetricsState
  applied: MetricChange[]
  rejected: { edit: MetricEdit; error: string }[]
}

/** Apply several changes in order; each is validated on its own and a refused one changes nothing. */
export function applyEdits(
  state: MetricsState,
  catalog: MetricCatalog,
  edits: readonly MetricEdit[],
  opts: ChangeOpts = {},
): BatchResult {
  let s = state
  const applied: MetricChange[] = []
  const rejected: BatchResult['rejected'] = []
  const at = isoAt(opts.at)
  for (const edit of edits) {
    const r = applyEdit(s, catalog, edit, { ...opts, at })
    if (!r.ok) rejected.push({ edit, error: r.error })
    else if (r.change) {
      s = r.state
      applied.push(r.change)
    }
  }
  return { state: s, applied, rejected }
}

/**
 * A change can be undone while it is the latest entry for its field and its value is still in
 * force (after an undo, the undo itself is the entry that offers Undo).
 */
export function canUndo(state: MetricsState, catalog: MetricCatalog, changeId: string): boolean {
  const entry = state.log.find((c) => c.id === changeId)
  if (!entry) return false
  const def = catalog.byId.get(entry.metricId)
  if (!def || !isFieldOf(def, entry.field)) return false
  if (state.log.find((c) => c.metricId === entry.metricId && c.field === entry.field) !== entry) return false
  return sameValue(currentValue(def, state.overrides[def.id], entry.field), entry.to)
}

/** Undo one change (or the latest one that can be undone): its field goes back to its old value. */
export function undoChange(
  state: MetricsState,
  catalog: MetricCatalog,
  changeId?: string,
  opts: Omit<ChangeOpts, 'kind'> = {},
): MetricsState {
  const entry = changeId
    ? state.log.find((c) => c.id === changeId)
    : state.log.find((c) => canUndo(state, catalog, c.id))
  if (!entry || !canUndo(state, catalog, entry.id)) return state
  const def = catalog.byId.get(entry.metricId)!
  // The old value is checked again: the definition may have changed since (a tighter maximum).
  const check = checkEdit(def, entry.field, entry.from)
  if (!check.ok) return state
  const r = put(state, def, entry.field, check.value, { ...opts, kind: 'undo' })
  return r.ok ? r.state : state
}

/** Put every field of one metric back to its default, logging one change per field. */
export function resetMetric(
  state: MetricsState,
  catalog: MetricCatalog,
  metricId: string,
  opts: Omit<ChangeOpts, 'kind'> = {},
): MetricsState {
  const def = catalog.byId.get(metricId)
  if (!def) {
    // An entry no longer registered: drop what was kept for it.
    if (!state.overrides[metricId]) return state
    return { ...state, overrides: setOverride(state.overrides, metricId, undefined) }
  }
  let s = state
  const at = isoAt(opts.at)
  for (const f of changedFields(def, state.overrides[metricId])) {
    const r = put(s, def, f, defaultValue(def, f), { ...opts, at, kind: 'reset' })
    if (r.ok) s = r.state
  }
  return s
}

/** Put every metric back to its defaults. */
export function resetAll(
  state: MetricsState,
  catalog: MetricCatalog,
  opts: Omit<ChangeOpts, 'kind'> = {},
): MetricsState {
  let s = state
  const at = isoAt(opts.at)
  for (const id of Object.keys(state.overrides)) s = resetMetric(s, catalog, id, { ...opts, at })
  return s
}

/* ───────────── reading back from storage or a file ───────────── */

const KINDS: readonly ChangeKind[] = ['edit', 'undo', 'reset', 'import', 'migration']

/** A plain object from untrusted input, never one whose own keys could reach a prototype. */
const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** The own keys of untrusted input, without the names that could reach a prototype. */
const safeEntries = (r: Record<string, unknown>): [string, unknown][] =>
  Object.entries(r).filter(([k]) => !UNSAFE_KEYS.has(k))

function isChange(v: unknown): v is MetricChange {
  const c = v as Partial<MetricChange> | null
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.id === 'string' &&
    typeof c.metricId === 'string' &&
    typeof c.field === 'string' &&
    typeof c.at === 'string' &&
    'from' in c &&
    'to' in c &&
    KINDS.includes(c.kind as ChangeKind) &&
    (c.by === undefined || typeof c.by === 'string')
  )
}

/** A logged change rebuilt from known keys only. */
const cleanChange = (c: MetricChange): MetricChange => ({
  id: c.id,
  metricId: c.metricId,
  field: c.field,
  from: c.from,
  to: c.to,
  at: c.at,
  ...(c.by !== undefined ? { by: c.by } : {}),
  kind: c.kind,
})

/**
 * Overrides for one metric from untrusted input, field by field: anything invalid (or equal to the
 * default, or past a lock) is dropped. Returns the clean override and the problems found.
 */
export function cleanOverride(
  def: MetricDef,
  raw: unknown,
): { override: MetricOverride | undefined; problems: { field: string; reason: string }[] } {
  const problems: { field: string; reason: string }[] = []
  if (!raw || typeof raw !== 'object') return { override: undefined, problems }
  const r = raw as { text?: unknown; target?: unknown; params?: unknown }
  let o: MetricOverride | undefined
  const take = (field: MetricField, value: unknown) => {
    const check = checkEdit(def, field, value)
    if (!check.ok) problems.push({ field, reason: check.error })
    else o = withValue(def, o, field, check.value)
  }
  const text = isPlainRecord(r.text) ? r.text : {}
  for (const f of TEXT_FIELDS)
    if (Object.hasOwn(text, f) && text[f] !== undefined)
      take(f, text[f] === '' && f !== 'definition' ? null : text[f])
  if (r.target !== undefined) take('target', r.target)
  const params = isPlainRecord(r.params) ? r.params : {}
  for (const [key, v] of safeEntries(params)) {
    if (!paramOf(def, key))
      problems.push({ field: `params.${key}`, reason: `${def.name} has no setting called ${key}.` })
    else take(`params.${key}`, v)
  }
  return { override: o, problems }
}

/** A copy of an override for a metric this catalog does not hold, kept as it was, known keys only. */
function keptOverride(o: unknown): MetricOverride | undefined {
  if (!isPlainRecord(o)) return undefined
  const text: MetricOverride['text'] = {}
  if (isPlainRecord(o.text))
    for (const f of TEXT_FIELDS) if (typeof o.text[f] === 'string') text[f] = o.text[f] as string
  const params: Record<string, ParamValue> = {}
  if (isPlainRecord(o.params)) for (const [k, v] of safeEntries(o.params)) params[k] = v as ParamValue
  return {
    text,
    ...(o.target !== undefined ? { target: o.target as MetricTarget | null } : {}),
    params,
  }
}

/**
 * The dictionary state from storage: each known metric's overrides cleaned field by field, entries
 * for metrics no longer registered kept as they are (so a renamed or not-yet-loaded entry loses
 * nothing), and the change log's well-formed entries.
 */
export function sanitizeMetricsState(raw: unknown, catalog: MetricCatalog): MetricsState {
  if (!raw || typeof raw !== 'object') return EMPTY_METRICS
  const r = raw as { overrides?: unknown; log?: unknown }
  const overrides: Record<string, MetricOverride> = {}
  if (isPlainRecord(r.overrides))
    for (const [id, o] of safeEntries(r.overrides)) {
      const def = catalog.byId.get(id)
      if (def) {
        const clean = cleanOverride(def, o).override
        if (clean) overrides[id] = clean
      } else {
        const kept = keptOverride(o)
        if (kept) overrides[id] = kept
      }
    }
  const log = Array.isArray(r.log) ? r.log.filter(isChange).slice(0, MAX_LOG).map(cleanChange) : []
  return { overrides, log }
}

/* ───────────── wording ───────────── */

/** A target in words: "at most 60 d". */
export function targetText(def: Pick<MetricDef, 'unit'>, t: MetricTarget | null | undefined): string {
  if (!t) return 'No target'
  return `${comparatorText(t.comparator)} ${fmt(t.value, def.unit === 'text' ? 'num2' : def.unit)}`
}

/** A field's value in words, with its unit. */
export function formatFieldValue(
  def: MetricDef | undefined,
  field: MetricField,
  value: LoggedValue | undefined,
): string {
  if (value == null) return field === 'target' ? 'No target' : 'None'
  if (!def) return typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (field === 'target') return targetText(def, value as MetricTarget)
  const key = paramKeyOf(field)
  if (key == null) return String(value)
  const p = paramOf(def, key)
  return p ? formatParam(p, value as ParamValue) : String(value)
}

/** "Days in a step: 5 d to 7 d" for settings and targets; "Definition changed" for wording. */
export function describeChange(c: MetricChange, catalog: MetricCatalog): string {
  const def = catalog.byId.get(c.metricId)
  const label = fieldLabel(def, c.field)
  const name = def?.name ?? c.metricId
  const prefix = c.kind === 'undo' ? 'Undid: ' : c.kind === 'reset' ? 'Reset: ' : ''
  if (isTextField(c.field)) {
    const what = c.to == null ? 'cleared' : c.from == null ? 'added' : 'changed'
    return `${prefix}${name}, ${label.toLowerCase()} ${what}`
  }
  return `${prefix}${name}, ${label.charAt(0).toLowerCase()}${label.slice(1)}: ${formatFieldValue(def, c.field, c.from)} to ${formatFieldValue(def, c.field, c.to)}`
}
