/**
 * Control totals per mode (docs/PLAN.md 14.1 item 4): Finance and HR admin state Σ heads, Σ FTE, Σ
 * USD per component, the loaded total and the suppressed cells from the exported rows; HRBP and
 * Leader state Σ heads, Σ FTE and the screen's rounded loaded total (`sumRounded`, handed in), never
 * a sum of rounded rows and no per-component totals; Manager states Σ heads and Σ FTE only. No control
 * total isolates a hidden component.
 */
import { describe, expect, it } from 'vitest'
import { sumRounded } from '@/lib/costRounding'
import { amountsIn } from '@/testkit/leaks'
import {
  ALL_UNITS_LABEL,
  addsToLoaded,
  CONTROL_TOTAL_COLUMNS,
  centsAddingTo,
  componentSplitLine,
  controlTotalColumns,
  controlTotalLines,
  controlTotalRows,
  controlTotals,
  SPLIT_WORDS,
} from './controlTotals'
import {
  LOADED_COMPONENTS,
  type LongComponent,
  type LongHeadsRow,
  type LongRow,
  ROUNDED_HEADS_REASON,
} from './longCsv'

const FACTS = {
  version: 'FY27 Working',
  lockHash: 'Working, not locked',
  asOf: '2026-09-30',
  proration: 'Daily',
}
const row = (patch: Partial<LongRow>): LongRow => ({
  ...FACTS,
  period: 'FY',
  org: 'Silicon Engineering',
  costCenter: '1110-SJC',
  account: '',
  component: 'loaded',
  currency: 'USD',
  amountLocal: null,
  rate: null,
  amountUsd: 0,
  heads: null,
  fte: null,
  suppressed: '',
  suppressedReason: '',
  rateSet: 'Plan rates (EUR 1.08)',
  ...patch,
})

/** A split cell: one row per component, heads and FTE on the first row only. */
function splitCell(
  period: string,
  costCenter: string,
  heads: number,
  fte: number,
  amounts: Partial<Record<LongComponent, number>>,
): LongRow[] {
  return Object.entries(amounts).map(([component, amountUsd], i) =>
    row({
      period,
      costCenter,
      component: component as LongComponent,
      account: '6000',
      amountUsd,
      heads: i === 0 ? heads : null,
      fte: i === 0 ? fte : null,
    }),
  )
}

