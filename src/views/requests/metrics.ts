/**
 * The Requests view's metric ids (docs/PLAN.md 12): every id whose home view is `requests`,
 * in the plan's order. Frozen in M1: names and ids never change. The metrics builder fills `metrics`
 * with one MetricDef per id (wording, formula, population, window, unit, uses and settings), and the
 * view's engine reads ids and settings from here, never as string literals.
 *
 * The catalog imports this file, so it stays plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'.
 */
import { defineMetrics } from '@/metrics/define'
import { BAND, F, uses } from '@/metrics/fields'
import type { MetricDef } from '@/metrics/types'
import { OWNER, POPULATION, WINDOW } from '@/metrics/wording'

/** Every metric id the view registers, by role. */
export const ID = {
  queueOpen: 'requests.queue.open',
  queueWaiting: 'requests.queue.waiting',
  queueSentBack: 'requests.queue.sentBack',
  queueExpired: 'requests.queue.expired',
  trackerDaysInStep: 'requests.tracker.daysInStep',
  chainLeaderThreshold: 'requests.chain.leaderThreshold',
  cycleNotSubmitted: 'requests.cycle.notSubmitted',
  cycleAsks: 'requests.cycle.asks',
  cycleAboveCut: 'requests.cycle.aboveCut',
  flagsBackfillNewPosition: 'requests.flags.backfillNewPosition',
  flagsBackfillNoExit: 'requests.flags.backfillNoExit',
  flagsFreezeExceptions: 'requests.flags.freezeExceptions',
  tradeRatio: 'requests.trade.ratio',
  tradeCredit: 'requests.trade.credit',
} as const

export type RequestsMetricId = (typeof ID)[keyof typeof ID]

/** The settings the view's engine reads through `ctx.metrics` (docs/PLAN.md 12), by role. */
export const PARAM = {
  /** Days in a step before a request counts as waiting (5). */
  waitingDays: { metricId: ID.queueWaiting, key: 'days' },
  /** Idle days before a Draft or Sent back request expires (60). */
  idleDays: { metricId: ID.queueExpired, key: 'idleDays' },
  /** Band estimate above which a request adds the leader step (250000, USD). */
  leaderThresholdUsd: { metricId: ID.chainLeaderThreshold, key: 'bandEstimateUsd' },
  /** Days around a known exit that flag a Backfill on a new position (30). */
  backfillWindowDays: { metricId: ID.flagsBackfillNewPosition, key: 'windowDays' },
} as const

/*
 * Managers read the queue, their tracker, cycle asks and trade weights, so those entries name no
 * amount, currency or grouped number. The leader threshold is a band figure, hidden in Manager mode
 * (docs/PLAN.md 12).
 */

/** A request in progress: its state, its current step and when it was entered. */
const QUEUE = uses(F.request, F.requestFlow)
/** A trade quote: the seats given and wanted, at the plan of record's trade rates. */
const TRADE = uses(F.request, F.trade, F.requestSeat, F.seat, BAND)
const PENDING = 'Submitted, In review or Sent back'

