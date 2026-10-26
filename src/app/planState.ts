/**
 * The plan state the app shows (docs/PLAN.md 5.3 and 5.4): what the PlanStore keeps in this
 * browser (`hcp:plan`, the audit log at `hcp:audit:<chunk>`), laid over the generated sample's plan
 * while every dataset is the sample.
 *
 * The sample is regenerated on every load and never stored, and so is its plan state (versions with
 * their locked lines, closes, the FY28 cycle): it is the baseline. Plan state made on the sample is
 * stored as an overlay against the sample's `baselineId`, so a reload keeps your approvals. The
 * reading taken here (`planInForce`):
 *
 *  - on the sample, with nothing stored, or with a stored state for another baseline (an earlier
 *    sample, or your own data), the sample's plan as generated. The baseline id names the whole
 *    generated sample (src/data/sample/generate.ts `sampleBaselineId`), so a state stored against
 *    an earlier build of the sample is never laid over this one (lead browser finding B9): it is
 *    set aside (`setAsideOf`) with SAMPLE_CHANGED_NOTICE, and the first write on the new sample
 *    keeps it, with its audit log, at `hcp:plan-aside:<its baseline id>` (`keepAside`: one copy per
 *    earlier sample, so a second change of the sample never overwrites a copy not yet saved) and
 *    starts this sample's log afresh, so HR admin can save it as a Full file
 *    (src/views/data/engine/workspace.ts `earlierSampleFile`);
 *  - on the sample, with a stored state for this baseline, the sample's plan with the stored state
 *    laid over it: versions, closes, cycles and requests by their ids (the stored copy wins, new
 *    ones are added), and the stored Working overlay, adjustments, reviews, merge base and audit head;
 *  - with your own data, the stored state when it is not a sample overlay, else an empty state;
 *  - in every case with the stored request ID tag and secret (`PlanState.idTag`, `idSecret`: D-ID and
 *    the M3 recheck): the store gives a workspace both before the first write, and the plan in force
 *    always carries them.
 *
 * The store starts once (`startPlan`), races IndexedDB against 1,500 ms as the data store does (and
 * runs on the sample's plan when it loses), and re-reads when another tab writes (`{ kind: 'plan' }`).
 * Nothing here writes: the write path (src/app/write/run.ts) saves `storedFor(next, sample)` and
 * then calls `reloadPlan` (M3).
 */
import { create } from 'zustand'
import { idbDel, idbGet, idbKeys, idbSet } from '@/data/idb'
import type { ISODateTime } from '@/data/schema'
import { STARTUP_TIMEOUT_MS } from '@/data/store'
import { addTabListener } from '@/data/tabSync'
import { emptyPlanState } from '@/plan/store/memoryStore'
import type { PlanStore } from '@/plan/store/types'
import type { AssumptionRow, AuditEntry, PlanState } from '@/plan/types'

/**
 * A plan state stored against an earlier build of the sample (B9), set aside with its audit log:
 * what `hcp:plan-aside:<baselineId>` keeps once the first write on the new sample replaces
 * `hcp:plan`.
 */
export interface SetAside {
  /** The baseline the state was stored against (an earlier sample's id). */
  baselineId: string
  state: PlanState
  audit: readonly AuditEntry[]
  /** When it was set aside (the write that moved it); null while it is still at `hcp:plan`. */
  at: ISODateTime | null
}

/** Where set-aside states are kept, one key per earlier sample (IndexedDB, src/app/storageKeys.ts). */
export const ASIDE_PREFIX = 'hcp:plan-aside:'

/** The key of the copy kept for an earlier sample. */
export const asideKeyOf = (baselineId: string): string => `${ASIDE_PREFIX}${baselineId}`

/** What the app says when it sets a stored state aside (B9). */
export const SAMPLE_CHANGED_NOTICE = {
  title:
    "Headcount Planner's sample changed with this version. Your changes on the earlier sample are kept in a file you can save; the app now shows the new sample.",
  description: 'HR admin saves them as a Full file from Data room > Workspace, with Show pay amounts on.',
} as const

