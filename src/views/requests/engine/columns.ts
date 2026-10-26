/**
 * The Requests lists' columns (docs/PLAN.md 9.4 and 14.1): what the tables show and every export
 * writes. The band estimate is the one amount, `band: true` (hidden in Manager mode, and null in its
 * rows there); the gap after approval is in heads. Each request opens its records (the requests
 * drill, so the records panel and the position card show the same viewer-shaped row). Pure.
 */
import type { Column } from '@/charts/types'
import { drillSpec, type RequestRecord } from '@/drill/types'
import type { ChainRow, NotSubmittedRow, RankedAskRow } from './index'

/**
 * One request's own records: its row as the requests drill lists it. The lists' rows are
 * `RequestListRow`s (./base.ts: the record plus the list's display fields), typed as the records
 * they are, so the columns name the display fields by key.
 */
const own = (r: RequestRecord) => drillSpec({ kind: 'requests', title: `Request ${r.requestId}`, rows: [r] })

const base: Column<RequestRecord>[] = [
  { key: 'requestId', label: 'Request', drill: own },
  { key: 'type', label: 'Type' },
  { key: 'state', label: 'State' },
  { key: 'stepLabel', label: 'Step' },
  { key: 'approverName', label: 'Waiting on', width: 22 },
  { key: 'daysShown', label: 'Days in step', format: 'int' },
  { key: 'positionId', label: 'Position' },
  { key: 'jobTitle', label: 'Title', width: 26, freeText: true },
  { key: 'level', label: 'Level' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'department', label: 'Department' },
]

/** Requests > Queue: in scope, by state and step, with days waiting. */
export const QUEUE_COLUMNS: Column<RequestRecord>[] = [
  ...base,
  { key: 'requesterName', label: 'Requester', width: 22 },
  { key: 'startDate', label: 'Start or effective date', format: 'date' },
  { key: 'chain', label: 'Approval chain', width: 40 },
  { key: 'bandEstimateUsd', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
]

/**
 * Requests > Mine: your requests and the tracker after approval (10.1): the step or recruiting stage,
 * who it is with (the approver, then the req's recruiter), days in it, and the tracker's dates.
 */
export const MINE_COLUMNS: Column<RequestRecord>[] = [
  { key: 'requestId', label: 'Request', drill: own },
  { key: 'type', label: 'Type' },
  { key: 'state', label: 'State' },
  { key: 'stepLabel', label: 'Step' },
  { key: 'stage', label: 'Recruiting' },
  { key: 'owner', label: 'With', width: 22 },
  { key: 'daysShown', label: 'Days in step', format: 'int' },
  { key: 'reqOpened', label: 'Req opened', format: 'date' },
  { key: 'offerAccepted', label: 'Offer accepted', format: 'date' },
  { key: 'started', label: 'Started', format: 'date' },
  { key: 'positionId', label: 'Position' },
  { key: 'jobTitle', label: 'Title', width: 26, freeText: true },
  { key: 'level', label: 'Level' },
  { key: 'startDate', label: 'Start or effective date', format: 'date' },
  { key: 'chain', label: 'Approval chain', width: 40 },
  { key: 'bandEstimateUsd', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
]

/** Requests > Approvals: the steps waiting on you, with the gap after approval (heads). */
export const APPROVALS_COLUMNS: Column<RequestRecord>[] = [
  ...base.filter((c) => c.key !== 'approverName'),
  { key: 'requesterName', label: 'Requester', width: 22 },
  { key: 'startDate', label: 'Start or effective date', format: 'date' },
  { key: 'chain', label: 'Approval chain', width: 40 },
  { key: 'bandEstimateUsd', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
  { key: 'gapOrg', label: 'Target org' },
  { key: 'gapAfterHeads', label: 'Gap after approval (heads)', format: 'int' },
]

/** Requests > Cycle: the ranked asks against the target. */
export const ASK_COLUMNS: Column<RankedAskRow>[] = [
  { key: 'rank', label: 'Rank', format: 'int' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'requestId', label: 'Request' },
  { key: 'type', label: 'Type' },
  { key: 'manager', label: 'Manager', width: 22 },
  { key: 'priority', label: 'Manager rank', format: 'int' },
  { key: 'jobTitle', label: 'Title', width: 26, freeText: true },
  { key: 'level', label: 'Level' },
  { key: 'heads', label: 'Heads', format: 'int' },
  { key: 'cumulativeHeads', label: 'Heads so far', format: 'int' },
  { key: 'bandEstimateUsd', label: 'In-year band estimate (USD)', format: 'moneyFull', band: true },
  { key: 'cut', label: 'Cut line' },
]

/** Requests > Cycle: the managers who have not sent their ranked asks. */
export const NOT_SUBMITTED_COLUMNS: Column<NotSubmittedRow>[] = [
  { key: 'manager', label: 'Manager', width: 24 },
  { key: 'title', label: 'Title', width: 26, freeText: true },
  { key: 'managerPositionId', label: 'Position' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'department', label: 'Department' },
]

/** Requests > New: the chain preview, one row per step (no amount in any mode). */
export const CHAIN_COLUMNS: Column<ChainRow>[] = [
  { key: 'n', label: 'Step', format: 'int' },
  { key: 'role', label: 'Role' },
  { key: 'approver', label: 'Goes to', width: 24 },
  { key: 'why', label: 'Why', width: 30 },
]

/** Requests > New: the trade quote card's sentences (weights and heads, never an amount). */
export const QUOTE_COLUMNS: Column<{ line: string }>[] = [{ key: 'line', label: 'Quote', width: 60 }]
