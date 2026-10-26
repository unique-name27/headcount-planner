/**
 * Requests > New (docs/PLAN.md 9.4, 10.1 to 10.5, 11.5, 8.4, 16.1 Manager C (a); docs/CONTRACTS-M3.md
 * 3, requests-ui): the model in every mode (the types offered and their reasons, the seats and what
 * each may be named in, an accepted-offer seat naming only an Elimination, Manager mode printing no
 * amount and never the leader threshold), and the preview against the write path: the chain the
 * preview shows is the chain submit stores (a New role, a trade, a submit on behalf, a freeze
 * exception; Manager C's and the manager below's with and without the confidential Elimination), the
 * freeze notice and its exception, and the free text a manager reads refused with an amount.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import { decide } from '@/access/policy'
import { hasAmount } from '@/access/visibility'
import { chainOk, type Scenario, scenario, type Who } from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import { invalidRefs } from '@/data/quality/fieldRef'
import type { Sample } from '@/data/sample'
import { REASON_CODES_OF, REQUEST_TYPES, type RequestType } from '@/data/schema'
import { ACCEPTED_OFFER_TEXT, FILLED_NOT_TRADED_TEXT, REMOVE_AMOUNT_TEXT } from '@/plan/actions'
import { requestIdInText } from '@/plan/actions/requestIds'
import type { HcRequest, Step } from '@/plan/types'
import { isAmountKey } from '@/testkit/leaks'
import { routingCase } from '@/testkit/routing'
import { leakSample, personaCtx, personaOf, sampleCtx, withoutRequest } from '@/testkit/sample'
import { ROUNDED_DRAFT_NOTE } from './gapAfter'
import { emptyForm, type NewRequestForm, newRequestPreview, requestsNewOf } from './new'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const FREEZE_NOTICE =
  'Hiring is frozen for Corporate from 1 Aug 2026. You can still submit an exception with a business reason.'

/** Every key and string of a value, for the Manager mode amount checks. */
function walk(v: unknown, out: { keys: string[]; texts: string[] } = { keys: [], texts: [] }, key = '') {
  if (v === undefined || typeof v === 'function') return out
  if (key) out.keys.push(key)
  if (typeof v === 'string') out.texts.push(v)
  else if (Array.isArray(v)) for (const x of v) walk(x, out)
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, out, k)
  return out
}

/** A New role form under a manager seat. */
const newRole = (managerPositionId: string, over: Partial<NewRequestForm> = {}): NewRequestForm => ({
  ...emptyForm('New role'),
  managerPositionId,
  level: 'P3',
  location: 'San Jose',
  fte: 1,
  startDate: '2027-01-04',
  reasonCode: 'Growth',
  ...over,
})

const stepsOf = (steps: readonly Pick<Step, 'role' | 'approverId'>[]) =>
  steps.map((x) => `${x.role} ${x.approverId}`)
const idOf = (text: string): string => requestIdInText(text) ?? ''

/** The chain a preview shows, as role and approver name, against the steps a request stores. */
function sameChain(
  ctx: AnalyticsContext,
  previewSteps: readonly { role: string; approverName: string | null }[],
  req: HcRequest,
) {
  const names = new Map(ctx.all.workers.map((w) => [w.employeeId, w.name]))
  expect(previewSteps.map((x) => `${x.role} ${x.approverName}`)).toEqual(
    req.steps.map((x) => `${x.role} ${names.get(x.approverId) ?? null}`),
  )
}