describe('exact modes (Finance, HR admin)', () => {
  // October: 1110-SJC split by component (with equity apart), 1150-SJC loaded only (a component under
  // 5 contributing positions: its one hire's sign-on and relocation), Other (6) loaded, a hidden cell.
  const SIGN_ON = 40_000
  const RELOCATION = 25_000
  const hiddenCellLoaded = 310_000 + SIGN_ON + RELOCATION
  const rows: LongRow[] = [
    ...splitCell('2026-10', '1110-SJC', 20, 19.5, {
      base: 300_000,
      bonus: 30_000,
      burden: 45_000,
      benefits: 20_000,
      oneTime: 0,
      vacancy: 0,
      equity: 12_000,
    }),
    row({
      period: '2026-10',
      costCenter: '1150-SJC',
      amountUsd: hiddenCellLoaded,
      heads: 21,
      fte: 21,
      suppressedReason: 'Components hidden (fewer than 5 in a component)',
    }),
    row({
      period: '2026-10',
      org: 'Silicon Engineering',
      costCenter: '',
      amountUsd: 98_765.43,
      heads: 6,
      fte: 5.5,
    }),
    row({
      period: '2026-10',
      costCenter: '1180-HSZ',
      amountUsd: null,
      heads: 3,
      fte: 3,
      suppressed: 'Yes',
      suppressedReason: 'Hidden to protect anonymity (n < 5)',
    }),
    ...splitCell('FY', '1110-SJC', 21, 20.25, { base: 3_600_000, bonus: 360_000 }),
  ]

  it('sums heads, FTE, USD per component and the loaded total per period, in the rows order', () => {
    const [oct, fy] = controlTotals({ rows, mode: 'exact' })
    expect(oct.period).toBe('2026-10')
    expect(oct.heads).toBe(20 + 21 + 6 + 3)
    expect(oct.fte).toBe(19.5 + 21 + 5.5 + 3)
    expect(oct.usdByComponent).toEqual({
      base: 300_000,
      bonus: 30_000,
      burden: 45_000,
      benefits: 20_000,
      oneTime: 0,
      vacancy: 0,
      equity: 12_000,
      loaded: hiddenCellLoaded + 98_765.43,
    })
    // Loaded: the loaded rows and the loaded components; equity ("incl. SBC") apart.
    expect(oct.loadedUsd).toBeCloseTo(395_000 + hiddenCellLoaded + 98_765.43, 2)
    expect(oct.suppressedCells).toBe(1)
    expect(fy).toMatchObject({
      period: 'FY',
      heads: 21,
      fte: 20.25,
      loadedUsd: 3_960_000,
      suppressedCells: 0,
    })
    expect(controlTotals({ rows, mode: 'open' })).toEqual(controlTotals({ rows, mode: 'exact' }))
  })

  it('leaves no hidden component to read: no total, or total minus the shown components, is one', () => {
    const [oct] = controlTotals({ rows, mode: 'exact' })
    const components = Object.entries(oct.usdByComponent ?? {})
      .filter(([c]) => c !== 'loaded' && c !== 'equity')
      .reduce((s, [, v]) => s + (v ?? 0), 0)
    const residue = (oct.loadedUsd ?? 0) - components
    // What is left over is whole loaded cells (the components-hidden cell and Other), never a component.
    expect(residue).toBeCloseTo(hiddenCellLoaded + 98_765.43, 2)
    const values = [...Object.values(oct.usdByComponent ?? {}), oct.loadedUsd, residue]
    for (const hidden of [SIGN_ON, RELOCATION, SIGN_ON + RELOCATION])
      expect(values.some((v) => v !== null && v !== undefined && Math.abs(v - hidden) < 0.5)).toBe(false)
  })

  it('keeps sums to the cent, whatever the float noise', () => {
    const noisy = Array.from({ length: 10 }, () => row({ amountUsd: 0.1, heads: 0.1, fte: 0.1 }))
    const [t] = controlTotals({ rows: noisy, mode: 'exact' })
    expect(t.loadedUsd).toBe(1)
    expect(t.heads).toBe(1)
    expect(t.fte).toBe(1)
  })

  it('adds every component but equity to loaded, as LOADED_COMPONENTS says', () => {
    for (const c of LOADED_COMPONENTS) expect(addsToLoaded(c), c).toBe(true)
    expect(addsToLoaded('loaded')).toBe(true)
    expect(addsToLoaded('equity')).toBe(false)
  })
})

describe('rounded modes (HRBP, Leader)', () => {
  // Atoms rounded down on their own; the rows are unions of atoms at QTD, YTD and FY.
  const atoms = [33_100_000, 25_400_000, 32_500_000]
  const total = sumRounded(atoms)
  const rows: LongRow[] = [
    row({ period: 'FY', org: 'Architecture', costCenter: '', amountUsd: 33_100_000, heads: 178, fte: 171 }),
    row({
      period: 'FY',
      org: 'Design Verification',
      costCenter: '',
      amountUsd: 25_400_000,
      heads: 214,
      fte: 203,
    }),
    row({
      period: 'FY',
      org: 'Physical Design',
      costCenter: '',
      amountUsd: 32_500_000,
      heads: 195,
      fte: 184,
    }),
    row({
      period: '2026-10',
      org: 'Silicon Engineering',
      costCenter: '1110-SJC',
      amountUsd: null,
      heads: 587,
      fte: 558,
      suppressed: 'Yes',
      suppressedReason: ROUNDED_HEADS_REASON,
    }),
  ]

  it("states the screen's rounded total, never a sum of the rows, and no per-component totals", () => {
    const roundedLoaded = new Map<string, number | null>([
      ['FY', total],
      ['2026-10', null],
    ])
    const [fy, oct] = controlTotals({ rows, mode: 'rounded', roundedLoaded })
    expect(fy.loadedUsd).toBe(total)
    expect(fy).toMatchObject({ heads: 587, fte: 558, usdByComponent: null, suppressedCells: 0 })
    // Not vacuous: the screen's total is not the sum of the rounded rows.
    expect(total).not.toBe(atoms.reduce((s, a) => s + a, 0))
    expect(oct).toMatchObject({ loadedUsd: null, usdByComponent: null, suppressedCells: 1 })
    // Without the screen's total there is none: never a sum of rows instead.
    expect(controlTotals({ rows, mode: 'rounded' })[0].loadedUsd).toBeNull()
  })
})