export interface PlanSlice {
  /** The first read finished (or lost the race). */
  ready: boolean
  /** What the PlanStore holds; null until it is read, or when storage did not answer. */
  stored: PlanState | null
  /** The audit log as stored (`listAudit`); every reader outside HR admin goes through `auditView`. */
  audit: readonly AuditEntry[]
  /** Storage did not answer in time: the plan is the sample's for this session. */
  storageUnavailable: boolean
  /** The latest state kept at `hcp:plan-aside:` (B9), or null. */
  aside: SetAside | null
}

const NO_AUDIT: readonly AuditEntry[] = []

export const usePlan = create<PlanSlice>(() => ({
  ready: false,
  stored: null,
  audit: NO_AUDIT,
  storageUnavailable: false,
  aside: null,
}))

/* ───────────── the plan in force ───────────── */

/** Records of `extra` replace those of `base` with the same id; new ones follow, in their order. */
function byId<T>(base: readonly T[], extra: readonly T[], idOf: (x: T) => string): readonly T[] {
  if (!extra.length) return base
  const replace = new Map(extra.map((x) => [idOf(x), x]))
  const out = base.map((x) => replace.get(idOf(x)) ?? x)
  const known = new Set(base.map(idOf))
  for (const x of extra) if (!known.has(idOf(x))) out.push(x)
  return out
}

/** Nothing stored beyond an empty state (a fresh browser); a request ID tag alone holds no plan. */
export function isEmptyState(s: PlanState): boolean {
  return (
    !s.versions.length &&
    !s.closes.length &&
    !s.adjustments.length &&
    !s.requests.length &&
    !s.cycles.length &&
    !s.reviewed.length &&
    !s.mergeBase.length &&
    !s.overlay.positions.length &&
    !s.overlay.targets.length &&
    !s.overlay.freezes.length &&
    !s.overlay.assumptions.length &&
    !(s.overlay.removedAssumptions?.length ?? 0) &&
    !s.auditHead
  )
}

/** The sample's plan with a stored overlay for the same baseline laid over it. */
export function overlaySample(sample: PlanState, stored: PlanState): PlanState {
  return {
    v: 1,
    baselineId: sample.baselineId,
    versions: byId(sample.versions, stored.versions, (v) => v.versionId),
    closes: byId(sample.closes, stored.closes, (c) => c.month),
    adjustments: stored.adjustments.length ? stored.adjustments : sample.adjustments,
    overlay: {
      positions: [...sample.overlay.positions, ...stored.overlay.positions],
      targets: [...sample.overlay.targets, ...stored.overlay.targets],
      freezes: [...sample.overlay.freezes, ...stored.overlay.freezes],
      assumptions: [...sample.overlay.assumptions, ...stored.overlay.assumptions],
      ...removedOf([
        ...(sample.overlay.removedAssumptions ?? []),
        ...(stored.overlay.removedAssumptions ?? []),
      ]),
    },
    requests: byId(sample.requests, stored.requests, (r) => r.requestId),
    cycles: byId(sample.cycles, stored.cycles, (c) => c.cycleId),
    reviewed: byId(sample.reviewed, stored.reviewed, (r) => r.exceptionId),
    mergeBase: stored.mergeBase.length ? stored.mergeBase : sample.mergeBase,
    auditHead: stored.auditHead ?? sample.auditHead,
    ...tagOf(stored.idTag ?? sample.idTag, stored.idSecret ?? sample.idSecret),
  }
}

/** The `removedAssumptions` key of an overlay with removals (none without). */
const removedOf = (rows: readonly AssumptionRow[]): Pick<PlanState['overlay'], 'removedAssumptions'> =>
  rows.length ? { removedAssumptions: rows } : {}

/** The `idTag` and `idSecret` keys of a state with a tag and a secret (none without them). */
const tagOf = (
  tag: string | undefined,
  secret: string | undefined,
): Pick<PlanState, 'idTag' | 'idSecret'> => ({
  ...(tag ? { idTag: tag } : {}),
  ...(secret ? { idSecret: secret } : {}),
})

const tagged = new WeakMap<PlanState, Map<string, PlanState>>()

/** A state with the stored request ID tag and secret laid on it (the same object for the same inputs). */
function withTag(s: PlanState, tag: string | undefined, secret: string | undefined): PlanState {
  if ((!tag || s.idTag === tag) && (!secret || s.idSecret === secret)) return s
  let byTag = tagged.get(s)
  if (!byTag) {
    byTag = new Map()
    tagged.set(s, byTag)
  }
  const key = `${tag ?? ''}\u0000${secret ?? ''}`
  let hit = byTag.get(key)
  if (!hit) {
    hit = { ...s, ...tagOf(tag, secret) }
    byTag.set(key, hit)
  }
  return hit
}

