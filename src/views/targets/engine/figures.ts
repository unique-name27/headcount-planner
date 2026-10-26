/**
 * Every figure id on the Targets view (docs/PLAN.md 9.4), by tab. Ids start with `targets-` (the
 * policy decides them by that prefix). Frozen in the M2 freeze: the builder may add ids with the
 * prefix, never rename these.
 */
export const TARGETS_FIGURES = {
  // Gap
  gapKpis: 'targets-gap-kpis',
  gap: 'targets-gap',
  // Sub-org targets
  suborgsKpis: 'targets-suborgs-kpis',
  suborgs: 'targets-suborgs',
  // Added by the views-2 builder: what is left unallocated, and the envelope exceptions.
  unallocated: 'targets-suborgs-unallocated',
  exceptions: 'targets-suborgs-exceptions',
  // Tree × cost center
  treeKpis: 'targets-tree-kpis',
  tree: 'targets-tree',
  // Added by the views-2 builder: cost per unit × cost center (the unit's one fold).
  costCenters: 'targets-tree-cost-centers',
  // Added in M3: the target changes the audit log holds (10.5), on the Gap tab.
  changes: 'targets-changes',
} as const
export type TargetsFigureId = (typeof TARGETS_FIGURES)[keyof typeof TARGETS_FIGURES]
