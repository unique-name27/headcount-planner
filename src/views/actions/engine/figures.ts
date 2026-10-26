/**
 * The Action center's figure ids (docs/PLAN.md 9.4). Ids start with `actions-` (the policy decides
 * them by that prefix). Frozen in the M2 freeze: the builder may add ids with the prefix, never
 * rename these.
 */
export const ACTIONS_FIGURES = {
  kpis: 'actions-kpis',
  /** What is waiting, by kind and due bucket. */
  byKind: 'actions-by-kind',
  /** Every open item, grouped by owner. */
  items: 'actions-items',
  owners: 'actions-owners',
  /** When open items fall due, by due band and severity. */
  dueTimeline: 'actions-due-timeline',
  /** Who has the most waiting. */
  topOwners: 'actions-top-owners',
  /** Where items come from, by view. */
  byView: 'actions-by-view',
  /** One sheet per owner group (`actions-<role>`). */
  managerSheet: 'actions-manager',
  hrbpSheet: 'actions-hrbp',
  leaderSheet: 'actions-leader',
  financeSheet: 'actions-finance',
} as const
export type ActionsFigureId = (typeof ACTIONS_FIGURES)[keyof typeof ACTIONS_FIGURES]

/** The owner group sheets' ids, by role. */
export const SHEET_FIGURE: Readonly<Record<'manager' | 'hrbp' | 'leader' | 'finance', ActionsFigureId>> = {
  manager: ACTIONS_FIGURES.managerSheet,
  hrbp: ACTIONS_FIGURES.hrbpSheet,
  leader: ACTIONS_FIGURES.leaderSheet,
  finance: ACTIONS_FIGURES.financeSheet,
}
