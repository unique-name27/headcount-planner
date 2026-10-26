/**
 * The What if tour's trade anchor (docs/PLAN.md 11.5, M4 review HL-9): the lever form draws
 * [data-tour="whatif-trade"] exactly once whatever lever kind is picked, so the tour's trade step
 * always has its figure.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, sampleCtx } from '@/testkit/sample'
import { whatifModel } from '../engine'
import { LeverForm } from './LeverForm'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => {
  leakSample()
}, 120_000)

describe('the lever form', () => {
  it('draws the trade anchor once, before Trade is picked too', () => {
    const m = whatifModel(sampleCtx('hr-admin')).levers
    const html = renderToStaticMarkup(createElement(LeverForm, { m, onAdd: () => {} }))
    expect(html.match(/data-tour="whatif-trade"/g) ?? []).toHaveLength(1)
  })
})