describe('the New tab’s model in every mode', () => {
  it('is null where the tab is hidden (Finance), and lists every type with its decision elsewhere', () => {
    for (const mode of MODES) {
      const m = requestsNewOf(sampleCtx(mode))
      if (mode === 'finance') {
        expect(m).toBeNull()
        continue
      }
      expect(m, mode).not.toBeNull()
      expect(m?.types.map((t) => t.type)).toEqual([...REQUEST_TYPES])
      for (const t of m?.types ?? []) {
        const first = t.type === 'Transfer' ? 'transfer.process' : t.type === 'Trade' ? 'request.trade' : null
        if (first) {
          const d = decide(mode, `action:${first}`)
          expect(t.shown, `${mode} ${t.type}`).toBe(d.access !== 'hidden')
          expect(t.why, `${mode} ${t.type}`).toBe(d.access === 'hidden' ? (d.how ?? null) : null)
        }
      }
      // Transfers are processed by HRBPs (and HR admin): hidden for Manager and Leader with the reason.
      const transfer = m?.types.find((t) => t.type === 'Transfer')
      expect(transfer?.shown, mode).toBe(mode === 'hrbp' || mode === 'hr-admin')
      if (!transfer?.shown) expect(transfer?.why).toBe('Transfers are processed by HRBPs.')
      for (const t of REQUEST_TYPES)
        expect(m?.reasons[t], `${mode} ${t}`).toEqual(
          REASON_CODES_OF[t].filter((r) => r !== 'Below the cut line'),
        )
      expect(invalidRefs(m?.seats.uses ?? [])).toEqual([])
      expect(m?.hint).toBe('Do not include pay, performance or health details.')
    }
  })

  it('offers submit on behalf to HRBP and HR admin only, and names the scope’s manager seats', () => {
    for (const mode of ['manager', 'hrbp', 'leader', 'hr-admin'] as const) {
      const m = requestsNewOf(sampleCtx(mode))
      expect(m?.onBehalf != null, mode).toBe(mode === 'hrbp' || mode === 'hr-admin')
      expect(m?.managers.length, mode).toBeGreaterThan(0)
    }
    // Manager A's own seat is a seat a new role may report to.
    const a = personaOf(s, 'manager-a')
    expect(requestsNewOf(sampleCtx('manager'))?.managers.map((x) => x.positionId)).toContain(a.positionId)
  })

  it('names an accepted-offer seat only in an Elimination, and never offers a Filled seat to a trade', () => {
    const m = requestsNewOf(sampleCtx('hr-admin'))
    const rows = m?.seats.rows ?? []
    const offers = rows.filter((r) => r.acceptedOffer)
    expect(offers.length).toBeGreaterThan(0)
    for (const r of offers) {
      expect(r.types, r.positionId).toEqual(['Elimination'])
      expect(r.tradeBlock, r.positionId).toBe(ACCEPTED_OFFER_TEXT)
    }
    const filled = rows.filter((r) => r.status === 'Filled')
    expect(filled.length).toBeGreaterThan(100)
    for (const r of filled) {
      expect(r.types, r.positionId).not.toContain('Trade')
      expect(r.tradeBlock, r.positionId).toBe(FILLED_NOT_TRADED_TEXT)
    }
    // Every seat a trade may give carries its weight in standard heads.
    for (const r of rows.filter((x) => x.types.includes('Trade')))
      expect(r.weightBp, r.positionId).not.toBeNull()
  })

  it('in Manager mode prints no amount: no amount-like key, no money and no leader threshold, model and preview', () => {
    const ctx = sampleCtx('manager')
    const m = requestsNewOf(ctx)
    const a = personaOf(s, 'manager-a')
    const give = m?.seats.rows.find((r) => r.types.includes('Trade'))
    const previews = [
      newRequestPreview(ctx, newRole(a.positionId, { level: 'M2', location: 'San Jose' })),
      newRequestPreview(ctx, {
        ...emptyForm('Trade'),
        managerPositionId: a.positionId,
        level: 'P3',
        location: 'Munich',
        startDate: '2027-01-04',
        reasonCode: 'Level mix',
        trade: {
          give: give ? [give.positionId] : [],
          creditUsedBp: 0,
          giveOrgPositionId: null,
          count: 'max',
          partTimeRest: false,
        },
      }),
    ]
    for (const p of previews) {
      // Left out as keys, not set to null (7.6: no amount-like key in a Manager-mode model).
      expect('bandEstimateUsd' in p).toBe(false)
      expect('gapAfter' in p).toBe(false)
      if (p.quote) expect('bandUsd' in p.quote).toBe(false)
    }
    // The Director new role goes to the leader; the chain says so in words, never with the threshold.
    expect(previews[0].chain?.text).toMatch(/your leader/)
    // The figure-free parts of the model and every preview: no key that names an amount carries a
    // value, and no text holds one (the seats figure is decided by its columns, as the crawl reads it).
    const { seats: _seats, ...rest } = m ?? ({} as NonNullable<typeof m>)
    const seen = walk([rest, ...previews.map((p) => ({ ...p, action: null }))])
    expect(seen.keys.filter(isAmountKey)).toEqual([])
    for (const t of seen.texts) {
      expect(hasAmount(t), t).toBe(false)
      expect(t, t).not.toMatch(/\$|250,000/)
    }
    expect(m?.seats.columns.every((c) => !c.pay && !c.cost && !c.band)).toBe(true)
  })

  it('needs the type’s fields before it offers an action, and refuses free text a manager reads with an amount', () => {
    const ctx = sampleCtx('hr-admin')
    const blank = newRequestPreview(ctx, emptyForm('New role'))
    expect(blank.action).toBeNull()
    expect(blank.missing).toEqual([
      'Pick a reason.',
      'Pick the manager the new role reports to.',
      'Pick a level and a location for the new role.',
      'Pick the proposed start.',
    ])
    const mgr = requestsNewOf(ctx)?.managers.find((x) => x.businessUnit === 'Go-to-Market')
      ?.positionId as string
    const titled = newRequestPreview(ctx, newRole(mgr, { jobTitle: 'Account Executive, 140k' }))
    expect(titled.refusal).toBe(REMOVE_AMOUNT_TEXT)
    expect(titled.saveRefusal).toBe(REMOVE_AMOUNT_TEXT)
    for (const t of ['Elimination', 'Backfill', 'Start date', 'Start recruiting'] as RequestType[])
      expect(newRequestPreview(ctx, { ...emptyForm(t), reasonCode: 'Restructure' }).missing).toContain(
        'Pick the seat.',
      )
  })

  it('shows a draft’s gap after approval in cost only in exact modes; HRBP and Leader read heads and the band estimate apart', () => {
    // Rounded modes: the rounded gap less the draft's exact band effect is no whole rounding step
    // (7.3 (c)), so the cost reads on Targets and the band estimate beside the draft (integration).
    for (const key of ['hrbp-se', 'leader-svp-se'] as const) {
      const ctx = personaCtx(key)
      const mgr = requestsNewOf(ctx)?.managers[0]?.positionId as string
      const preview = newRequestPreview(ctx, newRole(mgr, { location: 'Bengaluru' }))
      expect(preview.gapAfter?.heads, key).not.toBeNull()
      expect(preview.gapAfter?.cost, key).toBeNull()
      expect(preview.gapAfter?.note, key).toBe(ROUNDED_DRAFT_NOTE)
      expect(preview.bandEstimateUsd, key).toBeGreaterThan(0)
    }
    // Control: HR admin reads the one figure, the gap less the draft's band effect.
    const ctx = sampleCtx('hr-admin')
    const mgr = requestsNewOf(ctx)?.managers.find((x) => x.businessUnit === 'Silicon Engineering')
      ?.positionId as string
    const admin = newRequestPreview(ctx, newRole(mgr, { location: 'Bengaluru' }))
    expect(typeof admin.gapAfter?.cost).toBe('number')
    expect(admin.gapAfter?.note ?? null).not.toBe(ROUNDED_DRAFT_NOTE)
  })

  it('shows the freeze notice in a frozen org, refuses submit without the exception, and adds Finance with one', () => {
    const ctx = sampleCtx('hr-admin')
    const corp = requestsNewOf(ctx)?.managers.find((x) => x.businessUnit === 'Corporate')
      ?.positionId as string
    expect(corp).toBeTruthy()
    const plain = newRequestPreview(ctx, newRole(corp))
    expect(plain.freeze).toBe(FREEZE_NOTICE)
    expect(plain.refusal).toBe(FREEZE_NOTICE)
    expect(plain.action).not.toBeNull()
    expect(plain.saveRefusal).toBeNull()
    expect(plain.freezeId).toBe('FRZ-001')
    const amount = newRequestPreview(ctx, newRole(corp, { exceptionReason: 'Needs above €140,000' }))
    expect(amount.refusal).toBe(REMOVE_AMOUNT_TEXT)
    const ok = newRequestPreview(ctx, newRole(corp, { exceptionReason: 'The audit close needs this seat' }))
    expect(ok.refusal).toBeNull()
    expect(ok.chain?.steps.at(-1)?.role).toBe('finance')
    expect(ok.chain?.steps.at(-1)?.reasons).toContain('a freeze exception')
    expect(ok.chain?.text).toMatch(/a freeze exception/)
  })
})

