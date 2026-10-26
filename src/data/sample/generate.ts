/**
 * The sample the app opens on (docs/PLAN.md 13): `generateSample()` builds the base datasets
 * (base.ts), then on top of them, in this order and with the plan engines:
 *
 *   1. the April to September 2026 month closes, each with its cost-atom index (closes.ts);
 *   2. the FY27 Budget and the FY27 Q1 Reforecast, locked "as of" 20 Mar and 15 Jul 2026 and hashed
 *      with `sha256()` (versions.ts), beside FY27 Working and FY28 Working;
 *   3. story 9's pending trade, priced and routed by the engines (trades.ts);
 *   4. the FY28 cycle, Open for asks, and Silicon Engineering's ranked asks (cycle.ts);
 *   5. the plan state: versions, closes, the cycle and the merge base of the managers' request files.
 *
 * Synchronous and deterministic (16.2: under 1,500 ms, hashing included). Request IDs added here
 * follow the base's: the trade first (R-1040), then the cycle asks in raised order.
 *
 * The plan state's `baselineId` names the whole generated sample (`sampleBaselineId`, lead browser
 * finding B9): a SHA-256 over the canonical JSON of every dataset, the raw extracts' planted rows the
 * app shows (M4 recheck B9-b) and the seeded plan state, so a build whose generator or extracts give
 * any other row, request, close or version gives another id, and a
 * plan state stored against an earlier build is set aside rather than laid over this one
 * (src/app/planState.ts). It once read the Budget's lock hash alone, which an M3 fix to the sample's
 * requests did not move.
 */
import { sha256 } from '@/lib/sha256'
import { canonicalJson } from '@/plan/canonical'
import { fromRow } from '@/plan/engine/requests'
import type { Actor, AnyVersion, MonthClose, PlanState } from '@/plan/types'
import type { Datasets, ISODate, RequestRow } from '../schema'
import { generateSampleBase, SAMPLE_AS_OF, type SampleBase } from './base'
import { sampleCloses } from './closes'
import { cycleAsks, FY28_CYCLE_ID, fy28Cycle } from './cycle'
import { RAW_DATASETS } from './raw/plan'
import { PLANTED, type Planted } from './raw/planted'
import { sampleMergeBase } from './raw/requestFiles'
import {
  quoteTrade,
  routeTrade,
  TRADE_SUBMIT,
  type TradeParties,
  tradeParties,
  tradeRow,
  withSteps,
} from './trades'
import { lockBudget, lockQ1Reforecast, type SampleLocks, sampleVersions } from './versions'

/** The IDs of what generate.ts adds for stories 6 and 9. */
export interface SampleStoryIds {
  tradeRequestId: string
  trade: TradeParties
  cycleId: string
  /** Silicon Engineering's cycle asks, in raised order. */
  cycleAskIds: string[]
  /** Silicon Engineering's managers on 30 Sep 2026 (the cycle's population). */
  seManagers: string[]
  /** The 4 who have not sent an ask. */
  notSubmitted: string[]
}

export interface Sample extends SampleBase {
  /** The plan state the sample starts with (5.4: an overlay keeps your changes against `baselineId`). */
  plan: PlanState
  locks: SampleLocks
  story: SampleStoryIds
  asOf: ISODate
}

const requestNumber = (id: string): number => +id.replace(/^R-/, '')

/**
 * A version as the baseline id reads it: a locked version's lines, assumptions and rates by its lock
 * hash (which covers them, with the proration and the engine version), its stored forecast by a hash
 * of its own; a Working version whole.
 */
function versionForBaseline(v: AnyVersion): unknown {
  if (v.state !== 'locked') return v
  const { lines: _lines, assumptions: _assumptions, rates: _rates, forecast, ...head } = v
  return { ...head, forecast: forecast ? sha256(canonicalJson(forecast)) : null }
}

/** A month close as the baseline id reads it: its lines and atoms by its hash, which covers them. */
const closeForBaseline = ({ lines: _lines, atoms: _atoms, ...head }: MonthClose): unknown => head

