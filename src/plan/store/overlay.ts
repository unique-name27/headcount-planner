/**
 * The Working overlay merge (docs/PLAN.md 4 "overlay merge", 5.4; M3 freeze): plan state's dataset
 * rows written in the app (`PlanState.overlay`: dated position rows from approvals and HRBP seat
 * edits, target rows, freezes, Working's assumption rows) laid over the imported datasets, so every
 * view and engine reads one set of rows. Pure (it lives beside the stores because the plan names the
 * merge there; it reads no storage).
 *
 * - positions: overlay rows are added; a row with the same (positionId, effectiveDate) as an imported
 *   one replaces it (`DATASETS[].rowKey`), so a later edit on the same day wins;
 * - targets, freezes, assumptions: an overlay row replaces the imported row with the same row key,
 *   new keys are added;
 * - requests are not merged here: plan state's requests replace imported rows by `requestId` where
 *   requests are read (src/drill/seats.ts `requestsOf`);
 * - with an empty overlay (or no plan) it returns `datasets` itself, so memoized models keyed by the
 *   datasets object stay warm; the same inputs give the same object.
 *
 * From M3 the analytics context's `all` and `data` hold the overlay: the core builder applies
 * `withOverlay` once in src/data/context.tsx `buildContext` (before the scope clamp), and no view
 * applies `plan.overlay` itself (docs/CONTRACTS-M3.md).
 *
 * Readings taken here (core, M3):
 *  - A key compares trimmed text, and a blank org or optional key part reads the same as null, so an
 *    overlay row written with `org: null` replaces an imported row with `org: ''`.
 *  - Within the overlay, the later row with a key wins (an edit made after another on the same day).
 *  - An assumption row's version reads the same by name or by ID (plan state's versions give the
 *    pairs), so an overlay row naming a Working by ID replaces an imported row naming it by name.
 *  - Replaced rows keep their place in the imported order; new rows follow in overlay order, so a
 *    position's rows stay the imported ones first and the app's after.
 *  - Remove override (M3 review): an assumption row whose key `overlay.removedAssumptions` holds is
 *    left out, imported or not, so the value falls back to the org's parent.
 *
 * Frozen in the M3 freeze; the core builder fills the body.
 */
import { DATASETS, type DatasetKey, type Datasets } from '@/data/schema'
import type { DatasetOverlay, PlanState } from '../types'

/** The overlay's datasets, in the order the merge lays them. */
const OVERLAID = [
  'positions',
  'targets',
  'freezes',
  'assumptions',
] as const satisfies readonly (keyof DatasetOverlay & DatasetKey)[]

/** Each overlaid dataset's row key fields (`DATASETS[].rowKey`). */
const ROW_KEY: Readonly<Record<(typeof OVERLAID)[number], readonly string[]>> = Object.fromEntries(
  OVERLAID.map((k) => [k, DATASETS.find((d) => d.key === k)?.rowKey ?? []]),
) as unknown as Record<(typeof OVERLAID)[number], readonly string[]>

/** The imported rows with the overlay's rows laid over them by key (see the module comment). */
export function overlayRows<T extends object>(
  imported: readonly T[],
  overlay: readonly T[],
  fields: readonly string[],
  /** A key part read the same for two spellings (an assumption row's version by name or by ID). */
  canon: (field: string, value: string) => string = (_f, v) => v,
): T[] {
  if (!overlay.length) return imported as T[]
  /** A row's key: its key fields' values, trimmed, a blank and a missing value alike. */
  const keyOf = (row: object): string => {
    const r = row as Record<string, unknown>
    return fields
      .map((f) => {
        const v = r[f]
        return canon(f, v == null ? '' : String(v).trim())
      })
      .join('\u0000')
  }
  const last = new Map<string, T>()
  for (const r of overlay) last.set(keyOf(r), r)
  const used = new Set<string>()
  const out: T[] = imported.map((r) => {
    const k = keyOf(r)
    const over = last.get(k)
    if (over) {
      used.add(k)
      return over
    }
    return r
  })
  const added = new Set<string>()
  for (const r of overlay) {
    const k = keyOf(r)
    if (used.has(k) || added.has(k)) continue
    added.add(k)
    out.push(last.get(k) as T)
  }
  return out
}

/** By datasets and overlay; the versions the assumption keys were read with are kept beside the result. */
const memo = new WeakMap<
  Datasets,
  WeakMap<DatasetOverlay, { versions: PlanState['versions']; out: Datasets }>
>()

/** The datasets with plan state's Working overlay laid over them (see the module comment). */
export function withOverlay(datasets: Datasets, plan: PlanState | null): Datasets {
  if (!plan || overlayEmpty(plan)) return datasets
  const overlay = plan.overlay
  let byOverlay = memo.get(datasets)
  if (!byOverlay) {
    byOverlay = new WeakMap()
    memo.set(datasets, byOverlay)
  }
  const hit = byOverlay.get(overlay)
  if (hit && hit.versions === plan.versions) return hit.out
  const out: Datasets = { ...datasets }
  // An assumption row may name its version by ID or by name (src/plan/engine/assumptions.ts
  // `assumptionLookup` matches both): both spellings key alike, so an edit replaces the imported row.
  const idOfName = new Map(plan.versions.map((v) => [v.name.trim(), v.versionId.trim()]))
  const canon = (f: string, v: string): string => (f === 'version' ? (idOfName.get(v) ?? v) : v)
  for (const k of OVERLAID) {
    const rows = overlay[k] ?? []
    if (!rows.length) continue
    ;(out as unknown as Record<string, unknown>)[k] = overlayRows(
      datasets[k] as readonly object[],
      rows as readonly object[],
      ROW_KEY[k],
      k === 'assumptions' ? canon : undefined,
    )
  }
  const removed = overlay.removedAssumptions ?? []
  if (removed.length) {
    const fields = ROW_KEY.assumptions
    const keyOf = (row: object): string => {
      const r = row as Record<string, unknown>
      return fields.map((f) => canon(f, r[f] == null ? '' : String(r[f]).trim())).join('\u0000')
    }
    const gone = new Set(removed.map(keyOf))
    out.assumptions = out.assumptions.filter((r) => !gone.has(keyOf(r)))
  }
  byOverlay.set(overlay, { versions: plan.versions, out })
  return out
}

/** True when plan state carries no overlay row (then `withOverlay` returns the datasets as they are). */
export function overlayEmpty(plan: PlanState | null): boolean {
  if (!plan) return true
  const o = plan.overlay
  return !o || (OVERLAID.every((k) => !(o[k]?.length ?? 0)) && !(o.removedAssumptions?.length ?? 0))
}
