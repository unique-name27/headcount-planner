/**
 * The Audit page's figure ids (docs/PLAN.md 9.4, 10.7). Ids start with `audit-` (the policy decides
 * them by that prefix). Frozen in the M2 freeze: the builder may add ids with the prefix, never
 * rename these.
 */
export const AUDIT_FIGURES = {
  kpis: 'audit-kpis',
  entries: 'audit-entries',
} as const
export type AuditFigureId = (typeof AUDIT_FIGURES)[keyof typeof AUDIT_FIGURES]