describe('the chain preview is the chain submit stores', () => {
  let sc: Scenario
  beforeAll(() => {
    sc = scenario()
  }, 120_000)

  /** Previews a form as a person, then saves and submits it through the write path. */
  async function walkForm(who: Who, form: NewRequestForm, onBehalf?: string) {
    const ctx = await sc.ctx(who)
    const p = newRequestPreview(ctx, { ...form, onBehalfOf: onBehalf ?? null })
    expect(p.refusal, p.refusal ?? '').toBeNull()
    expect(p.action).not.toBeNull()
    const draft = await sc.run(who, p.action?.name as never, p.action?.input as never)
    expect(draft.outcome.ok, draft.outcome.ok ? '' : draft.outcome.refused).toBe(true)
    const id = idOf(draft.outcome.ok ? draft.outcome.notice : '')
    if (p.freezeId && form.exceptionReason.trim()) {
      const ex = await sc.run(who, 'setFreezeException', {
        requestId: id,
        freezeId: p.freezeId,
        reason: form.exceptionReason,
      })
      expect(ex.outcome.ok).toBe(true)
    }
    const sub = onBehalf
      ? await sc.run(who, 'submitOnBehalf', { requestId: id, requesterId: onBehalf })
      : await sc.run(who, 'submitRequest', { requestId: id })
    expect(sub.outcome.ok, sub.outcome.ok ? '' : sub.outcome.refused).toBe(true)
    for (const e of [...draft.entries, ...sub.entries]) expect(e.by).toBe(who.personId)
    const req = (await sc.request(id)) as HcRequest
    sameChain(ctx, p.chain?.steps ?? [], req)
    expect(chainOk(await sc.log())).toBe(true)
    return { p, req }
  }

  it('for Manager A’s New role (no amount, the leader step in words)', async () => {
    const a = personaOf(s, 'manager-a')
    const { p, req } = await walkForm({ mode: 'manager', personId: a.employeeId }, newRole(a.positionId))
    expect(stepsOf(req.steps).length).toBe(p.chain?.steps.length)
    expect(p.chain?.text).toMatch(/^Goes to: /)
  }, 120_000)

  it('for an HRBP’s submit on behalf of a manager (both recorded), and for a trade', async () => {
    const hrbp = personaOf(s, 'hrbp-se')
    const who: Who = { mode: 'hrbp', personId: hrbp.employeeId, unit: 'Silicon Engineering' }
    const ctx = await sc.ctx(who)
    const m = requestsNewOf(ctx)
    const target = m?.onBehalf?.find((x) => x.personId !== hrbp.employeeId) as { personId: string }
    const seat = m?.managers.find((x) =>
      x.label.endsWith(m?.onBehalf?.find((o) => o.personId === target.personId)?.name ?? '?'),
    )
    const mgr = seat?.positionId ?? (m?.managers[1]?.positionId as string)
    const { req } = await walkForm(who, newRole(mgr, { level: 'P4' }), target.personId)
    expect(req.requesterId).toBe(target.personId)
    expect(req.submittedById).toBe(hrbp.employeeId)

    const give = m?.seats.rows.find(
      (r) => r.types.includes('Trade') && !r.tradeBlock && r.status === 'Planned',
    )
    expect(give).toBeTruthy()
    const trade: NewRequestForm = {
      ...emptyForm('Trade'),
      managerPositionId: give?.managerPositionId ?? null,
      level: 'P3',
      location: 'Bengaluru',
      startDate: '2027-01-04',
      reasonCode: 'Location strategy',
      trade: {
        give: [give?.positionId as string],
        creditUsedBp: 0,
        giveOrgPositionId: null,
        count: 'max',
        partTimeRest: false,
      },
    }
    const t = await walkForm(who, trade)
    expect(t.p.quote?.ok).toBe(true)
    expect(t.p.quote?.lines[0]).toMatch(/^Give 1 /)
    expect(t.req.trade?.getBp).toBe(t.p.quote?.getBp)
  }, 180_000)

  it('for a freeze exception: the Finance step the preview names is stored', async () => {
    const hr: Who = { mode: 'hrbp', personId: 'E10317', unit: 'Corporate' }
    const ctx = await sc.ctx(hr)
    const corp = requestsNewOf(ctx)?.managers.find((x) => x.businessUnit === 'Corporate')
      ?.positionId as string
    const { req } = await walkForm(
      hr,
      newRole(corp, { exceptionReason: 'The audit close needs this seat filled' }),
    )
    expect(req.exception?.freezeId).toBe('FRZ-001')
    expect(req.steps.at(-1)).toMatchObject({ role: 'finance' })
    expect(req.steps.at(-1)?.reasons).toContain('freeze-exception')
  }, 120_000)

  it('for Manager C and the manager below, the same with and without the confidential Elimination (16.1 (a))', async () => {
    const k = routingCase(s, s, withoutRequest(s, s.planted.managerCElimination).sample)
    const seen: Record<'with' | 'without', string[]> = { with: [], without: [] }
    for (const [key, x] of [
      ['with', k.withIt],
      ['without', k.without],
    ] as const) {
      const run = scenario({ sample: x })
      for (const [person, seat] of [
        [k.c.employeeId, k.c.positionId],
        [k.below.personId, k.below.seat],
      ] as const) {
        const who: Who = { mode: 'manager', personId: person }
        const ctx = await run.ctx(who)
        const form = newRole(seat, { startDate: '2026-12-01' })
        const p = newRequestPreview(ctx, form)
        expect(p.refusal, p.refusal ?? '').toBeNull()
        const d = await run.run(who, 'createRequest', p.action?.input as never)
        const id = idOf(d.outcome.ok ? d.outcome.notice : '')
        expect((await run.run(who, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
        const req = (await run.request(id)) as HcRequest
        sameChain(ctx, p.chain?.steps ?? [], req)
        seen[key].push(`${p.chain?.text} | ${stepsOf(req.steps).join(', ')}`)
        // Manager mode: the chain preview names no amount and none of the Elimination.
        expect(JSON.stringify(p)).not.toContain(s.planted.managerCElimination)
      }
    }
    expect(seen.with).toEqual(seen.without)
    for (const line of seen.with) expect(line).toMatch(/your leader/)
  }, 300_000)
})
