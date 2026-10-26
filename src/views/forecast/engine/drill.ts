/**
 * The records behind the Forecast view's numbers: the Plan view's spec builders (positions, people,
 * reqs), which this view shares, so a seat lists the same way on both. Weighted figures (expected
 * starts, modeled exits, forecast heads) set `weight`, the "Counts as" column.
 */
export { positionsFor, positionsSpec, reqsSpec, workersSpec } from '@/views/plan/engine/drill'
