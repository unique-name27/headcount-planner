/**
 * What the lever pickers offer (docs/PLAN.md 10.6, 11.2, 11.5): the levels and locations a level,
 * location or trade lever may take, the orgs in scope (a freeze lever's sub-org, a trade's get org),
 * the tradable seats with their weights in standard heads (the list Requests > New's trade form
 * reads: Open with no accepted offer, Planned or On hold, employee seats, in scope, in no other
 * pending request; a blocked seat carries its reason), and the trade credit orgs in scope hold.
 *
 * Weights come only from bands, standard loads and plan FX, so they show in every mode that shows
 * What if; nothing here is an amount. The tradable list is priced by one quote through the write
 * path's own quote (src/app/write/context.ts `actionEnvOf(ctx).quote`), so a seat's weight and
 * block here are exactly what a trade lever and "Turn into requests" read.
 *
 * Readings taken here (whatif builder, M3):
 *  - Filled seats are not listed one by one (an HRBP's unit holds hundreds); the list ends with a
 *    note and FILLED_NOT_TRADED_TEXT. A Filled seat put into a lever by hand is still refused by
 *    the quote with that text.
 *  - The orgs are the manager seats in scope (the scope's own seats included), by their latest
 *    rows, named by department and holder ("Physical Design (Dana Ito)").
 *
 * Pure (memoized per access context, data, plan state and fiscal year, so a filter change reprices
 * nothing).
 */

import { actionContextOf } from '@/app/write/context'
import { fyRange, monthStart } from '@/data/fiscal'
import { type FiscalYear, type ISODate, LEVELS, type Level, SITES } from '@/data/schema'
import { effectiveRequestsOf } from '@/drill/seats'
import { heldSeatRefusal } from '@/plan/actions/shared'
import type { ActionEnv } from '@/plan/actions/types'
import { seatWorkerType } from '@/plan/engine/targets'
import { creditBalance, FILLED_NOT_TRADED_TEXT, standardHeads, type TradeAsk } from '@/plan/engine/trade'
import type { OrgMatch } from '@/plan/types'
import { type Prep, seatLabel } from '@/views/targets/engine/base'

/** One seat a trade lever may give, with its weight, or why it cannot be given. */
export interface TradeGiveRow {
  positionId: string
  title: string | null
  level: Level
  location: string
  fte: number
  status: 'Open' | 'Planned' | 'On hold'
  /** Weight in basis points of a standard head (10 000 bp = 1); null with no band. */
  weightBp: number | null
  /** The weight in standard heads, to 2 dp ("1.92"). */
  standardHeads: string | null
  /** Why the seat cannot be given (an accepted offer, a pending request, outside scope), else null. */
  blocked: string | null
}

/** An org in scope: a manager seat. */
export interface OrgOption {
  positionId: string
  label: string
  businessUnit: string
}

/** Trade credit an org in scope holds for the year. */
export interface CreditRow {
  positionId: string
  label: string
  bp: number
  standardHeads: string
}

/** Everything the lever pickers offer. */
export interface WhatIfPickers {
  levels: readonly Level[]
  locations: readonly string[]
  orgs: readonly OrgOption[]
  give: readonly TradeGiveRow[]
  /** "Filled seats are not listed. Filled seats are never traded: ..." or null. */
  giveNote: string | null
  credits: readonly CreditRow[]
  /** The first day a start may be set to: the first open month's first day, or the year's first day. */
  firstStart: ISODate
  /** The fiscal year's first and last day. */
  fyStart: ISODate
  fyEnd: ISODate
}

const TRADABLE = new Set(['Open', 'Planned', 'On hold'])

/** The pickers' inputs: the prepared Targets inputs, the scope's org test and seat test, and the write path's env. */
export interface PickerInput {
  p: Prep
  org: OrgMatch
  inScope: (positionId: string) => boolean
  env: Pick<ActionEnv, 'quote'>
}

const memo = new WeakMap<object, WeakMap<object, WeakMap<object, Map<string, WhatIfPickers>>>>()
const NO_PLAN = {}

/** One level of the memo: the map under `key`, made when missing. */
function level<K extends object, V>(m: WeakMap<K, V>, key: K, make: () => V): V {
  let v = m.get(key)
  if (v === undefined) {
    v = make()
    m.set(key, v)
  }
  return v
}

/** The first day a lever's start may take in the year. */
export function firstStartOf(fiscalYear: FiscalYear, firstOpenMonth: string): ISODate {
  const fy = fyRange(fiscalYear)
  const open = monthStart(firstOpenMonth)
  return open > fy.start ? open : fy.start
}

