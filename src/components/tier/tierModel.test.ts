import { describe, expect, it } from 'vitest'
import { computeQuality } from '@/data/quality/compute'
import { emptyDatasets, req, seats } from '@/data/quality/test-fixtures'
import type { DatasetVersion, Limiting, QualityIndex } from '@/data/quality/types'
import { confirmVersion, makeVersion } from '@/data/quality/versions'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import {
  belowStandardText,
  gateFor,
  heldBack,
  hiddenFindingsText,
  joinAnd,
  noDataText,
  raiseSteps,
  raiseText,
  splitByStandard,
  subjectOf,
  type TierGate,
  tierCountParts,
  tierCounts,
  tierCountsText,
  withoutTierPrefix,
} from './tierModel'

const AS_OF = '2026-09-30'

const version = (key: DatasetKey, data: Datasets): DatasetVersion =>
  makeVersion({
    dataset: key,
    source: 'upload',
    rows: data[key] as object[],
    versionId: `${key}-v1`,
    fileName: `${key}.xlsx`,
    importedAt: '2026-09-20T09:00:00.000Z',
    mapping: {},
  })

/** Positions confirmed (silver, end date 50% filled for eliminated seats); reqs raw. */
function company() {
  let blanked = 0
  const positions = seats().map((p) =>
    p.status === 'Eliminated' && blanked++ < 5 ? { ...p, endDate: null } : p,
  )
  const data: Datasets = { ...emptyDatasets(), positions, reqs: [req(1), req(2)] }
  const versions = {
    positions: confirmVersion(version('positions', data), 'Jamie', '2026-09-25T10:00:00.000Z'),
    reqs: version('reqs', data),
  }
  return computeQuality(data, versions, undefined, { asOf: AS_OF })
}

describe('gateFor', () => {
  const q = company()

  it('names no data when there are no uses and no view datasets', () => {
    expect(gateFor(q, 'gold', undefined, [])).toBeNull()
    expect(gateFor(q, 'gold', [], [])).toBeNull()
  })

  it('shows everything at or above the standard', () => {
    expect(q.datasetTier('positions')).toBe('silver')
    const g = gateFor(q, 'silver', ['positions.status'], [])!
    expect(g).toMatchObject({ tier: 'silver', shown: true, reason: null })
    expect(g.explain).toMatch(/^Silver: Positions mapping confirmed/)
    expect(gateFor(q, 'bronze', ['reqs.status'], [])).toMatchObject({ tier: 'bronze', shown: true })
  })

  it('hides numbers below the standard and says which standard', () => {
    expect(gateFor(q, 'gold', ['positions.status'], [])).toMatchObject({
      shown: false,
      reason: 'Not yet confirmed for production',
    })
    expect(gateFor(q, 'silver', ['reqs.status'], [])).toMatchObject({
      tier: 'bronze',
      reason: 'Not yet validated',
    })
  })

  it('takes the weakest field: a capped field drops a silver dataset to bronze', () => {
    const g = gateFor(q, 'silver', ['positions.status', 'positions.endDate'], [])!
    expect(g.tier).toBe('bronze')
    expect(g.limiting.ref).toBe('positions.endDate')
    expect(g.shown).toBe(false)
  })

  it('falls back to the view datasets when a number declares no fields', () => {
    expect(gateFor(q, 'silver', undefined, ['positions'])).toMatchObject({ tier: 'silver', shown: true })
    expect(gateFor(q, 'silver', undefined, ['positions', 'reqs'])).toMatchObject({
      tier: 'bronze',
      shown: false,
    })
  })

  it('never shows no data, whatever the standard', () => {
    const g = gateFor(q, 'bronze', ['targets.targetHeads'], [])!
    expect(g.tier).toBe('none')
    expect(g.shown).toBe(false)
    expect(g.reason).toBe('No data: Targets target heads is missing')
    expect(gateFor(q, 'bronze', undefined, ['freezes'])?.reason).toBe('No data: Hiring freezes is missing')
  })
})

