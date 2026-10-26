/**
 * "<tab>:<anything>" never opens another tab's body (the template app's viewTab test). For every
 * mode and every tab it shows, the address with ":x" or "/x" after the tab gives the view the same
 * tab as the bare address (so the same figures render), and the address is rewritten to the tab.
 * Only a tab with parts (Finance > Assumptions: `#finance.assumptions:trade-rates`) reads what
 * follows.
 *
 * The tabs each mode shows are read from docs/PLAN.md 8.3's grid (src/access/ids.ts `PLAN_GRID`),
 * so the test does not wait on the policy tables; `withAccessTabs` asks the same `can`.
 */
import { describe, expect, it, vi } from 'vitest'
import { PLAN_GRID } from '@/access/ids'
import { MODES, type Mode } from '@/access/modes'
import { VIEWS } from '@/views/registry'
import { withAccessTabs } from '@/views/types'
import { baseTab, viewTabOf } from './viewTab'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

/** A surface shows unless 8.3's grid hides it in the mode. */
const gridAccess = (mode: Mode) => ({
  mode,
  can: (surface: string) => {
    const letters: string | undefined = PLAN_GRID[surface]
    return letters?.[MODES.indexOf(mode)] !== 'H'
  },
})

describe('baseTab', () => {
  it('reads the tab before the first ":" or "/"', () => {
    expect(baseTab('assumptions:trade-rates')).toBe('assumptions')
    expect(baseTab('positions/x')).toBe('positions')
    expect(baseTab('overview')).toBe('overview')
    expect(baseTab('')).toBe('')
  })
})

describe('a tab with something after it', () => {
  it('shows that tab in every mode, never another, and rewrites the address', () => {
    let checked = 0
    for (const mode of MODES) {
      for (const registered of VIEWS) {
        if (!gridAccess(mode).can(`view:${registered.key}`)) continue
        const shown = withAccessTabs(registered, gridAccess(mode)).tabs
        for (const t of shown) {
          const bare = viewTabOf(shown, registered.tabs, t.key)
          expect(bare.rewrite, `${mode} ${registered.key}.${t.key}`).toBe(false)
          expect(bare.viewTab).toBe(t.key)
          for (const extra of [':x', '/x', ':', ':overview']) {
            const label = `${mode} #${registered.key}.${t.key}${extra}`
            const got = viewTabOf(shown, registered.tabs, `${t.key}${extra}`)
            expect(got.tab, label).toBe(t.key)
            if (t.parts) {
              // The tab with parts gets the whole address; "/" reads as ":".
              expect(got.viewTab, label).toBe(`${t.key}${extra.replace(/^\//, ':')}`)
              expect(got.rewrite, label).toBe(false)
            } else {
              expect(got.viewTab, label).toBe(bare.viewTab)
              expect(got.rewrite, label).toBe(true)
            }
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200)
  })

  it('keeps a part of Finance > Assumptions in the address', () => {
    const finance = VIEWS.find((v) => v.key === 'finance')
    if (!finance) throw new Error('no Finance view')
    const shown = withAccessTabs(finance, gridAccess('finance')).tabs
    expect(viewTabOf(shown, finance.tabs, 'assumptions:trade-rates')).toEqual({
      tab: 'assumptions',
      viewTab: 'assumptions:trade-rates',
      rewrite: false,
    })
  })

  it('a tab the mode hides opens the first shown tab, with the address rewritten', () => {
    // HRBP sees Finance, but not its Export tab (docs/PLAN.md 8.3).
    const finance = VIEWS.find((v) => v.key === 'finance')
    if (!finance) throw new Error('no Finance view')
    const shown = withAccessTabs(finance, gridAccess('hrbp')).tabs
    expect(shown.map((t) => t.key)).not.toContain('export')
    expect(viewTabOf(shown, finance.tabs, 'export')).toEqual({
      tab: shown[0].key,
      viewTab: shown[0].key,
      rewrite: true,
    })
    // Manager mode's Plan has no Overview: the address moves to Positions.
    const plan = VIEWS.find((v) => v.key === 'plan')
    if (!plan) throw new Error('no Plan view')
    const managerTabs = withAccessTabs(plan, gridAccess('manager')).tabs
    expect(viewTabOf(managerTabs, plan.tabs, 'overview')).toEqual({
      tab: 'positions',
      viewTab: 'positions',
      rewrite: true,
    })
    // No tab named: the first shown tab, and nothing to rewrite.
    expect(viewTabOf(managerTabs, plan.tabs, '')).toEqual({
      tab: 'positions',
      viewTab: 'positions',
      rewrite: false,
    })
  })

  it('an unknown tab shows the first tab without a rewrite loop', () => {
    const plan = VIEWS.find((v) => v.key === 'plan')
    if (!plan) throw new Error('no Plan view')
    const got = viewTabOf(plan.tabs, plan.tabs, 'nope')
    expect(got.tab).toBe('overview')
    expect(got.viewTab).toBe('overview')
  })
})
