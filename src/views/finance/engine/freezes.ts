/**
 * Finance > Freezes (docs/PLAN.md 6.9, 10.4, 9.4), read only in M2: each freeze, the openings it
 * holds on the as-of date (`plan.openings.frozen`), the freeze exceptions raised against it, and the
 * freeze savings (`finance.freeze.savings`): each held opening's band estimate ÷ 12 × the active
 * fraction for each month held, plus the modeled backfills the freeze stops, at midpoint. Savings
 * are a band figure (guard B), shown in Finance and HR admin only; HRBP sees the openings held, with
 * "Shows in Finance mode." beside the savings.
 *
 * Readings taken here (views-2 builder, M2):
 *  - The openings are the Working Employee seats Open or Planned on the as-of date that the scope
 *    and filters select, each with its unfrozen forecast start (`forecastStart` with the Working version's time to
 *    fill at the seat's org); a seat with an earlier holder is a backfill seat.
 *  - The suppressed backfills come from the Working forecast as of the as-of date
 *    (`forecastDetail`, computed only where the savings show), over the whole company; a freeze's
 *    total is the engine's, per freeze, whatever the filters.
 *  - A freeze's exceptions are the requests the viewer may see that name it (`exception.freezeId`).
 *  - The savings card can be recomputed from what it shows (review RC-8): one input per opening each
 *    shown freeze holds (its band estimate for the months held, with the dates), one input per
 *    freeze for the modeled backfills it stops (at midpoint, from the forecast), and the steps
 *    openings held + stopped backfills = savings. Every input is a band figure (structure, guard B);
 *    the card's records are the openings held, with no amount column.
 */