const EMPTY_KEY = emptyPlanState()
const memo = new WeakMap<PlanState, WeakMap<PlanState, PlanState>>()

/**
 * The plan state in force (see the module comment). `sample` is the sample's plan while every
 * dataset is the sample, else null. The same inputs give the same object, so the analytics
 * context is not rebuilt for nothing.
 */
export function planInForce(stored: PlanState | null, sample: PlanState | null): PlanState {
  const s = stored ?? EMPTY_KEY
  if (sample) {
    if (isEmptyState(s) || s.baselineId !== sample.baselineId) return withTag(sample, s.idTag, s.idSecret)
    let bySample = memo.get(s)
    if (!bySample) {
      bySample = new WeakMap()
      memo.set(s, bySample)
    }
    let hit = bySample.get(sample)
    if (!hit) {
      hit = overlaySample(sample, s)
      bySample.set(sample, hit)
    }
    return hit
  }
  return s.baselineId == null ? s : withTag(EMPTY_KEY, s.idTag, s.idSecret)
}

/**
 * The audit log that goes with the plan in force: the stored log, unless the stored state was set
 * aside (another baseline), whose entries describe changes this plan does not hold.
 */
export function auditInForce(
  stored: PlanState | null,
  audit: readonly AuditEntry[],
  sample: PlanState | null,
): readonly AuditEntry[] {
  const s = stored ?? EMPTY_KEY
  const kept = sample ? !isEmptyState(s) && s.baselineId === sample.baselineId : s.baselineId == null
  return kept ? audit : NO_AUDIT
}

/**
 * The stored state on the sample when it was stored against an earlier build of the sample (B9):
 * a sample overlay (a baseline id) other than this sample's, with something in it, and its audit
 * log. Null otherwise (nothing stored, this sample's own overlay, your own data, or no sample).
 */
export function setAsideOf(
  stored: PlanState | null,
  audit: readonly AuditEntry[],
  sample: PlanState | null,
): SetAside | null {
  if (!sample || !stored || isEmptyState(stored)) return null
  if (stored.baselineId == null || stored.baselineId === sample.baselineId) return null
  return { baselineId: stored.baselineId, state: stored, audit, at: null }
}

/**
 * The earlier sample's changes to offer (B9): the stored state set aside now, else the latest copy
 * kept at `hcp:plan-aside:`; null when there is neither, or the data is not the sample.
 */
export function earlierSampleOf(
  slice: Pick<PlanSlice, 'stored' | 'audit' | 'aside'>,
  sample: PlanState | null,
): SetAside | null {
  if (!sample) return null
  return setAsideOf(slice.stored, slice.audit, sample) ?? slice.aside
}

/**
 * Keeps a set-aside state and its log under its own baseline's key (the write path, before it
 * replaces `hcp:plan`); copies kept for other earlier samples stay as they are.
 */
export async function keepAside(aside: SetAside, at: ISODateTime): Promise<void> {
  await idbSet(asideKeyOf(aside.baselineId), { ...aside, audit: [...aside.audit], at })
}

const isAside = (v: unknown): v is SetAside => {
  const o = v as Partial<SetAside> | null | undefined
  return !!o && typeof o.baselineId === 'string' && !!o.state && Array.isArray(o.audit)
}

/**
 * Removes the copy kept for one earlier sample (once it is saved as a Full file), then shows the
 * next one kept, if any.
 */
export async function clearAside(baselineId: string): Promise<void> {
  await idbDel(asideKeyOf(baselineId))
  usePlan.setState({ aside: await readAside() })
}

/** Every copy kept at `hcp:plan-aside:`, latest set aside first (none, or none this app wrote: []). */
export async function readAsides(): Promise<SetAside[]> {
  try {
    const keys = (await idbKeys()).filter((k) => k.startsWith(ASIDE_PREFIX))
    const out: SetAside[] = []
    for (const k of keys) {
      const v = await idbGet<unknown>(k)
      if (isAside(v)) out.push(v)
    }
    return out.sort(
      (a, b) => (b.at ?? '').localeCompare(a.at ?? '') || a.baselineId.localeCompare(b.baselineId),
    )
  } catch {
    return []
  }
}