describe('Manager mode', () => {
  const rows: LongHeadsRow[] = [
    { ...FACTS, period: 'FY', org: "Priya Raman's team", costCenter: '', heads: 9, fte: 8.5 },
    { ...FACTS, period: 'FY', org: "Priya Raman's team", costCenter: '', heads: 1, fte: 0.5 },
    { ...FACTS, period: 'YTD', org: "Priya Raman's team", costCenter: '', heads: 7, fte: 7 },
  ]

  it('states heads and FTE only', () => {
    const totals = controlTotals({ rows, mode: 'none' })
    expect(totals).toEqual([
      { period: 'FY', heads: 10, fte: 9, usdByComponent: null, loadedUsd: null, suppressedCells: 0 },
      { period: 'YTD', heads: 7, fte: 7, usdByComponent: null, loadedUsd: null, suppressedCells: 0 },
    ])
    // Amount rows handed in by mistake add no amount.
    const leaky = [...rows, row({ period: 'FY', amountUsd: 1_200_000, heads: 0, fte: 0 })]
    expect(controlTotals({ rows: leaky, mode: 'none' })[0]).toMatchObject({
      loadedUsd: null,
      usdByComponent: null,
    })
    const lines = controlTotalLines(totals, 'none')
    expect(lines).toEqual(['Control totals FY: 10 heads, 9 FTE', 'Control totals YTD: 7 heads, 7 FTE'])
    expect(lines.flatMap((l) => amountsIn(l))).toEqual([])
    // As a table: no amount key at all.
    for (const r of controlTotalRows(totals, 'none')) expect(Object.keys(r)).not.toContain('loadedUsd')
  })
})

describe('the lines and the table', () => {
  it('words one line per period', () => {
    expect(
      controlTotalLines(
        [
          {
            period: 'FY',
            heads: 1612,
            fte: 1598.4,
            usdByComponent: {},
            loadedUsd: 312_400_000,
            suppressedCells: 14,
          },
          { period: '2026-10', heads: 1, fte: 1, usdByComponent: null, loadedUsd: null, suppressedCells: 1 },
        ],
        'exact',
      ),
    ).toEqual([
      'Control totals FY: 1,612 heads, 1,598.4 FTE, loaded 312,400,000.00 USD, 14 suppressed cells',
      // Plain counts: one head (R86, M4 review CP-5).
      'Control totals 2026-10: 1 head, 1 FTE, 1 suppressed cell',
    ])
    expect(
      controlTotalLines(
        [{ period: 'FY', heads: 1, fte: 1, usdByComponent: null, loadedUsd: null, suppressedCells: 0 }],
        'none',
      ),
    ).toEqual(['Control totals FY: 1 head, 1 FTE'])
  })

  it('writes the table with the amount column flagged as a cost total', () => {
    expect(CONTROL_TOTAL_COLUMNS.map((c) => c.key)).toEqual([
      'period',
      'heads',
      'fte',
      'loadedUsd',
      'suppressedCells',
    ])
    expect(CONTROL_TOTAL_COLUMNS.find((c) => c.key === 'loadedUsd')?.cost).toBe(true)
    expect(
      controlTotalRows(
        [{ period: 'FY', heads: 3, fte: 2.5, usdByComponent: null, loadedUsd: 900_000, suppressedCells: 2 }],
        'rounded',
      ),
    ).toEqual([{ period: 'FY', heads: 3, fte: 2.5, loadedUsd: 900_000, suppressedCells: 2 }])
  })
})

describe('a split line adds up as written (M4 recheck SB-1-a)', () => {
  const cents = (line: string) =>
    [...line.matchAll(/(-?[\d,]+\.\d{2}) USD/g)].map((x) => Math.round(Number(x[1].replace(/,/g, '')) * 100))

  it('writes the loaded components in whole cents that add to the loaded total, equity apart', () => {
    // Three thirds of a dollar: each rounds to 0.33, so written one by one they add to 0.99.
    const line = componentSplitLine('FY', {
      org: '',
      label: 'Whole company',
      usdByComponent: {
        base: 1 / 3,
        bonus: 1 / 3,
        burden: 1 / 3,
        benefits: 0,
        oneTime: 0,
        vacancy: 0,
        equity: 0.555,
      },
      loadedUsd: 1,
    })
    const c = cents(line)
    // base, bonus, burden, benefits, one-time, vacancy allowance, equity, loaded.
    expect(c.length).toBe(8)
    expect(c[7]).toBe(100)
    expect(c.slice(0, 6).reduce((a, x) => a + x, 0)).toBe(100)
    expect(c.slice(0, 3).sort()).toEqual([33, 33, 34])
    // A zero stays zero; equity is written on its own, to the nearest cent.
    expect(c.slice(3, 6)).toEqual([0, 0, 0])
    expect(c[6]).toBe(56)
  })

  it('moves a part by at most a cent, the one its rounding left furthest off first', () => {
    // Operations, April 2026 (the attacker's line): written one by one the parts add to a cent over.
    expect(centsAddingTo([1641345.754, 200805.834, 154563.084, 126526.666, 0, 0], 2123241.32)).toEqual([
      164134575, 20080583, 15456308, 12652666, 0, 0,
    ])
    expect(centsAddingTo([-0.336, -0.336, -0.338], -1.01)).toEqual([-33, -34, -34])
    // Parts that already add up are each to the nearest cent.
    expect(centsAddingTo([0.25, 0.5, 0.25], 1)).toEqual([25, 50, 25])
  })
})