import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import { NO_AMOUNTS_NOTE } from '@/cost/fit'
import { SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { monthEnd } from '@/data/fiscal'
import type { FreezeRow } from '@/data/schema'
import { calcInput, calcStep } from '@/drill/calc'
import { requestsOf, seatIndex } from '@/drill/seats'
import { drillSpec } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { forecastDetail, forecastStart, openedOn } from '@/plan/engine/forecast'
import {
  exceptionFreezeOf,
  type FreezeOpening,
  type FreezeSavings,
  freezeSavings,
  frozenOpenings,
} from '@/plan/engine/freeze'
import { seatDetailOn } from '@/plan/engine/versions'
import type { Position } from '@/plan/types'
import { freezeExemptionsOf } from '@/views/plan/engine/openings'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import {
  inTreeOf,
  latestRows,
  versionAssumptions,
  versionRates,
  type WorkingFrame,
} from '@/views/targets/engine/working'
import { ID } from '../metrics'
import type { FinancePrep } from './base'
import { FINANCE_FIGURES } from './figures'
import type { FinanceFreezes, FreezeListRow, FrozenOpeningRow } from './index'
import { figure } from './versions'
import { freezeWrites } from './writes'

/** Freeze savings show (Finance and HR admin, where the metric is shown). */
export const savingsShown = (p: FinancePrep): boolean =>
  (p.mode === 'exact' || p.mode === 'open') && p.ctx.access.can(`metric:${ID.freezeSavings}`)

/** The Working seats Open or Planned on the as-of date that the scope selects, as freezes read them. */
export function openingsOf(p: FinancePrep): { opening: FreezeOpening; position: Position }[] {
  const { ctx } = p
  const v = p.frame.version
  const lookup = v ? assumptionLookup(versionAssumptions(ctx.all, v), v) : null
  const out: { opening: FreezeOpening; position: Position }[] = []
  const exempt = freezeExemptionsOf(ctx)
  for (const seat of seatIndex(ctx).values()) {
    if (!p.selected.has(seat.positionId)) continue
    const s = seatDetailOn(seat, ctx.asOf)
    if (!s || (s.status !== 'Open' && s.status !== 'Planned')) continue
    const pos = s.position
    // Openings are Employee seats (contractor and intern seats are not approved heads, 6.5).
    if (pos.workerType !== 'Employee') continue
    const ttf =
      lookup?.num(
        'timeToFill',
        [pos.level],
        { businessUnit: pos.businessUnit, department: pos.department },
        0,
      ) ?? 0
    out.push({
      position: pos,
      opening: {
        positionId: s.positionId,
        status: s.status,
        place: {
          positionId: s.positionId,
          managerPositionId: pos.managerPositionId,
          businessUnit: pos.businessUnit,
          department: pos.department,
          costCenter: pos.costCenter,
        },
        seat: { level: pos.level, location: pos.location, fte: pos.fte },
        unfrozenStart: forecastStart(
          { status: s.status, targetStart: s.plannedStart, openedOn: openedOn(seat, ctx.asOf) },
          ctx.asOf,
          ttf,
        ),
        acceptedOffer: s.acceptedOffer != null,
        backfill: seat.assignments.length > 0,
        exemptFrom: exempt.get(s.positionId) ?? [],
      },
    })
  }
  return out
}

/** Freeze savings with the modeled backfills each freeze stops (the card's inputs, RC-8). */
interface Savings extends FreezeSavings {
  /** The modeled backfills each freeze stops, USD at midpoint (from the forecast). */
  backfills: ReadonlyMap<string, number>
}

const savingsMemo = new WeakMap<object, Map<string, Savings>>()

/** Freeze savings over the whole company's openings (memoized per data, plan state, version and date). */
function savingsOf(ctx: AnalyticsContext, frame: WorkingFrame, all: FinancePrep): Savings | null {
  const v = frame.version
  if (!v || !frame.rates) return null
  const key = `${v.versionId}|${ctx.asOf}`
  const holder: object = ctx.plan ?? ctx.all
  let byKey = savingsMemo.get(holder)
  if (!byKey) {
    byKey = new Map()
    savingsMemo.set(holder, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const rows = versionAssumptions(ctx.all, v)
  const inTree = inTreeOf(ctx.all.positions)
  const detail = forecastDetail({
    version: v,
    asOf: ctx.asOf,
    closes: ctx.plan?.closes ?? [],
    positions: ctx.all.positions,
    workers: ctx.all.workers,
    comp: ctx.all.comp,
    reqs: ctx.all.reqs,
    requests: requestsOf(ctx),
    freezes: ctx.all.freezes,
    assumptions: rows,
    rates: versionRates(ctx.all, v),
    inTree,
    minCosted: ctx.guard.rules.minCosted,
  })
  const rates = frame.rates
  const everyone = openingsOf({ ...all, selected: new Set(latestRows(ctx.all.positions).keys()) })
  const out = freezeSavings({
    openings: everyone.map((o) => o.opening),
    freezes: ctx.all.freezes,
    gridEnd: monthEnd(v.grid.to),
    proration: v.proration,
    inTree,
    bandUsd: (seat, place) => rates.bandUsd(seat, place.positionId ?? place.managerPositionId ?? ''),
    suppressedBackfills: detail.suppressedBackfills,
  })
  const backfills = new Map<string, number>()
  for (const b of detail.suppressedBackfills)
    backfills.set(b.freezeId, (backfills.get(b.freezeId) ?? 0) + b.usd)
  const withBackfills: Savings = { ...out, backfills }
  byKey.set(key, withBackfills)
  return withBackfills
}

const orgOf = (f: FreezeRow): string =>
  [f.businessUnit, f.department, f.costCenter, f.leaderPositionId].filter(Boolean).join(' · ')

/** Finance > Freezes. */
export function freezesTab(p: FinancePrep): FinanceFreezes {
  const { ctx } = p
  const freezes = [...ctx.data.freezes].sort((a, b) => (a.freezeId < b.freezeId ? -1 : 1))
  const inTree = inTreeOf(ctx.all.positions)
  const openings = openingsOf(p)
  const held = frozenOpenings(
    openings.map((o) => o.opening),
    ctx.all.freezes,
    ctx.asOf,
    inTree,
  )
  const posOf = new Map(openings.map((o) => [o.opening.positionId, o]))
  const allowed = savingsShown(p)
  const savings = allowed ? savingsOf(ctx, p.frame, p) : null
  // With no Working version there is nothing to price the openings with: "—", never 0.
  const shown = allowed && savings != null
  const perOpening = new Map<string, number>()
  for (const b of savings?.byOpening ?? [])
    perOpening.set(
      `${b.freezeId}|${b.positionId}`,
      (perOpening.get(`${b.freezeId}|${b.positionId}`) ?? 0) + b.amount,
    )
  const perFreeze = new Map((savings?.byFreeze ?? []).map((b) => [b.freezeId, b.amount]))
  const reason = shown
    ? null
    : allowed
      ? 'No Working version to price the openings with.'
      : p.mode === 'none'
        ? NO_AMOUNTS_NOTE
        : SHOWS_IN_FINANCE_NOTE

  const openingRows: FrozenOpeningRow[] = held.map((h) => {
    const o = posOf.get(h.positionId)
    const pos = o?.position
    return {
      positionId: h.positionId,
      title: pos?.title ?? null,
      org: pos ? [pos.businessUnit, pos.department].filter(Boolean).join(' · ') : '',
      status: o?.opening.status ?? 'Open',
      startDate: o?.opening.unfrozenStart ?? null,
      freezeId: h.freezeId,
      savingsUsd: shown ? (perOpening.get(`${h.freezeId}|${h.positionId}`) ?? 0) : null,
      reason,
    }
  })
  const freezeRows: FreezeListRow[] = freezes.map((f) => ({
    freezeId: f.freezeId,
    org: orgOf(f),
    startDate: f.startDate,
    endDate: f.endDate ?? null,
    allowBackfill: f.allowBackfill === true,
    allowBackfillText: f.allowBackfill ? 'Yes' : 'No',
    openingsHeld: held.filter((h) => h.freezeId === f.freezeId).length,
    exceptions: p.visible.filter(
      (r) => exceptionFreezeOf(r, ctx.all.freezes, inTree, ctx.asOf) === f.freezeId,
    ).length,
    savingsUsd: shown ? (perFreeze.get(f.freezeId) ?? 0) : null,
    reason,
  }))
  const heldPositions = held.map((h) => posOf.get(h.positionId)?.position).filter((x): x is Position => !!x)
  const total = shown ? freezeRows.reduce((a, r) => a + (r.savingsUsd ?? 0), 0) : null
  // The card's parts (RC-8): each shown freeze's openings held and the backfills it stops.
  const shownFreezes = new Set(freezeRows.map((r) => r.freezeId))
  const heldParts = shown ? (savings?.byOpening ?? []).filter((b) => shownFreezes.has(b.freezeId)) : []
  const openingsPart = heldParts.reduce((a, b) => a + b.amount, 0)
  const backfillParts = shown
    ? freezeRows.map((r) => ({ freezeId: r.freezeId, usd: savings?.backfills.get(r.freezeId) ?? 0 }))
    : []
  const backfillsPart = backfillParts.reduce((a, b) => a + b.usd, 0)

  const kpis: Kpi[] = [
    {
      id: 'finance-openings-frozen',
      metricId: PLAN_ID.openingsFrozen,
      label: 'Openings under a freeze',
      value: held.length,
      format: 'int',
      note: plural(new Set(held.map((h) => h.freezeId)).size, 'freeze'),
      definition: p.definition(PLAN_ID.openingsFrozen),
      drill: () =>
        drillSpec({
          kind: 'positions',
          title: 'Openings under a freeze',
          subtitle: `As of ${fmt(ctx.asOf, 'date')} · ${ctx.scopeLabel}`,
          rows: heldPositions,
          note: 'Open and Planned seats, not started and with no accepted offer, in a frozen org.',
          uses: p.uses(PLAN_ID.openingsFrozen),
        }),
      uses: p.uses(PLAN_ID.openingsFrozen),
    },
    {
      id: 'finance-freeze-savings',
      metricId: ID.freezeSavings,
      label: 'Freeze savings',
      value: total,
      format: 'money',
      ...(total == null && reason ? { suppressed: true, suppressedNote: reason } : {}),
      note: 'Band estimates of the openings held, for the months held',
      definition: p.definition(ID.freezeSavings),
      calc: () => ({
        title: 'Freeze savings',
        subtitle: `${p.frame.version?.name ?? p.fiscalYear} · plan rates`,
        metricId: ID.freezeSavings,
        value: total,
        format: 'money',
        inputs:
          total == null
            ? freezeRows.map((r) =>
                calcInput(
                  `Freeze ${r.freezeId} (${plural(r.openingsHeld, 'opening')} held)`,
                  null,
                  'money',
                  'Band estimate ÷ 12 × months held, and stopped backfills',
                ),
              )
            : [
                ...heldParts.map((b) =>
                  calcInput(
                    `${b.positionId} held by ${b.freezeId}, ${fmt(b.from, 'date')} to ${fmt(b.to, 'date')}`,
                    b.amount,
                    'money',
                    'Band estimate × months held ÷ 12, plan rates',
                  ),
                ),
                ...backfillParts.map((b) =>
                  calcInput(
                    `Modeled backfills ${b.freezeId} stops`,
                    b.usd,
                    'money',
                    'Modeled backfills at midpoint, from the forecast',
                  ),
                ),
              ],
        steps:
          total == null
            ? [calcStep('Freeze savings', '—', null, 'money')]
            : [
                calcStep(
                  'Openings held: Σ band estimate × months held ÷ 12',
                  heldParts.map((b) => fmt(b.amount, 'money')).join(' + ') || '0',
                  openingsPart,
                  'money',
                ),
                calcStep(
                  'Stopped backfills: Σ modeled backfills at midpoint',
                  backfillParts.map((b) => fmt(b.usd, 'money')).join(' + ') || '0',
                  backfillsPart,
                  'money',
                ),
                calcStep(
                  'Freeze savings = openings held + stopped backfills',
                  `${fmt(openingsPart, 'money')} + ${fmt(backfillsPart, 'money')}`,
                  total,
                  'money',
                ),
              ],
        ...(heldPositions.length
          ? {
              rows: () =>
                drillSpec({
                  kind: 'positions',
                  title: 'Freeze savings: the openings held',
                  subtitle: `As of ${fmt(ctx.asOf, 'date')} · ${ctx.scopeLabel}`,
                  rows: heldPositions,
                  note: 'Positions only: each opening’s band estimate for the months held is an input of the card.',
                  uses: p.uses(ID.freezeSavings),
                }),
            }
          : {}),
        ...(reason ? { note: reason } : {}),
        uses: p.uses(ID.freezeSavings),
      }),
      uses: p.uses(ID.freezeSavings),
    },
  ]

  const freezeColumns: Column<FreezeListRow>[] = [
    { key: 'freezeId', label: 'Freeze' },
    { key: 'org', label: 'Org' },
    { key: 'startDate', label: 'From', format: 'date' },
    { key: 'endDate', label: 'To', format: 'date' },
    { key: 'allowBackfillText', label: 'Backfills allowed' },
    { key: 'openingsHeld', label: 'Openings held', format: 'int' },
    { key: 'exceptions', label: 'Exceptions', format: 'int' },
    { key: 'savingsUsd', label: 'Savings (USD)', format: 'money', band: true },
    { key: 'reason', label: 'Note' },
  ]
  const openingColumns: Column<FrozenOpeningRow>[] = [
    { key: 'positionId', label: 'Position ID' },
    { key: 'title', label: 'Title' },
    { key: 'org', label: 'Org' },
    { key: 'status', label: 'Status' },
    { key: 'startDate', label: 'Start without the freeze', format: 'date' },
    { key: 'freezeId', label: 'Freeze' },
    { key: 'savingsUsd', label: 'Savings (USD)', format: 'money', band: true },
  ]
  return {
    kpis,
    writes: freezeWrites(p),
    freezes: figure(
      p,
      FINANCE_FIGURES.freezes,
      PLAN_ID.openingsFrozen,
      'Freezes',
      `On ${fmt(ctx.asOf, 'date')}: the openings each holds and the exceptions raised`,
      freezeRows,
      freezeColumns,
      freezeRows.length ? null : 'No freeze in this scope.',
    ),
    openings: figure(
      p,
      FINANCE_FIGURES.freezeOpenings,
      PLAN_ID.openingsFrozen,
      'Openings held',
      'Open and Planned seats a freeze holds; accepted offers are honored',
      openingRows,
      openingColumns,
      openingRows.length ? null : 'No opening is held by a freeze.',
    ),
  }
}
