/**
 * The FX effect tile is the bridge's own folded FX step (C33 (c); review PV-2). Before the M3 fixes
 * the tile recomputed fxEffect over the forecast side's lines against the comparison's stored rates,
 * so a plan rate for an already-closed month, stored by the next lock, moved the company tile by one
 * Corporate CAD person's May cost (the folded unit reads "—", the company less the shown units gave
 * it back) while the bridge's FX step never moved. The rate here is set by HR admin (Finance's check
 * refuses it, src/views/finance/engine/editsFx.test.ts), then Finance locks the Q2 Reforecast and
 * reads the bridge against it.
 */
import { describe, expect, it, vi } from 'vitest'
import { scenario, type Who } from '@/app/write/scenario.testkit'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { defaultPicks, personaOf, personPick, sampleCtx } from '@/testkit/sample'
import { forecastModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const cents = (v: number) => Math.round(v * 100)

async function companyFx(cadMay: number | null) {
  const sc = scenario()
  const s = sc.sample
  const finId = personaOf(s, 'finance-fpa').employeeId
  const fin: Who = { mode: 'finance', personId: finId }
  const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
  if (cadMay != null) {
    const set = await sc.run(admin, 'setFx', {
      versionId: 'fy27-working',
      rates: [{ currency: 'CAD', set: 'plan', month: '2026-05', usdPerLocal: cadMay }],
    })
    expect(set.outcome.ok).toBe(true)
  }
  const lock = await sc.run(fin, 'lockVersion', {
    workingId: 'fy27-working',
    as: { kind: 'reforecast', name: 'FY27 Q2 Reforecast' },
  })
  expect(lock.outcome.ok).toBe(true)
  const ctx = sampleCtx('finance', {
    sample: { ...s, plan: await sc.plan() },
    audit: await sc.log(),
    picks: { ...defaultPicks(s), finance: personPick(s, finId) },
    version: 'fy27-working',
    compare: 'fy27-q2-reforecast',
  })
  const m = forecastModel(ctx)
  return {
    tile: m.bridge.kpis.find((k) => k.id === 'fx-effect')?.value ?? null,
    row: m.bridge.steps.rows.find((r) => r.key === 'fx')?.value ?? null,
  }
}

describe('the FX tile reads the bridge’s folded FX step (PV-2)', () => {
  it('a closed month’s plan rate stored by a lock moves neither the tile nor the step', async () => {
    const control = await companyFx(null)
    const edited = await companyFx(1000)
    expect(control.tile).not.toBeNull()
    // One source: the tile is the step's value, to the cent.
    expect(cents(control.tile as number)).toBe(cents(control.row as number))
    expect(cents(edited.tile as number)).toBe(cents(edited.row as number))
    // Corporate's one CAD person's May cost never reaches the company tile.
    expect(cents(edited.tile as number)).toBe(cents(control.tile as number))
  }, 480_000)
})
