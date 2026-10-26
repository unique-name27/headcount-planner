/**
 * The KPIs and findings a mode shows (docs/PLAN.md 9.1 and 9.5; the template app's numbers.ts): one
 * whose metric the mode hides is dropped, and in a scoped mode a finding's positions are kept to the
 * scope (`positionInScope`). The KPI strip, the readout and the exports all ask here, so a hidden
 * number is hidden the same way on screen and in files. Readout findings list positions, not people
 * (`FindingPosition { positionId, title, note }`). Pure.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled the bodies. The functions take any tile or finding with these
 * fields, so this module does not import src/components; the UX layer's `Kpi` and `Finding` fit.
 */
import type { AccessContext } from './context'
import { positionInScope, scopeOfAccess } from './scopes/records'

type Access = Pick<AccessContext, 'can' | 'scope'>

/** What a finding's position list reads (the UX layer's `FindingPosition`). */
export interface FindingPositionFacts {
  positionId: string
}

/** The KPI tiles a mode shows (a tile with no metric id always shows). */
export function kpisInMode<K extends { metricId?: string }>(
  access: Access | null | undefined,
  kpis: readonly K[],
): K[] {
  if (!access) return [...kpis]
  return kpis.filter((k) => !k.metricId || access.can(`metric:${k.metricId}`))
}

/**
 * The findings a mode shows, with `positions` kept to the scope in a scoped mode (and `positionsTotal`,
 * when present, recounted).
 */
export function findingsInMode<
  F extends { metricId?: string; positions?: readonly FindingPositionFacts[]; positionsTotal?: number },
>(access: Access | null | undefined, findings: readonly F[]): F[] {
  if (!access) return [...findings]
  const out: F[] = []
  for (const f of findings) {
    if (f.metricId && !access.can(`metric:${f.metricId}`)) continue
    if (!scopeOfAccess(access) || !f.positions?.length) {
      out.push(f)
      continue
    }
    const positions = f.positions.filter((p) => positionInScope(p.positionId, access))
    out.push(
      positions.length === f.positions.length
        ? f
        : { ...f, positions, ...(f.positionsTotal != null ? { positionsTotal: positions.length } : {}) },
    )
  }
  return out
}
