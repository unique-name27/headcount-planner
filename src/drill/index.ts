/**
 * Drill-down to the records, positions and calculations behind every number (docs/PLAN.md 9.5):
 * `import { Drill, Calc, drill, drillSpec } from '@/drill'`.
 */

export { CalcCard } from './CalcCard'
export {
  type CalcInput,
  type CalcSource,
  type CalcSpec,
  type CalcStep,
  type CostCalcInput,
  calcInput,
  calcProblems,
  calcResult,
  calcStep,
  costCalc,
  evaluateExpression,
  lastStep,
  resolveCalc,
  sameResult,
  weightSum,
} from './calc'
export { Calc, calc, DRILL_CLASS, Drill, DrillNesting, type DrillSource, drill, resolveDrill } from './Drill'
export { DrillPanel } from './DrillPanel'
export { PositionCard } from './PositionCard'
export { type PositionCardModel, positionCardModel, setPositionFacts } from './position'
export {
  buildDrillTable,
  DRILLS_KEY,
  type DrillContext,
  type DrillTable,
  drillNoun,
  drillTableHint,
  POSITION_KEY,
  ROW_KEY,
  rowPosition,
  WEIGHT_KEY,
} from './records'
export {
  openReqsOfPosition,
  positionsBelow,
  positionsBelowSpec,
  type RelatedContext,
  reqsOfPosition,
  reqsSpec,
  requestsTouching,
  subPositions,
  subPositionsSpec,
} from './related'
export { type RequestRecordInput, requestRecord, requestRecords } from './requestRecord'
export {
  type DrillEntry,
  openCalc,
  openDrill,
  openPosition,
  pushCalc,
  pushDrill,
  useDrillStore,
} from './store'
export {
  type DrillExtra,
  type DrillFilter,
  type DrillKind,
  type DrillRecordMap,
  type DrillSpec,
  drillSpec,
  type RequestRecord,
} from './types'
