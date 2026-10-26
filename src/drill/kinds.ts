/**
 * Which drills a mode opens (docs/PLAN.md 8.3 `drill:<kind>`): a number in a shown figure whose
 * records are a kind the mode does not list is not a button (no hover wash, no keyboard stop), and
 * its table cell is plain text. `Drill` (KPI tiles, table cells, inline counts) and the readout's
 * "Show the records" ask here. The records panel still answers "These records are not shown in
 * <mode> mode." if one is reached another way (a chart mark). Pure.
 *
 *   const target = drillTarget(ctx.access, spec)   // null: render the number as plain text
 *   if (target) openDrill(resolveDrill(target))
 *
 * A mode that lists every kind (HR admin) keeps the source as given, so the rows are still
 * gathered only on click; a mode that lists some kinds resolves the source to read its kind.
 */
import { DRILL_KINDS } from '@/access/ids'
import type { DrillKind, DrillSource, DrillSpec } from './types'

/** Every drill kind (the access layer's list, which `DrillRecordMap`'s keys equal at compile time). */
export const ALL_DRILL_KINDS: readonly DrillKind[] = DRILL_KINDS

/** What the check reads from `ctx.access`. */
export interface KindAccess {
  can: (surface: string) => boolean
}

const everyKind = new WeakMap<KindAccess, boolean>()

/** The mode lists every drill kind (memoized per access context). */
export function listsEveryKind(access: KindAccess): boolean {
  let hit = everyKind.get(access)
  if (hit === undefined) {
    hit = ALL_DRILL_KINDS.every((k) => access.can(`drill:${k}`))
    everyKind.set(access, hit)
  }
  return hit
}

/** The mode lists this kind's records. */
export const kindListed = (access: KindAccess, kind: DrillKind): boolean => access.can(`drill:${kind}`)

/**
 * The drill a number opens in this mode: the source itself when the mode lists every kind, the
 * resolved spec when it lists the spec's kind, else null (nothing behind it, or a kind the mode
 * does not list: the number renders as plain text). Without an access context, the source.
 */
export function drillTarget(access: KindAccess | null | undefined, src: DrillSource): DrillSource {
  if (!src) return null
  if (!access || listsEveryKind(access)) return src
  if (typeof src !== 'function') return kindListed(access, src.kind) ? src : null
  // A source that fails to build here stays a button: it fails on click as it always did, never
  // while the page renders.
  let spec: DrillSpec | null
  try {
    spec = src()
  } catch {
    return src
  }
  return spec && kindListed(access, spec.kind) ? spec : null
}