/** The pickers for a prepared context (memoized: see the module comment). */
export function pickersOf(input: PickerInput): WhatIfPickers {
  const ctx = input.p.ctx
  const byData = level(memo, ctx.access, () => new WeakMap())
  const byPlan = level(byData, ctx.all, () => new WeakMap())
  const byKey = level(byPlan, ctx.plan ?? NO_PLAN, () => new Map<string, WhatIfPickers>())
  const key = `${input.p.fiscalYear}|${ctx.asOf}|${input.p.frame.version?.versionId ?? ''}`
  let hit = byKey.get(key)
  if (!hit) {
    hit = build(input)
    byKey.set(key, hit)
  }
  return hit
}

function build({ p, org, inScope, env }: PickerInput): WhatIfPickers {
  const ctx = p.ctx
  const fy = fyRange(p.fiscalYear)
  const firstStart = firstStartOf(p.fiscalYear, p.actx.firstOpenMonth)

  /* orgs: the manager seats in scope */
  const managers = new Set<string>()
  for (const r of p.latest.values()) {
    const m = r.managerPositionId
    if (m && m !== r.positionId && (inScope(m) || inScope(r.positionId))) managers.add(m)
  }
  const scope = ctx.access.scope
  const roots: ReadonlySet<string> = scope?.kind === 'tree' ? scope.rootPositionIds : new Set()
  for (const root of roots) managers.add(root)
  const orgs: OrgOption[] = [...managers]
    .filter((id) => {
      const r = p.latest.get(id)
      return !!r && r.status !== 'Eliminated' && (inScope(id) || roots.has(id))
    })
    .map((id) => ({
      positionId: id,
      label: seatLabel(p, id),
      businessUnit: p.latest.get(id)?.businessUnit ?? '',
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.positionId.localeCompare(b.positionId))

  /* the tradable seats, priced by one quote */
  const on = ctx.asOf
  const ids: string[] = []
  let filled = false
  for (const id of p.actx.positionIds) {
    const s = p.actx.seatOn(id, on)
    if (!s || !org(s.place, on) || seatWorkerType(s) !== 'Employee') continue
    if (s.status === 'Filled') filled = true
    else if (TRADABLE.has(s.status)) ids.push(id)
  }
  const give: TradeGiveRow[] = []
  if (ids.length) {
    const first = p.actx.seatOn(ids[0], on)
    const ask: TradeAsk = {
      give: ids,
      creditUsedBp: 0,
      giveOrgPositionId: null,
      get: {
        level: first?.seat.level ?? 'P3',
        location: first?.seat.location ?? SITES[0].location,
        fte: 1,
        orgPositionId: first?.place.managerPositionId ?? '',
        businessUnit: first?.place.businessUnit ?? '',
        jobFamily: null,
        start: firstStart,
        count: 0,
        partTimeRest: false,
      },
    }
    const q = env.quote(ask)
    const blocked = new Map<string, string>()
    for (const b of q.blocks)
      if (b.positionId && !blocked.has(b.positionId)) blocked.set(b.positionId, b.text)
    // A receiving seat an approved internal move holds is nobody's to trade (review SC-6).
    const actx = ctx.plan ? actionContextOf(ctx, { readOnly: false, at: `${ctx.asOf}T00:00:00.000Z` }) : null
    if (actx)
      for (const id of ids) {
        const held = blocked.has(id) ? null : heldSeatRefusal(actx, id)
        if (held) blocked.set(id, held)
      }
    for (const l of q.give) {
      const id = l.positionId as string
      const s = p.actx.seatOn(id, on)
      give.push({
        positionId: id,
        title: p.latest.get(id)?.title ?? null,
        level: l.level,
        location: l.location,
        fte: l.fte,
        status: (s?.status ?? 'Open') as TradeGiveRow['status'],
        weightBp: l.weightBp,
        standardHeads: l.weightBp == null ? null : standardHeads(l.weightBp),
        blocked: blocked.get(id) ?? null,
      })
    }
  }

  /* trade credit held in scope: an expired trade reserves none (D-EXPIRY, the one effective state) */
  const requests = effectiveRequestsOf(ctx)
  const holders = new Set<string>()
  for (const r of requests) {
    const g = r.trade?.giveOrgPositionId
    if (r.type === 'Trade' && g && (inScope(g) || managers.has(g))) holders.add(g)
  }
  const credits: CreditRow[] = []
  for (const id of [...holders].sort()) {
    const bp = creditBalance(requests, id, p.fiscalYear)
    if (bp > 0)
      credits.push({ positionId: id, label: seatLabel(p, id), bp, standardHeads: standardHeads(bp) })
  }

  return {
    levels: LEVELS,
    locations: SITES.map((s) => s.location),
    orgs,
    give,
    giveNote: filled ? `Filled seats are not listed. ${FILLED_NOT_TRADED_TEXT}` : null,
    credits,
    firstStart,
    fyStart: fy.start,
    fyEnd: fy.end,
  }
}