describe('the split by component of the scope and each unit (M4 review SB-1; C33 (b))', () => {
  const ALL: Partial<Record<LongComponent, number>> = {
    base: 300_000,
    bonus: 30_000,
    burden: 45_000,
    benefits: 20_000,
    oneTime: 5_000,
    vacancy: -9_000,
    equity: 12_000,
  }
  const at = (org: string, rows: LongRow[]) => rows.map((r) => ({ ...r, org }))

  it('HR admin with the switch on: every cell split, so the scope and each unit state theirs', () => {
    const rows = [
      ...at('Silicon Engineering', splitCell('FY', '1110-SJC', 20, 20, ALL)),
      ...at('Silicon Engineering', splitCell('FY', '1520-RDU', 1, 1, { base: 159_000, bonus: 15_900 })),
      ...at('Operations', splitCell('FY', '1710-AUS', 8, 8, { base: 900_000, benefits: 40_000 })),
    ]
    const [fy] = controlTotals({ rows, mode: 'open', scopeLabel: 'Whole company' })
    expect(fy.components).toEqual([
      {
        org: '',
        label: 'Whole company',
        usdByComponent: {
          base: 1_359_000,
          bonus: 45_900,
          burden: 45_000,
          benefits: 60_000,
          oneTime: 5_000,
          vacancy: -9_000,
          equity: 12_000,
        },
        loadedUsd: 1_505_900,
      },
      {
        org: 'Silicon Engineering',
        label: 'Silicon Engineering',
        usdByComponent: {
          base: 459_000,
          bonus: 45_900,
          burden: 45_000,
          benefits: 20_000,
          oneTime: 5_000,
          vacancy: -9_000,
          equity: 12_000,
        },
        loadedUsd: 565_900,
      },
      {
        org: 'Operations',
        label: 'Operations',
        // A component the rows do not hold is 0; equity only where held.
        usdByComponent: { base: 900_000, bonus: 0, burden: 0, benefits: 40_000, oneTime: 0, vacancy: 0 },
        loadedUsd: 940_000,
      },
    ])
    // The scope's split adds up to the period's loaded total.
    expect(fy.components?.[0].loadedUsd).toBe(fy.loadedUsd)
    const lines = controlTotalLines([fy], 'open')
    expect(lines).toEqual([
      'Control totals FY: 29 heads, 29 FTE, loaded 1,505,900.00 USD, 0 suppressed cells',
      'Control totals FY, Whole company, by component: base 1,359,000.00 USD, bonus 45,900.00 USD, burden 45,000.00 USD, benefits 60,000.00 USD, one-time 5,000.00 USD, vacancy allowance -9,000.00 USD, equity (SBC) 12,000.00 USD, loaded 1,505,900.00 USD',
      'Control totals FY, Silicon Engineering, by component: base 459,000.00 USD, bonus 45,900.00 USD, burden 45,000.00 USD, benefits 20,000.00 USD, one-time 5,000.00 USD, vacancy allowance -9,000.00 USD, equity (SBC) 12,000.00 USD, loaded 565,900.00 USD',
      'Control totals FY, Operations, by component: base 900,000.00 USD, bonus 0.00 USD, burden 0.00 USD, benefits 40,000.00 USD, one-time 0.00 USD, vacancy allowance 0.00 USD, loaded 940,000.00 USD',
    ])
    // A slide states the scope's split only.
    expect(controlTotalLines([fy], 'open', { components: 'scope' })).toEqual(lines.slice(0, 2))
    expect(controlTotalLines([fy], 'open', { components: 'none' })).toEqual(lines.slice(0, 1))
    // The words are Finance's component control totals' (one-time, vacancy allowance), in file order.
    expect(Object.keys(SPLIT_WORDS)).toEqual([...LOADED_COMPONENTS, 'equity'])
    // The table: one cost column per component of the scope's split.
    const cols = controlTotalColumns([fy], 'open')
    expect(cols.slice(0, CONTROL_TOTAL_COLUMNS.length)).toEqual(CONTROL_TOTAL_COLUMNS)
    expect(cols.slice(CONTROL_TOTAL_COLUMNS.length).map((c) => [c.key, c.label, c.cost])).toEqual([
      ['baseUsd', 'Base (USD)', true],
      ['bonusUsd', 'Bonus (USD)', true],
      ['burdenUsd', 'Burden (USD)', true],
      ['benefitsUsd', 'Benefits (USD)', true],
      ['oneTimeUsd', 'One-time (USD)', true],
      ['vacancyUsd', 'Vacancy allowance (USD)', true],
      ['equityUsd', 'Equity, SBC (USD)', true],
    ])
    expect(controlTotalRows([fy], 'open')[0]).toMatchObject({ loadedUsd: 1_505_900, baseUsd: 1_359_000 })
    // Rounded and Manager tables never gain a component column.
    expect(controlTotalColumns([fy], 'rounded')).toBe(CONTROL_TOTAL_COLUMNS)
    expect(controlTotalColumns([fy], 'none')).toBe(CONTROL_TOTAL_COLUMNS)
  })

  it('names the scope by the one unit the rows hold, else every unit in the file', () => {
    const one = at('Operations', splitCell('FY', '1710-AUS', 8, 8, { base: 900_000, benefits: 40_000 }))
    const [fy] = controlTotals({ rows: one, mode: 'open' })
    // One unit: its split is the scope's, stated once.
    expect(fy.components?.map((c) => [c.org, c.label])).toEqual([['', 'Operations']])
    const two = [...one, ...at('Corporate', splitCell('FY', '1550-HSZ', 3, 3, { base: 400_000 }))]
    expect(controlTotals({ rows: two, mode: 'open' })[0].components?.[0].label).toBe(ALL_UNITS_LABEL)
    expect(ALL_UNITS_LABEL).toBe('Every unit in this file')
  })

  it('Finance: loaded rows per cost center give no split (its unit and company splits come from the screen)', () => {
    const rows = [
      row({ period: 'FY', costCenter: '1110-SJC', amountUsd: 1_000_000, heads: 9, fte: 9 }),
      row({ period: 'FY', costCenter: 'Other (2)', amountUsd: 250_000.5, heads: 6, fte: 6 }),
      ...at('Operations', [
        row({ period: 'FY', costCenter: '1710-AUS', amountUsd: 500_000, heads: 7, fte: 7 }),
      ]),
    ]
    const [fy] = controlTotals({ rows, mode: 'exact' })
    expect(fy.components).toBeUndefined()
    expect(fy.usdByComponent).toEqual({ loaded: 1_750_000.5 })
    expect(controlTotalLines([fy], 'exact')).toHaveLength(1)
  })

  it('states no split where a cell is hidden or loaded only: no component reads out of a total', () => {
    const SIGN_ON = 40_000
    // HR admin, switch on: one unit holds a loaded-only cell (a component under 5), another is split.
    const mixed = [
      ...at('Silicon Engineering', splitCell('FY', '1110-SJC', 20, 20, { base: 300_000, bonus: 30_000 })),
      row({ period: 'FY', costCenter: '1150-SJC', amountUsd: 310_000 + SIGN_ON, heads: 21, fte: 21 }),
      ...at('Operations', splitCell('FY', '1710-AUS', 8, 8, { base: 900_000, oneTime: 7_000 })),
    ]
    const [fy] = controlTotals({ rows: mixed, mode: 'open' })
    // Silicon Engineering and the scope hold a loaded-only cell: only Operations, wholly split, states one.
    expect(fy.components?.map((c) => c.org)).toEqual(['Operations'])
    // A hidden cell (an empty amount) splits nothing either.
    const hidden = [
      ...at('Operations', splitCell('FY', '1710-AUS', 8, 8, { base: 900_000 })),
      ...at('Operations', [
        row({ period: 'FY', costCenter: '1720-AUS', amountUsd: null, suppressed: 'Yes' }),
      ]),
    ]
    expect(controlTotals({ rows: hidden, mode: 'open' })[0].components).toBeUndefined()
    const values = (fy.components ?? []).flatMap((c) => [...Object.values(c.usdByComponent), c.loadedUsd])
    for (const v of values) expect(Math.abs(v - SIGN_ON)).toBeGreaterThan(0.5)
  })
})
