import { describe, expect, it } from 'vitest'
import { visibleColumns } from '@/lib/export/columns'
import type { Format } from '@/lib/format'
import { TARGET_HAS_NO_MONTHS } from '@/plan/engine/variance'
import type { AnyVersion } from '@/plan/types'
import {
  deltaDirection,
  deltaTone,
  emptyDelta,
  emptyDeltas,
  kpiColumns,
  kpiDeltaText,
  kpiRows,
  kpiValueText,
  SUPPRESSED_NOTE,
  targetComparisonEmpty,
  tileTarget,
  unitOf,
} from './kpiModel'
import type { TierGate } from './tier/tierModel'
import type { Kpi } from './types'

const kpi = (patch: Partial<Kpi>): Kpi => ({
  id: 'k',
  label: 'Time to fill',
  value: 42,
  format: 'days',
  ...patch,
})

describe('deltaTone', () => {
  it('colors a material change by whether its direction is good', () => {
    expect(deltaTone(kpi({ delta: 4, goodDirection: 'down', deltaMaterial: true }))).toBe('bad')
    expect(deltaTone(kpi({ delta: -4, goodDirection: 'down', deltaMaterial: true }))).toBe('good')
    expect(deltaTone(kpi({ delta: 0.02, goodDirection: 'up' }))).toBe('good')
  })

  it('stays neutral without a direction, when immaterial, flat, missing or suppressed', () => {
    expect(deltaTone(kpi({ delta: 4 }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: 4, goodDirection: null }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: 4, goodDirection: 'up', deltaMaterial: false }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: 0, goodDirection: 'up' }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: null, goodDirection: 'up' }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: 4, goodDirection: 'up', suppressed: true }))).toBe('neutral')
  })

  it('reads the direction of a delta', () => {
    expect(deltaDirection(3)).toBe('up')
    expect(deltaDirection(-0.1)).toBe('down')
    expect(deltaDirection(0)).toBe('flat')
    expect(deltaDirection(undefined)).toBeNull()
    expect(deltaDirection(Number.NaN)).toBeNull()
  })
})

describe('tile text', () => {
  it('formats values and deltas in the KPI unit', () => {
    expect(kpiValueText(kpi({}))).toBe('42 d')
    expect(kpiDeltaText(kpi({ delta: 4 }))).toBe('+4 d')
    expect(kpiValueText(kpi({ value: 0.142, format: 'pct' }))).toBe('14.2%')
    expect(kpiDeltaText(kpi({ value: 0.142, format: 'pct', delta: -0.012 }))).toBe('−1.2 pts')
  })

  it('shows a dash for missing or suppressed values, never 0', () => {
    expect(kpiValueText(kpi({ value: null }))).toBe('—')
    expect(kpiValueText(kpi({ value: 3, suppressed: true }))).toBe('—')
    expect(kpiDeltaText(kpi({ delta: 2, suppressed: true }))).toBeNull()
    expect(kpiDeltaText(kpi({}))).toBeNull()
  })
})

