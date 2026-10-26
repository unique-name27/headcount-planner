/**
 * Plan-ui's scenarios through the write path (docs/PLAN.md 9.4 Plan > Positions and Transfers, 10.1,
 * 10.5, 7.2 rule 3, 9.3 and 9.6; docs/CONTRACTS-M3.md 3), walked as the app runs them: the write
 * harness over the sample, each step acting as its person, every model read after it.
 *
 * - An HRBP moves an Open seat's start from January to March with a reason (two edits through
 *   `editSeat`, as the Positions form sends them): Plan > Positions' row reads the new months and
 *   "Changed by the HRBP: start moved from Jan to Mar"; its manager reads "Changed by your HRBP: start
 *   moved from Jan to Mar" on the seat and in My team, with the reason; a manager of another team
 *   reads nothing; every atom's exact filled part is unchanged to the cent in every version while its
 *   band part moves (7.2 rule 3).
 * - An accepted-offer seat and a Filled seat are offered no edit, and the action refuses them in the
 *   same words the form gives.
 * - Openings past their target start, and Planned seats near start with no req, leave the homes'
 *   lists once the HRBP moves their start (the Action center's split the homes and My team read).
 * - A transfer processed on Plan > Transfers: saved as a draft that lists under "Your transfer
 *   drafts", submitted, then in progress with its step; each approver finds it in Needs attention on
 *   their home until they decide it, and it closes then.
 * Every entry is signed by its step's person and the chain verifies.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { chainOk, deciderOf, scenario, type Who } from '@/app/write/scenario.testkit'
import { atomOf } from '@/cost/atoms'
import { COST_FIELDS, memberIdOf } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { seatStateOf } from '@/drill/seats'
import { addDays } from '@/lib/dates'
import { ACCEPTED_OFFER_TEXT, REMOVE_AMOUNT_TEXT, SEAT_NOT_EDITABLE_TEXT } from '@/plan/actions'
import { isLocked } from '@/plan/engine/versions'
import type { HcRequest, PlanLine } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf } from '@/testkit/sample'
import { actionsModel, type OpenAction } from '@/views/actions/engine'
import { ITEM_SOURCES } from '@/views/home/engine/sources'
import { teamModel } from '@/views/team/engine'
import { planModel } from '.'
import { managerOfIn, shownLines, versionLinesOf } from './core'
import {
  requestIdIn,
  seatEditInputOf,
  seatEditOf,
  seatEditsOf,
  transferInputOf,
  transferOptions,
} from './edits'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const SE = 'Silicon Engineering'
let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** Every item id of a list, roll-ups opened into their members. */
const idsOf = (list: readonly OpenAction[]): string[] =>
  list.flatMap((a) => (a.members?.length ? a.members.map((m) => m.id) : [a.id]))

/** The exact filled part of every atom, by version, source and month: each amount field summed. */
function filledParts(ctx: AnalyticsContext): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const index = ctx.guard.atoms
  const managerOf = managerOfIn(ctx)
  const add = (source: string, lines: Iterable<PlanLine>, part: 'filled' | 'band') => {
    for (const l of lines) {
      if ((l.basis === 'band') !== (part === 'band')) continue
      const atom = atomOf(memberIdOf(l), index, managerOf) ?? `none:${memberIdOf(l)}`
      const k = `${part}|${source}|${atom}|${l.month}`
      let v = out.get(k)
      if (!v) {
        v = new Array<number>(COST_FIELDS.length).fill(0)
        out.set(k, v)
      }
      COST_FIELDS.forEach((f, i) => {
        ;(v as number[])[i] += l.usd[f]
      })
    }
  }
  for (const v of ctx.versions) {
    if (v.state === 'retired') continue
    for (const part of ['filled', 'band'] as const) {
      add(`own:${v.versionId}`, versionLinesOf(ctx, v), part)
      if (!isLocked(v)) add(`shown:${v.versionId}`, shownLines(ctx, v), part)
    }
  }
  return out
}