/** The view's dictionary entries, one per id in `ID`, in the same order. */
export const metrics: MetricDef[] = defineMetrics('requests', [
  /* ───────── queue ───────── */
  {
    id: ID.queueOpen,
    name: 'Requests in progress',
    views: ['home'],
    definition: `Requests in scope that are ${PENDING}. On Approvals it counts the steps waiting on you.`,
    formula: `count of requests in state ${PENDING}`,
    population: POPULATION.requests,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: QUEUE,
    owner: OWNER.hrbp,
  },
  {
    id: ID.queueWaiting,
    name: 'Waiting 5 or more days',
    views: ['home'],
    definition:
      'Requests in progress whose current step has waited 5 or more days (by default) since it was entered, at the as-of date.',
    formula: 'requests in progress with as-of date − step entered ≥ days',
    population: POPULATION.requests,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: QUEUE,
    owner: OWNER.hrbp,
    params: [
      {
        key: PARAM.waitingDays.key,
        label: 'Days in a step',
        description: 'A request counts as waiting once its current step has waited this many days.',
        type: 'days',
        default: 5,
        min: 1,
        max: 60,
        step: 1,
      },
    ],
  },
  {
    id: ID.queueSentBack,
    name: 'Sent back',
    definition: 'Requests sent back to their requester for changes and not yet submitted again.',
    formula: 'count of requests in state Sent back',
    population: POPULATION.requests,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: QUEUE,
    owner: OWNER.hrbp,
  },
  {
    id: ID.queueExpired,
    name: 'Expired',
    definition:
      'Draft and Sent back requests left idle for 60 days (by default) before the as-of date: they expire. Requests in an open planning cycle never expire.',
    formula: 'Draft or Sent back requests with as-of date − last update ≥ idle days, outside an open cycle',
    population: POPULATION.requests,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(QUEUE, F.cycle),
    owner: OWNER.hrbp,
    params: [
      {
        key: PARAM.idleDays.key,
        label: 'Idle days before a request expires',
        description:
          'A Draft or Sent back request expires after this many days with no change. Requests in an open cycle never expire.',
        type: 'days',
        default: 60,
        min: 7,
        max: 365,
        step: 1,
      },
    ],
  },
  {
    id: ID.trackerDaysInStep,
    name: 'Days in step',
    views: ['team'],
    definition:
      'Days a request has spent in its current step: an approval step, or after approval Req opened, Interviewing, Offer accepted or Started, as the recruiting system reports them.',
    formula: 'as-of date − date the step was entered',
    population: 'One request.',
    window: WINDOW.asOf,
    unit: 'days',
    goodDirection: 'down',
    uses: uses(QUEUE, F.req, F.offer),
    owner: OWNER.hrbp,
  },
  /* ───────── chain ───────── */
  {
    id: ID.chainLeaderThreshold,
    name: 'Leader threshold',
    definition:
      'A request whose band estimate is above this adds the leader step to its approval chain. A level of Director or above, or a request out of plan, adds the leader step too.',
    formula: 'band estimate (a year, USD at plan rate, without SBC) > threshold',
    population: 'Requests, by the band estimate of the seats they add.',
    window: 'A year, at the plan rates of the request’s fiscal year.',
    unit: 'money',
    goodDirection: null,
    uses: [],
    kind: 'setting',
    owner: OWNER.hrbp,
    params: [
      {
        key: PARAM.leaderThresholdUsd.key,
        label: 'Leader threshold',
        description:
          'A band estimate strictly above this adds the leader step. It is locked, so routing never moves while a request waits.',
        type: 'number',
        default: 250_000,
        min: 0,
        step: 1000,
        format: 'moneyFull',
        locked: true,
      },
    ],
  },
  /* ───────── cycle ───────── */
  {
    id: ID.cycleNotSubmitted,
    name: 'Managers not submitted',
    views: ['home'],
    definition: 'Managers in scope who have not submitted any ranked asks to the open planning cycle.',
    formula: 'managers in scope − managers with a submitted ask in the cycle',
    population: 'Managers in scope: holders of a position another position reports to.',
    window: WINDOW.cycle,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(QUEUE, F.cycle, F.tree, F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.cycleAsks,
    name: 'Ranked asks',
    views: ['targets'],
    definition:
      'Requests submitted to the planning cycle, in each manager’s rank order. Each ask shows its heads, and outside Manager mode its in-year band estimate.',
    formula: 'count of cycle asks (requests with the cycle and a rank)',
    population: POPULATION.requests,
    window: WINDOW.cycle,
    unit: 'int',
    goodDirection: null,
    uses: uses(QUEUE, F.cycle, F.requestSeat, BAND),
    owner: OWNER.hrbp,
  },
  {
    id: ID.cycleAboveCut,
    name: 'Asks above the cut line',
    definition:
      'Ranked asks above the cut line. When Finance locks the cycle they are approved; asks below it are rejected with the reason "Below the cut line".',
    formula: 'count of ranked asks above the cut line',
    population: POPULATION.requests,
    window: WINDOW.cycle,
    unit: 'int',
    goodDirection: null,
    uses: uses(QUEUE, F.cycle),
    owner: OWNER.hrbp,
  },
  /* ───────── flags ───────── */
  {
    id: ID.flagsBackfillNewPosition,
    name: 'Backfills on new positions',
    views: ['finance'],
    definition:
      'Backfill requests whose named position was created within 30 days (by default) before or after a known exit in the same org and has no exit itself.',
    formula:
      'Backfill requests on a seat created within the window of an exit in the same org, with no exit of its own',
    population: POPULATION.requests,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(QUEUE, F.seat, F.tree, F.assignment),
    owner: OWNER.hrbp,
    params: [
      {
        key: PARAM.backfillWindowDays.key,
        label: 'Days around an exit',
        description:
          'A Backfill is flagged when its seat was created within this many days before or after a known exit in the same org.',
        type: 'days',
        default: 30,
        min: 1,
        max: 180,
        step: 1,
      },
    ],
  },
  {
    id: ID.flagsBackfillNoExit,
    name: 'Backfills with no exit',
    views: ['finance'],
    definition: 'Backfill requests on an existing seat whose holder has no exit.',
    formula: 'Backfill requests on a seat with no exit',
    population: POPULATION.requests,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(QUEUE, F.seat, F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.flagsFreezeExceptions,
    name: 'Freeze exceptions',
    views: ['finance'],
    definition:
      'Requests raised against a hiring freeze as an exception with a business reason. Each adds a Finance step after the usual chain.',
    formula: 'count of requests marked as a freeze exception',
    population: POPULATION.requests,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: uses(QUEUE, F.exception, F.freeze),
    owner: OWNER.hrbp,
  },
  /* ───────── trades ───────── */
  {
    id: ID.tradeRatio,
    name: 'Trade rate',
    views: ['whatif'],
    definition:
      'How many wanted seats a trade’s give side buys: the standard heads given, trade credit used included, divided by the standard heads of one wanted seat. Nothing rounds up, so the trade gets the whole number below it.',
    formula: '(Σ weight of the seats given + credit used) ÷ weight of one wanted seat',
    population: 'One trade: its give seats and its wanted seat type.',
    window: WINDOW.tradeYear,
    unit: 'num2',
    goodDirection: null,
    uses: TRADE,
    owner: OWNER.hrbp,
  },
  {
    id: ID.tradeCredit,
    name: 'Trade credit',
    views: ['team', 'targets'],
    definition:
      'Standard heads left over from a trade, held by the giving org until its fiscal year closes. Only that org can use it.',
    formula: 'Σ credit of the org’s approved trades − Σ credit used by its approved and pending trades',
    population: 'Approved and pending trades whose giving org is the org.',
    window: 'The fiscal year; credit lapses when the year closes.',
    unit: 'num2',
    goodDirection: null,
    uses: uses(F.request, F.trade),
    owner: OWNER.hrbp,
  },
])