/**
 * The sample's baseline id (B9): 'northgate-' and 12 hex digits of a SHA-256 (src/lib/sha256.ts)
 * over the canonical JSON of every dataset, the rows the app shows for the four raw datasets (each
 * extract's planted rows, ./raw/planted.ts, by their hash; M4 recheck B9-b) and the seeded plan
 * state (its own `baselineId` left out; locked versions and closes by their hashes). Any change a
 * generator or a planted extract makes to what the sample shows gives another id. `planted` is the
 * extracts' rows (a test passes another build's). Pure.
 */
export function sampleBaselineId(
  datasets: Datasets,
  plan: Omit<PlanState, 'baselineId'>,
  planted: Planted = PLANTED,
): string {
  const { baselineId: _id, ...rest } = plan as PlanState
  const seeded = {
    ...rest,
    versions: rest.versions.map(versionForBaseline),
    closes: rest.closes.map(closeForBaseline),
  }
  const shown = Object.fromEntries(RAW_DATASETS.map((k) => [k, sha256(canonicalJson(planted[k](datasets)))]))
  return `northgate-${sha256(canonicalJson({ datasets, shown, plan: seeded })).slice(0, 12)}`
}

/** The FP&A lead as the Finance actor who locks, closes and opens the cycle. */
function financeActor(base: SampleBase): Actor {
  const p = base.personas.find((x) => x.key === 'finance-fpa')!
  return { personId: p.employeeId, name: p.name, mode: 'finance' }
}

export function generateSample(): Sample {
  const base = generateSampleBase()
  const finance = financeActor(base)

  const closes = sampleCloses(base, finance.personId)
  const budget = lockBudget(base, finance)
  const q1 = lockQ1Reforecast(base, closes, finance, [budget])
  const locks: SampleLocks = { budget, q1 }

  // Story 9's trade: priced at submit, routed on the as-of date.
  const baseRequests = base.datasets.requests.map(fromRow)
  let next = Math.max(...base.datasets.requests.map((r) => requestNumber(r.requestId))) + 1
  const id = () => `R-${next++}`
  const parties = tradeParties(base.world)
  const quote = quoteTrade({
    data: base.datasets,
    q1,
    parties,
    on: TRADE_SUBMIT.day,
    firstOpenMonth: TRADE_SUBMIT.firstOpenMonth,
    requests: baseRequests,
  })
  const draft = tradeRow(id(), parties, quote, q1)
  const routing = routeTrade({
    w: base.world,
    data: base.datasets,
    trade: draft,
    requests: baseRequests,
    closes,
    financeApproverId: finance.personId,
    getBandUsd: quote.getBandUsd,
  })
  const trade = withSteps(draft, routing.steps)

  // Story 6: the FY28 cycle and Silicon Engineering's ranked asks.
  const asks = cycleAsks(base.world, () => id())
  const requests: RequestRow[] = [...base.datasets.requests, trade, ...asks.rows]
  const datasets: Datasets = { ...base.datasets, requests }

  const seeded: Omit<PlanState, 'baselineId'> = {
    v: 1,
    versions: sampleVersions(locks),
    closes,
    adjustments: [],
    overlay: { positions: [], targets: [], freezes: [], assumptions: [] },
    requests: [],
    cycles: [fy28Cycle(finance.personId)],
    reviewed: [],
    mergeBase: sampleMergeBase({
      datasets,
      personas: base.personas,
      planted: base.planted,
      tradeRequestId: trade.requestId,
    }),
    auditHead: null,
  }
  const plan: PlanState = { ...seeded, baselineId: sampleBaselineId(datasets, seeded) }

  return {
    ...base,
    datasets,
    plan,
    locks,
    story: {
      tradeRequestId: trade.requestId,
      trade: parties,
      cycleId: FY28_CYCLE_ID,
      cycleAskIds: asks.rows.map((r) => r.requestId),
      seManagers: asks.managers,
      notSubmitted: asks.notSubmitted,
    },
    asOf: SAMPLE_AS_OF,
  }
}

let cached: Sample | null = null

/** The sample, generated once per page (it is the same every time). */
export function cachedSample(): Sample {
  cached ??= generateSample()
  return cached
}