/** The keys of one part whose amounts differ by more than half a cent. */
function moved(a: Map<string, number[]>, b: Map<string, number[]>, part: 'filled' | 'band'): string[] {
  const zero = new Array<number>(COST_FIELDS.length).fill(0)
  const out: string[] = []
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (!k.startsWith(`${part}|`)) continue
    const x = a.get(k) ?? zero
    const y = b.get(k) ?? zero
    if (x.some((v, i) => Math.abs(v - y[i]) > 0.005)) out.push(k)
  }
  return out
}

describe('an HRBP moves an Open seat’s start in Working', () => {
  it('shows on the seat and in My team for its manager, and moves no atom’s filled part', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const ctx0 = await sc.ctx(hr)
    // An Open seat the HRBP may edit, starting in the fiscal year, with a manager in the seat above.
    const choice = seatEditsOf(ctx0).seats.find((x) => {
      const st = seatStateOf(ctx0, x.positionId)
      const mgr = st?.position.managerPositionId
      return (
        x.status === 'Open' &&
        (st?.plannedStart ?? '') >= '2026-12-01' &&
        !!mgr &&
        (seatStateOf(ctx0, mgr)?.holderIds.length ?? 0) > 0
      )
    })
    expect(choice).toBeTruthy()
    const id = choice?.positionId as string
    const managerSeat = seatStateOf(ctx0, id)?.position.managerPositionId as string
    const manager: Who = { mode: 'manager', personId: seatStateOf(ctx0, managerSeat)?.holderIds[0] as string }
    const before = filledParts(await sc.ctx(admin))
    const gridBefore = planModel(ctx0).positions.grid.rows.find((r) => r.positionId === id)
    expect(gridBefore?.hrbpNote).toBeNull()

    // The form sends what changed; a reason with an amount never reaches a manager (8.4 rule 5).
    const facts = seatEditOf(ctx0, id)
    expect(facts.editable).toBe(true)
    const withAmount = await sc.run(
      hr,
      'editSeat',
      seatEditInputOf(facts, { ...facts.current, startDate: '2027-01-11' }, 'Saves 40k this year'),
    )
    expect(withAmount.outcome).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    const first = await sc.run(
      hr,
      'editSeat',
      seatEditInputOf(facts, { ...facts.current, startDate: '2027-01-11' }, 'Aligned with the team plan'),
    )
    expect(first.outcome.ok).toBe(true)
    const facts2 = seatEditOf(await sc.ctx(hr), id)
    expect(facts2.current.startDate).toBe('2027-01-11')
    const second = await sc.run(
      hr,
      'editSeat',
      seatEditInputOf(facts2, { ...facts2.current, startDate: '2027-03-08' }, 'Hiring plan moved to spring'),
    )
    expect(second.outcome.ok).toBe(true)
    for (const e of [...first.entries, ...second.entries]) {
      expect(e.by).toBe(hr.personId)
      expect(e.mode).toBe('hrbp')
    }

    // Plan > Positions in HRBP mode: the new months and the note; the changes list holds both edits.
    const hrCtx = await sc.ctx(hr)
    const row = planModel(hrCtx).positions.grid.rows.find((r) => r.positionId === id)
    expect(row?.hrbpNote).toBe('Changed by the HRBP: start moved from Jan to Mar')
    expect(row?.['2027-02']).toBe('Open')
    expect(row?.['2027-03']).toBe('Filled')
    const changes = planModel(hrCtx).positions.changes.rows.filter((r) => r.positionId === id)
    expect(changes.map((r) => [r.change, r.reason])).toEqual([
      ['Changed by the HRBP: start moved from Jan to Mar', 'Hiring plan moved to spring'],
      [expect.stringMatching(/^Changed by the HRBP: start /), 'Aligned with the team plan'],
    ])

    // The seat's manager reads it on the seat and in My team, with the reason.
    const mCtx = await sc.ctx(manager)
    const mRow = planModel(mCtx).positions.grid.rows.find((r) => r.positionId === id)
    expect(mRow?.hrbpNote).toBe('Changed by your HRBP: start moved from Jan to Mar')
    const team = teamModel(mCtx).hrbpChanges
    expect(team.rows[0]).toMatchObject({
      positionId: id,
      change: 'Changed by your HRBP: start moved from Jan to Mar',
      reason: 'Hiring plan moved to spring',
    })
    expect(team.rows.every((r) => r.positionId === id)).toBe(true)
    // A manager of another team reads nothing of it, on the seat or in My team.
    const other: Who = { mode: 'manager', personId: personaOf(s, 'manager-a').employeeId }
    const oCtx = await sc.ctx(other)
    expect(teamModel(oCtx).hrbpChanges.rows).toEqual([])
    expect(planModel(oCtx).positions.grid.rows.some((r) => r.hrbpNote)).toBe(false)

    // 7.2 rule 3: no atom's exact filled part moves, in any version; the band part does.
    const after = filledParts(await sc.ctx(admin))
    expect(moved(before, after, 'filled')).toEqual([])
    expect(moved(before, after, 'band').length).toBeGreaterThan(0)
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)

  it('offers no edit on an accepted offer or a Filled seat, and the action refuses them in the same words', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const ctx = await sc.ctx(hr)
    const ids = [...new Set(ctx.data.positions.map((r) => r.positionId))]
    const accepted = ids.find((x) => seatStateOf(ctx, x)?.acceptedOffer) as string
    const filled = ids.find((x) => seatStateOf(ctx, x)?.status === 'Filled') as string
    const listed = new Set(seatEditsOf(ctx).seats.map((x) => x.positionId))
    for (const [id, words] of [
      [accepted, ACCEPTED_OFFER_TEXT],
      [filled, SEAT_NOT_EDITABLE_TEXT],
    ] as const) {
      expect(listed.has(id), id).toBe(false)
      const f = seatEditOf(ctx, id)
      expect(f.why, id).toBe(words)
      const out = await sc.run(hr, 'editSeat', {
        positionId: id,
        effectiveDate: f.effectiveDate,
        changes: { startDate: '2027-02-01' },
        reason: 'A later start',
      })
      expect(out.outcome, id).toEqual({ ok: false, refused: words })
      expect(out.entries).toEqual([])
    }
    // An accepted offer may still be eliminated (C23): the form offers the Elimination draft.
    expect(seatEditOf(ctx, accepted).eliminate.offered).toBe(true)
    const draft = await sc.run(hr, 'requestElimination', {
      positionId: accepted,
      reasonCode: 'Restructure',
      lastDay: null,
    })
    expect(draft.outcome.ok).toBe(true)
    const rid = requestIdIn(draft.outcome.ok ? draft.outcome.notice : '') as string
    expect((await sc.request(rid))?.type).toBe('Elimination')
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)
})