describe('kpiRows', () => {
  it('exports numbers with their unit and the change in its unit', () => {
    const rows = kpiRows([
      kpi({ delta: 4, deltaLabel: 'vs FY27 Budget', note: '24 heads, 27.40 standard heads' }),
      kpi({ id: 'r', label: 'Regretted attrition', value: null, format: 'pct', suppressed: true }),
    ])
    expect(rows[0]).toMatchObject({
      measure: 'Time to fill',
      value: 42,
      valueText: '42 d',
      unit: 'd',
      change: 4,
      changeText: '+4 d',
      changeUnit: 'd',
      comparedWith: 'vs FY27 Budget',
      note: '24 heads, 27.40 standard heads',
    })
    expect(rows[1]).toMatchObject({
      measure: 'Regretted attrition',
      value: null,
      valueText: '—',
      unit: '%',
      change: null,
      changeText: '',
      changeUnit: '',
      comparedWith: '',
      note: SUPPRESSED_NOTE,
    })
    expect(SUPPRESSED_NOTE).toBe('Hidden to protect anonymity (n < 5)')
  })

  it('keeps rates as fractions with a percent format and states their change in points', () => {
    const [row] = kpiRows([
      kpi({ value: 0.142, format: 'pct', delta: -0.012, deltaLabel: 'vs plan of record (Q1 Reforecast)' }),
    ])
    const cols = kpiColumns([kpi({ value: 0.142, format: 'pct' })])
    const fmtOf = (key: string) => cols.find((c) => c.key === key)?.format as (r: object) => Format
    expect(row).toMatchObject({ value: 0.142, unit: '%', changeUnit: 'pts', changeText: '−1.2 pts' })
    expect(row.change).toBeCloseTo(-1.2, 10)
    expect(fmtOf('value')(row)).toBe('pct')
    expect(fmtOf('change')(row)).toBe('num1')
    // Points as a value are stored as a number of points.
    const [gap] = kpiRows([kpi({ value: 0.021, format: 'pts' })])
    expect(gap.value).toBeCloseTo(2.1, 10)
    expect(gap.unit).toBe('pts')
  })

  it('writes the trend points as numbers, the latest lined up across tiles', () => {
    const kpis = [
      kpi({ spark: [40, 41, 42] }),
      kpi({ id: 'b', label: 'Open reqs', format: 'int', value: 58, spark: [32, 58] }),
      kpi({ id: 'c', label: 'Hidden', spark: [1, 2, 3], suppressed: true }),
    ]
    const cols = kpiColumns(kpis)
    const trend = cols.filter((c) => c.key.startsWith('trend'))
    expect(trend.map((c) => c.label)).toEqual([
      'Trend, 2 periods back',
      'Trend, 1 period back',
      'Trend, latest',
    ])
    expect(trend.every((c) => c.only === 'sheets')).toBe(true)
    const rows = kpiRows(kpis)
    expect(trend.map((c) => rows[0][c.key])).toEqual([40, 41, 42])
    expect(trend.map((c) => rows[1][c.key] ?? null)).toEqual([null, 32, 58])
    expect(trend.map((c) => rows[2][c.key] ?? null)).toEqual([null, null, null])
  })

  it('sends numbers and units to sheets and the tile text to slides', () => {
    const cols = kpiColumns([kpi({})], { tiered: true })
    expect(visibleColumns(cols, false, 'sheets').map((c) => c.key)).toEqual([
      'measure',
      'value',
      'unit',
      'tier',
      'change',
      'changeUnit',
      'comparedWith',
      'note',
    ])
    expect(visibleColumns(cols, false, 'slides').map((c) => c.key)).toEqual([
      'measure',
      'valueText',
      'tier',
      'changeText',
      'comparedWith',
      'note',
    ])
  })

  it('names the unit of every format', () => {
    expect(unitOf('pct')).toBe('%')
    expect(unitOf('pts2')).toBe('pts')
    expect(unitOf('days')).toBe('d')
    expect(unitOf('years')).toBe('yrs')
    expect(unitOf('int')).toBe('count')
    expect(unitOf('num1')).toBe('')
  })
})

describe('kpiRows with tiers', () => {
  const gate = (tier: TierGate['tier'], shown: boolean, reason: string | null = null): TierGate => ({
    tier,
    standard: 'gold',
    limiting: { tier, dataset: 'positions', ref: null },
    shown,
    explain: '',
    reason,
  })

  it('adds each tier and exports a hidden number blank with its reason', () => {
    const rows = kpiRows(
      [
        kpi({
          delta: 4,
          deltaLabel: 'vs FY27 Budget',
          note: '24 heads, 27.40 standard heads',
          spark: [40, 42],
        }),
        kpi({ id: 'b', label: 'Offer acceptance', delta: 0.1, spark: [40, 42] }),
        kpi({ id: 'c', label: 'Open reqs' }),
        kpi({ id: 'd', label: 'Exit reasons' }),
      ],
      [
        gate('gold', true),
        gate('silver', false, 'Not yet confirmed for production'),
        null,
        gate('none', false, 'No data: Positions end date is missing'),
      ],
    )
    expect(rows[0]).toMatchObject({
      value: 42,
      change: 4,
      tier: 'Gold',
      note: '24 heads, 27.40 standard heads',
      trend0: 42,
    })
    expect(rows[1]).toMatchObject({
      measure: 'Offer acceptance',
      value: null,
      valueText: '—',
      change: null,
      changeText: '',
      comparedWith: '',
      note: 'Not yet confirmed for production',
      tier: 'Silver',
    })
    expect(rows[1].trend0).toBeUndefined()
    expect(rows[2]).toMatchObject({ value: 42, valueText: '42 d', tier: '' })
    expect(rows[3]).toMatchObject({
      value: null,
      tier: 'No data',
      note: 'No data: Positions end date is missing',
    })
  })
})

describe('tileTarget', () => {
  const view = {
    key: 'plan' as const,
    tabs: [
      { key: 'overview', label: 'Overview' },
      { key: 'openings', label: 'Openings' },
    ],
  }

  it('opens a tab of the view showing the tile, named by its label', () => {
    expect(tileTarget(kpi({ tab: 'openings' }), view)).toEqual({
      view: 'plan',
      tab: 'openings',
      label: 'Openings',
    })
    expect(tileTarget(kpi({ tab: 'openings' }), null)).toBeNull()
    expect(tileTarget(kpi({}), view)).toBeNull()
  })

  it('opens nothing when the tile sits on the tab it would open', () => {
    expect(tileTarget(kpi({ tab: 'openings' }), { ...view, tab: 'openings' })).toBeNull()
    expect(tileTarget(kpi({ tab: 'openings' }), { ...view, tab: 'overview' })?.tab).toBe('openings')
    const link = { view: 'plan' as const, tab: 'openings', label: 'Plan, Openings' }
    expect(tileTarget(kpi({ link }), { ...view, tab: 'openings' })).toBeNull()
  })

  it('opens a tab of another view when the tile carries a link, outside a view too', () => {
    const link = { view: 'forecast' as const, tab: 'variance', label: 'Forecast, Variance' }
    expect(tileTarget(kpi({ tab: 'openings', link }), view)).toEqual(link)
    expect(tileTarget(kpi({ link: { view: 'targets', label: 'Targets' } }), null)).toEqual({
      view: 'targets',
      tab: '',
      label: 'Targets',
    })
  })
})