describe('wording', () => {
  it('uses the one phrasing for a hidden number', () => {
    expect(belowStandardText('gold')).toBe('Not yet confirmed for production')
    expect(belowStandardText('silver')).toBe('Not yet validated')
  })

  it('names the field or dataset that holds a number back', () => {
    expect(subjectOf({ dataset: 'positions', ref: 'positions.endDate' })).toBe('Positions end date')
    expect(subjectOf({ dataset: 'freezes', ref: null })).toBe('Hiring freezes')
    expect(subjectOf({ dataset: null, ref: null })).toBeNull()
    expect(noDataText({ dataset: null, ref: null })).toBe('No data: the data behind this is missing')
  })

  it('drops the tier prefix from an explanation', () => {
    expect(withoutTierPrefix('Silver: Targets mapping confirmed.')).toBe('Targets mapping confirmed.')
    expect(withoutTierPrefix('No data: x is blank.')).toBe('X is blank.')
    expect(withoutTierPrefix('Plain')).toBe('Plain')
  })

  it('joins steps in plain English', () => {
    expect(joinAnd([])).toBe('')
    expect(joinAnd(['a'])).toBe('a')
    expect(joinAnd(['a', 'b'])).toBe('a and b')
    expect(joinAnd(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('raiseSteps and heldBack', () => {
  const q = company()

  it('lists the failing rules up to the standard', () => {
    const lim: Limiting = { tier: 'bronze', dataset: 'reqs', ref: 'reqs.status' }
    expect(raiseSteps(q, lim, 'silver')).toEqual({
      room: ['review and confirm the Requisitions mapping'],
      source: [],
    })
    const gold = raiseSteps(q, lim, 'gold').room
    expect(gold[0]).toBe('review and confirm the Requisitions mapping')
    expect(gold).toContain('have the data owner certify this Requisitions version')
  })

  it('asks for the field to be filled when coverage caps it', () => {
    const lim: Limiting = { tier: 'bronze', dataset: 'positions', ref: 'positions.endDate' }
    expect(raiseSteps(q, lim, 'silver')).toEqual({
      room: [],
      source: ['fill in end date for more eliminated seats in the source data'],
    })
  })

  it('asks to load a dataset with no rows, or add a column that is missing', () => {
    expect(raiseSteps(q, { dataset: 'freezes', ref: null }, 'gold')).toEqual({
      room: ['load Hiring freezes'],
      source: [],
    })
    expect(raiseSteps(q, { dataset: null, ref: null }, 'gold')).toEqual({ room: [], source: [] })
  })

  it('words the empty state that stands in for a figure', () => {
    const g = gateFor(q, 'silver', ['reqs.status'], [])!
    const h = heldBack(g, q)
    expect(h.title).toBe('Not yet validated')
    // The whole dataset holds it back, so the dataset is named rather than one of its fields.
    expect(h.body).toBe('Held back by Requisitions, which is Bronze. Requisitions mapping not yet confirmed.')
    expect(h.raise).toBe('To raise it, review and confirm the Requisitions mapping in the Data room.')
    expect(h.dataset).toBe('reqs')
    expect(h.canPreview).toBe(true)

    const capped = heldBack(gateFor(q, 'silver', ['positions.endDate'], [])!, q)
    expect(capped.body).toBe(
      'Held back by Positions end date, which is Bronze. End date is 50% filled for eliminated seats; silver needs 95%.',
    )
    expect(capped.raise).toBe('To raise it, fill in end date for more eliminated seats in the source data.')

    const none = heldBack(gateFor(q, 'bronze', ['targets.targetHeads'], [])!, q)
    expect(none.title).toBe('No data')
    expect(none.canPreview).toBe(false)
    expect(none.raise).toBe('To raise it, load Targets in the Data room.')
  })
})

describe('raiseText where the Data room is not shown (the M2 review, UI-6)', () => {
  it('points only to pages the mode shows: HR admin does the Data room steps', () => {
    expect(raiseText({ room: ['load Targets'], source: [] }, false)).toBe(
      'To raise it, ask your HR admin to load Targets.',
    )
    expect(raiseText({ room: ['a', 'b'], source: ['fill in x in the source data'] }, false)).toBe(
      'To raise it, ask your HR admin to a and b, and fill in x in the source data.',
    )
    expect(raiseText({ room: [], source: ['fill in x in the source data'] }, false)).toBe(
      'To raise it, fill in x in the source data.',
    )
    expect(raiseText({ room: [], source: [] }, false)).toBe('')
  })

  it('words a held-back figure the same way, and never names the Data room', () => {
    const q = company()
    const none = heldBack(gateFor(q, 'bronze', ['targets.targetHeads'], [])!, q, { dataRoom: false })
    expect(none.raise).toBe('To raise it, ask your HR admin to load Targets.')
    const g = heldBack(gateFor(q, 'silver', ['reqs.status'], [])!, q, { dataRoom: false })
    expect(g.raise).toBe('To raise it, ask your HR admin to review and confirm the Requisitions mapping.')
    for (const h of [none, g]) expect(`${h.title} ${h.body} ${h.raise}`).not.toContain('Data room')
    // HR admin (the Data room shown) keeps the Data room hint.
    expect(heldBack(gateFor(q, 'bronze', ['targets.targetHeads'], [])!, q, { dataRoom: true }).raise).toBe(
      'To raise it, load Targets in the Data room.',
    )
  })
})

describe('raiseText', () => {
  it('says where each step happens', () => {
    expect(raiseText({ room: ['confirm the mapping'], source: [] })).toBe(
      'To raise it, confirm the mapping in the Data room.',
    )
    expect(raiseText({ room: ['a', 'b'], source: ['fill in x in the source data'] })).toBe(
      'To raise it, a and b in the Data room, and fill in x in the source data.',
    )
    expect(raiseText({ room: [], source: [] })).toBe('')
  })
})

describe('readout split', () => {
  const gate = (shown: boolean): TierGate => ({
    tier: shown ? 'gold' : 'bronze',
    standard: 'gold',
    limiting: { tier: 'bronze', dataset: 'positions', ref: null },
    shown,
    explain: '',
    reason: shown ? null : 'Not yet confirmed for production',
  })

  it('keeps order and treats ungated items as shown', () => {
    const items = [
      { id: 'a', g: gate(true) },
      { id: 'b', g: gate(false) },
      { id: 'c', g: null },
      { id: 'd', g: gate(false) },
    ]
    const { shown, hidden } = splitByStandard(items, (i) => i.g)
    expect(shown.map((i) => i.id)).toEqual(['a', 'c'])
    expect(hidden.map((i) => i.id)).toEqual(['b', 'd'])
  })

  it('says how many findings are hidden and why', () => {
    expect(hiddenFindingsText(3, 'gold')).toBe(
      '3 findings hidden because their data is not yet confirmed for production',
    )
    expect(hiddenFindingsText(1, 'silver')).toBe('1 finding hidden because its data is not yet validated')
    expect(hiddenFindingsText(2, 'bronze')).toBe('2 findings hidden because their data is missing')
  })
})

describe('dataset counts', () => {
  it('counts datasets per tier, highest first', () => {
    const q = company()
    const counts = tierCounts(q)
    const none = DATASET_KEYS.length - 2
    expect(counts).toEqual({ gold: 0, silver: 1, bronze: 1, none })
    expect(tierCountParts(counts).map((p) => p.text)).toEqual([
      '1 silver',
      '1 bronze',
      `${none} with no data`,
    ])
    expect(tierCountsText(counts)).toBe(`Datasets: 1 silver, 1 bronze, ${none} with no data`)
    expect(tierCountsText({ gold: 0, silver: 0, bronze: 0, none: 0 })).toBe('No datasets loaded')
  })

  it('reads only the tier of each dataset', () => {
    const fake = { datasetTier: (k: DatasetKey) => (k === 'positions' ? 'gold' : 'silver') } as Pick<
      QualityIndex,
      'datasetTier'
    >
    expect(tierCounts(fake, ['positions', 'workers', 'comp'])).toEqual({
      gold: 1,
      silver: 2,
      bronze: 0,
      none: 0,
    })
  })
})