describe('the homes’ lists after Working edits', () => {
  /** The HRBP's editable seats whose opening takes its target start from the seat (no open req: a req's is the ATS's). */
  function ownStartSeats(ctx: AnalyticsContext): Set<string> {
    const noReqRow = new Set(
      planModel(ctx)
        .openings.table.rows.filter((r) => r.reqId == null)
        .map((r) => r.positionId),
    )
    return new Set(
      seatEditsOf(ctx)
        .seats.map((x) => x.positionId)
        .filter((x) => noReqRow.has(x)),
    )
  }

  /** The first item of a kind on an editable seat, in the HRBP's lists (roll-ups opened). */
  function itemOn(ctx: AnalyticsContext, kind: string): OpenAction | undefined {
    const editable = ownStartSeats(ctx)
    const m = actionsModel(ctx, ITEM_SOURCES)
    return [...m.needs, ...m.waiting]
      .flatMap((a) => (a.members?.length ? a.members : [a]))
      .find((a) => a.id.startsWith(`plan:${kind}:`) && editable.has(a.positionId ?? ''))
  }

  it('a Planned seat near start with no req, and an opening past target start, close when the HRBP moves their start', async () => {
    const sc = scenario()
    const se: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const gtm: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const seCtx = await sc.ctx(se)
    const gtmCtx = await sc.ctx(gtm)
    const noReq = itemOn(seCtx, 'planned-no-req')
    const past = itemOn(gtmCtx, 'past-start')
    expect(noReq && past).toBeTruthy()
    // 9.6: a Planned seat near start is in the HRBP's Needs attention, an opening past start waits on others.
    expect(idsOf(actionsModel(seCtx, ITEM_SOURCES).needs)).toContain(noReq?.id)
    expect(idsOf(actionsModel(gtmCtx, ITEM_SOURCES).waiting)).toContain(past?.id)
    // The Planned seat's manager has it in Needs attention on My team too.
    const mgrSeat = seatStateOf(seCtx, noReq?.positionId as string)?.position.managerPositionId as string
    const manager: Who = { mode: 'manager', personId: seatStateOf(seCtx, mgrSeat)?.holderIds[0] as string }
    expect(idsOf(actionsModel(await sc.ctx(manager), ITEM_SOURCES).needs)).toContain(noReq?.id)

    for (const [who, a] of [
      [se, noReq],
      [gtm, past],
    ] as const) {
      const f = seatEditOf(await sc.ctx(who), a?.positionId as string)
      const out = await sc.run(
        who,
        'editSeat',
        seatEditInputOf(
          f,
          { ...f.current, startDate: addDays(s.asOf, 120) },
          'Start after the planning cycle',
        ),
      )
      expect(out.outcome.ok, a?.id).toBe(true)
    }
    expect(idsOf(actionsModel(await sc.ctx(se), ITEM_SOURCES).needs)).not.toContain(noReq?.id)
    expect(idsOf(actionsModel(await sc.ctx(gtm), ITEM_SOURCES).waiting)).not.toContain(past?.id)
    expect(idsOf(actionsModel(await sc.ctx(manager), ITEM_SOURCES).needs)).not.toContain(noReq?.id)
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)
})

describe('a transfer processed on Plan > Transfers', () => {
  it('is a draft, then submitted, waits on each approver’s home until they decide, and closes there', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const ctx = await sc.ctx(hr)
    const options = transferOptions(ctx)
    expect(options.offered).toBe(true)
    // A person whose seat's manager is in a seat, into another manager position of the unit (a position move).
    const who = options.people.find((p) => {
      const mgr = seatStateOf(ctx, p.positionId)?.position.managerPositionId
      return !!mgr && (seatStateOf(ctx, mgr)?.holderIds.length ?? 0) > 0
    })
    const fromManager = seatStateOf(ctx, who?.positionId as string)?.position.managerPositionId
    const to = options.managers.find(
      (x) =>
        x.positionId !== fromManager &&
        x.positionId !== who?.positionId &&
        seatStateOf(ctx, x.positionId)?.position.businessUnit === SE,
    )
    expect(who && to).toBeTruthy()
    const input = transferInputOf(options, {
      kind: 'position',
      personId: who?.personId as string,
      toId: to?.positionId as string,
      effectiveDate: options.effectiveDate,
      moveBudget: false,
      reasonCode: 'Restructure',
    })
    expect(input).not.toBeNull()
    const draft = await sc.run(hr, 'processTransfer', input as NonNullable<typeof input>)
    expect(draft.outcome.ok).toBe(true)
    const rid = requestIdIn(draft.outcome.ok ? draft.outcome.notice : '') as string
    expect(rid).toMatch(/^R-/)

    // "Your transfer drafts" lists it with the person's name; the transfers table does not count it yet.
    let m = planModel(await sc.ctx(hr)).transfers
    expect(m.drafts.rows.map((r) => [r.requestId, r.personName, r.fromPositionId, r.toPositionId])).toEqual([
      [rid, who?.name, who?.positionId, to?.positionId],
    ])
    expect(m.table.rows.some((r) => r.requestId === rid)).toBe(false)
    // The draft names the person's manager as requester, but it is the HRBP's until submitted: no
    // other mode or person lists it (the manager, Finance, the SVP of the unit).
    const requester = (await sc.request(rid))?.requesterId as string
    expect(requester).not.toBe(hr.personId)
    for (const who2 of [
      { mode: 'manager', personId: requester },
      { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId },
      { mode: 'leader', personId: personaOf(s, 'leader-svp-se').employeeId },
    ] as Who[]) {
      const d = planModel(await sc.ctx(who2)).transfers.drafts
      expect(d.rows, who2.mode).toEqual([])
      expect(d.empty, who2.mode).toBe((await sc.ctx(who2)).access.decide('action:transfer.process').how)
    }

    const sent = await sc.run(hr, 'submitRequest', { requestId: rid })
    expect(sent.outcome.ok).toBe(true)
    m = planModel(await sc.ctx(hr)).transfers
    expect(m.drafts.rows).toEqual([])
    const row = m.table.rows.find((r) => r.requestId === rid)
    const steps = ((await sc.request(rid)) as HcRequest).steps
    const ROLE = { manager: 'Manager', hrbp: 'HRBP', leader: 'Leader', finance: 'Finance' } as const
    expect(row).toMatchObject({
      kind: 'position',
      personName: who?.name,
      step: `${ROLE[steps[0].role]} (step 1 of ${steps.length})`,
    })

    // Each approver finds it in Needs attention on their home, until they decide it.
    for (let guard = 0; guard < 6; guard++) {
      const req = (await sc.request(rid)) as HcRequest
      if (!req.steps.some((x) => x.enteredAt != null && x.decision == null)) break
      const decider = deciderOf(sc.sample, req)
      const item = `requests:approve:${rid}`
      expect(idsOf(actionsModel(await sc.ctx(decider), ITEM_SOURCES).needs), decider.mode).toContain(item)
      const out = await sc.run(decider, 'approveRequest', { requestId: rid })
      expect(out.outcome.ok, decider.mode).toBe(true)
      for (const e of out.entries) expect(e.by).toBe(decider.personId)
      expect(idsOf(actionsModel(await sc.ctx(decider), ITEM_SOURCES).needs), decider.mode).not.toContain(item)
    }
    expect((await sc.request(rid))?.state).toBe('Approved')
    // The moving person's old manager reads it in Plan > Transfers by name, never an amount (8.4 rule 2a).
    const oldManager: Who = {
      mode: 'manager',
      personId: seatStateOf(ctx, fromManager as string)?.holderIds[0] as string,
    }
    const seen = planModel(await sc.ctx(oldManager)).transfers.table.rows.find((r) => r.requestId === rid)
    expect(seen?.personName).toBe(who?.name)
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)

  it('a transfer draft withdrawn from the list leaves it', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const ctx = await sc.ctx(hr)
    const options = transferOptions(ctx)
    const who = options.people[0]
    const into = options.openSeats.find((x) => seatStateOf(ctx, x.positionId)?.position.businessUnit === SE)
    const input = transferInputOf(options, {
      kind: 'internal',
      personId: who.personId,
      toId: into?.positionId as string,
      effectiveDate: options.effectiveDate,
      moveBudget: false,
      reasonCode: 'Restructure',
    })
    const draft = await sc.run(hr, 'processTransfer', input as NonNullable<typeof input>)
    const rid = requestIdIn(draft.outcome.ok ? draft.outcome.notice : '') as string
    expect(planModel(await sc.ctx(hr)).transfers.drafts.rows.map((r) => r.requestId)).toEqual([rid])
    const out = await sc.run(hr, 'withdrawRequest', { requestId: rid })
    expect(out.outcome.ok).toBe(true)
    expect(planModel(await sc.ctx(hr)).transfers.drafts.rows).toEqual([])
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})
