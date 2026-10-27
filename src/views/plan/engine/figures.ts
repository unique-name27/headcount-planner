/**
 * Every figure id on the Plan view (docs/PLAN.md 9.4), by tab, as the model's `FigureData.id` and the
 * UI's `<Figure id=…>` / `<KpiStrip id=…>` use them. Ids are kebab-case and start with `plan-` (the
 * policy decides them by that prefix, src/access/ids.ts `FIGURE_PREFIXES`). Frozen in the M2 freeze:
 * the builder may add ids with the prefix, never rename these.
 */
export const PLAN_FIGURES = {
  // Overview
  overviewKpis: 'plan-overview-kpis',
  readout: 'plan-readout',
  headsByMonth: 'plan-heads-by-month',
  headsByUnit: 'plan-heads-by-unit',
  positionsByStatus: 'plan-positions-by-status',
  costByUnit: 'plan-cost-by-unit',
  openingsByStage: 'plan-openings-by-stage',
  // Positions
  positionsKpis: 'plan-positions-kpis',
  positionsGrid: 'plan-positions-grid',
  // Openings
  openingsKpis: 'plan-openings-kpis',
  openingsStage: 'plan-openings-stage',
  openingsAge: 'plan-openings-age',
  openingsTable: 'plan-openings-table',
  // Transfers
  transfersKpis: 'plan-transfers-kpis',
  transfersTable: 'plan-transfers-table',
  /** The Acting as person's own transfer drafts (M3). */
  transfersDrafts: 'plan-transfers-drafts',
  /** "Changed by your HRBP" on the seats of the scope (M3). */
  positionsChanges: 'plan-positions-changes',
  // Hiring (docs/PLAN.md 9.7, change C36; the hiring freeze): src/access/ids.ts HIRING_FIGURE_IDS.
  hiringKpis: 'plan-hiring-kpis',
  /** Open to hire by quarter: the quarter table. */
  hiringQuarters: 'plan-hiring-quarters',
  /** Its small bar chart of open to hire by quarter. */
  hiringOpen: 'plan-hiring-open',
  /** Hiring velocity: hires up, exits down, the net line, then future starts and expected exits to FY end. */
  hiringVelocity: 'plan-hiring-velocity',
  /** Hires in the last 3 months, by location and department (change C37). */
  hiringRecent: 'plan-hiring-recent',
  hiringReadout: 'plan-hiring-readout',
} as const
export type PlanFigureId = (typeof PLAN_FIGURES)[keyof typeof PLAN_FIGURES]
