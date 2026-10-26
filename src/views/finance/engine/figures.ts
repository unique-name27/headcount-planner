/**
 * Every figure id on the Finance view (docs/PLAN.md 9.4), by tab. Ids start with `finance-` (the
 * policy decides them by that prefix). Frozen in the M2 freeze: the builder may add ids with the
 * prefix, never rename these.
 */
export const FINANCE_FIGURES = {
  // Versions
  versionsKpis: 'finance-versions-kpis',
  versions: 'finance-versions',
  // Added by the views-2 builder: the month closes.
  closes: 'finance-closes',
  adjustments: 'finance-adjustments',
  adjustmentsByMonth: 'finance-adjustments-by-month',
  // Assumptions
  assumptionsKpis: 'finance-assumptions-kpis',
  assumptions: 'finance-assumptions',
  tradeRates: 'finance-trade-rates',
  // Freezes
  freezesKpis: 'finance-freezes-kpis',
  freezes: 'finance-freezes',
  freezeOpenings: 'finance-freeze-openings',
  // Reconcile
  reconcileKpis: 'finance-reconcile-kpis',
  reconcile: 'finance-reconcile',
  // Export (the load file: M4 freeze adds the totals and the preview)
  exportKpis: 'finance-export-kpis',
  exportTotals: 'finance-export-totals',
  exportPreview: 'finance-export-preview',
  // Fix step (review SB-1): the control totals by component of each unit and the company.
  exportComponents: 'finance-export-components',
} as const
export type FinanceFigureId = (typeof FINANCE_FIGURES)[keyof typeof FINANCE_FIGURES]