describe('cost tiles under the guard', () => {
  it('exports a hidden amount blank with the guard’s reason, never 0 or words', () => {
    const [row] = kpiRows([
      kpi({
        id: 'cost',
        label: 'Loaded cost YTD',
        format: 'moneyM',
        value: null,
        suppressed: true,
        suppressedNote: 'Hidden to protect anonymity (n < 5)',
        delta: 120_000,
        deltaLabel: 'vs FY27 Budget',
      }),
    ])
    expect(row).toMatchObject({
      value: null,
      valueText: '—',
      change: null,
      comparedWith: '',
      note: 'Hidden to protect anonymity (n < 5)',
      unit: 'USD',
    })
  })

  it('names the comparison of every change', () => {
    const [row] = kpiRows([kpi({ format: 'int', value: 184, delta: 8, deltaLabel: 'vs FY27 Budget' })])
    expect(row).toMatchObject({ value: 184, change: 8, changeUnit: 'count', comparedWith: 'vs FY27 Budget' })
  })
})

describe('a tile that names its comparison but has no change (PLAN 9.2, the M2 review UI-2)', () => {
  const FY27 = { kind: 'target', fiscalYear: 'FY27', label: 'FY27 target' } as const
  const FY28 = { kind: 'target', fiscalYear: 'FY28', label: 'FY28 target' } as const
  const locked = [
    { versionId: 'fy27-budget', fiscalYear: 'FY27', state: 'locked' },
  ] as unknown as AnyVersion[]

  it('says why a target comparison has no monthly figure', () => {
    expect(targetComparisonEmpty(FY27, locked)).toBe(TARGET_HAS_NO_MONTHS)
    expect(targetComparisonEmpty(FY28, locked)).toBe('FY28 has no locked version yet.')
    expect(
      targetComparisonEmpty(
        { kind: 'version', versionId: 'fy27-budget', fiscalYear: 'FY27', label: 'Budget' },
        locked,
      ),
    ).toBeNull()
  })

  it('shows the dash, the comparison and the reason in the change row', () => {
    const why = 'FY28 has no locked version yet.'
    const tile = kpi({ delta: null, deltaLabel: 'vs FY28 target' })
    expect(emptyDelta(tile, { label: 'vs FY28 target', reason: why })).toEqual({
      label: 'vs FY28 target',
      reason: why,
    })
    // The tile's own reason wins.
    expect(
      emptyDelta({ ...tile, deltaEmpty: 'Own reason.' }, { label: 'vs FY28 target', reason: why }),
    ).toEqual({
      label: 'vs FY28 target',
      reason: 'Own reason.',
    })
    // Another comparison's label, or a change card that says why itself: the dash and the label only.
    expect(
      emptyDelta(kpi({ delta: null, deltaLabel: 'vs FY27 Budget' }), {
        label: 'vs FY28 target',
        reason: why,
      }),
    ).toEqual({
      label: 'vs FY27 Budget',
      reason: null,
    })
    expect(
      emptyDelta(kpi({ delta: null, deltaLabel: 'vs FY28 target', deltaCalc: () => null as never }), {
        label: 'vs FY28 target',
        reason: why,
      }),
    ).toEqual({ label: 'vs FY28 target', reason: null })
    // A change, no comparison, or a hidden value: nothing to say.
    expect(emptyDelta(kpi({ delta: 3, deltaLabel: 'vs FY28 target' }), null)).toBeNull()
    expect(emptyDelta(kpi({ delta: null }), null)).toBeNull()
    expect(emptyDelta(kpi({ delta: null, deltaLabel: 'vs FY28 target', suppressed: true }), null)).toBeNull()
  })

  it('exports the dash, the comparison and the reason too', () => {
    const tiles = [
      kpi({ delta: null, deltaLabel: 'vs FY28 target', note: 'Apr 2027 to Mar 2028' }),
      kpi({ delta: 2, deltaLabel: 'vs FY28 target' }),
    ]
    const empties = emptyDeltas(tiles, { label: 'vs FY28 target', reason: 'FY28 has no locked version yet.' })
    const rows = kpiRows(tiles, undefined, undefined, empties)
    expect(rows[0]).toMatchObject({
      changeText: '—',
      comparedWith: 'vs FY28 target',
      note: 'Apr 2027 to Mar 2028 FY28 has no locked version yet.',
    })
    expect(rows[1]).toMatchObject({ comparedWith: 'vs FY28 target' })
  })
})