/** The latest copy kept at `hcp:plan-aside:`, or null. */
export async function readAside(): Promise<SetAside | null> {
  return (await readAsides())[0] ?? null
}

/* ───────────── what a write saves (M3 freeze) ───────────── */

/**
 * The state the write path saves for a plan in force (src/app/write/run.ts): on the sample, only what
 * differs from the sample's own plan, as an overlay against its `baselineId` (versions, closes,
 * cycles, requests and reviews by their ids where they differ from the sample's; the Working overlay,
 * adjustments and merge base as they stand), so `planInForce(storedFor(next, sample), sample)` is
 * `next` again; with your own data (`sample` null), `next` itself. Pure. Frozen in the M3 freeze
 * (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
export function storedFor(next: PlanState, sample: PlanState | null): PlanState {
  if (!sample) return next
  /** The records of `mine` that are not the sample's own (a changed copy, or a new one). */
  const changed = <T>(mine: readonly T[], base: readonly T[]): T[] => {
    const own = new Set<T>(base)
    return mine.filter((x) => !own.has(x))
  }
  return {
    v: 1,
    baselineId: sample.baselineId,
    versions: changed(next.versions, sample.versions),
    closes: changed(next.closes, sample.closes),
    adjustments: [...next.adjustments],
    overlay: {
      positions: changed(next.overlay.positions, sample.overlay.positions),
      targets: changed(next.overlay.targets, sample.overlay.targets),
      freezes: changed(next.overlay.freezes, sample.overlay.freezes),
      assumptions: changed(next.overlay.assumptions, sample.overlay.assumptions),
      ...removedOf(changed(next.overlay.removedAssumptions ?? [], sample.overlay.removedAssumptions ?? [])),
    },
    requests: changed(next.requests, sample.requests),
    cycles: changed(next.cycles, sample.cycles),
    reviewed: changed(next.reviewed, sample.reviewed),
    mergeBase: [...next.mergeBase],
    auditHead: next.auditHead,
    ...tagOf(next.idTag, next.idSecret),
  }
}

/** Re-read the PlanStore into `usePlan` after a write in this tab (other tabs follow `{ kind: 'plan' }`). */
export async function reloadPlan(store: ReadStore): Promise<void> {
  const [stored, audit, aside] = await Promise.all([store.load(), store.listAudit(), readAside()])
  usePlan.setState({ ready: true, stored, audit: [...audit], storageUnavailable: false, aside })
}

/* ───────────── reading the store ───────────── */

/** Resolves to the value, or null if it takes longer than ms or fails. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      },
    )
  })
}

type ReadStore = Pick<PlanStore, 'load' | 'listAudit'>

/** Read plan state and the audit log once (null when storage refuses or stalls). */
async function readPlan(
  store: ReadStore,
  ms: number,
): Promise<{ stored: PlanState; audit: AuditEntry[]; aside: SetAside | null } | null> {
  return withTimeout(
    Promise.all([store.load(), store.listAudit(), readAside()]).then(([stored, audit, aside]) => ({
      stored,
      audit: [...audit],
      aside,
    })),
    ms,
  )
}

let stopListening: (() => void) | null = null

/**
 * Read the PlanStore into `usePlan`, then follow other tabs' plan writes. Call once; a later call
 * replaces the store (tests). Never rejects.
 */
export async function startPlan(store: ReadStore, opts: { timeoutMs?: number } = {}): Promise<void> {
  const ms = opts.timeoutMs ?? STARTUP_TIMEOUT_MS
  stopListening?.()
  stopListening = addTabListener((m) => {
    if (m.kind !== 'plan') return
    void readPlan(store, ms).then((r) => {
      if (r) usePlan.setState({ stored: r.stored, audit: r.audit, aside: r.aside })
    })
  })
  const r = await readPlan(store, ms)
  usePlan.setState(
    r
      ? { ready: true, stored: r.stored, audit: r.audit, storageUnavailable: false, aside: r.aside }
      : { ready: true, stored: null, audit: NO_AUDIT, storageUnavailable: true, aside: null },
  )
}
