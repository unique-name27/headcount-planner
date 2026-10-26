/**
 * Remembered mappings (docs/PLAN.md 5.4 and 16.2): a file layout's choices saved at
 * `hcp:profile:<dataset>:<fingerprint>` and learned header picks at
 * `hcp:profile:<dataset>:synonyms`, all in the app's own IndexedDB store (mocked with the
 * in-memory one), and nothing lost or thrown when storage refuses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { idbSet } from '@/data/idb'
import { failMemoryIdb, memoryIdbEntries, resetMemoryIdb } from '@/testkit/memoryIdb'
import { datasetDef } from '../schema'
import { autoMap, withChoice } from './automap'
import {
  applyProfile,
  deleteProfile,
  forgetAllProfiles,
  forgetLearnedSynonyms,
  headerFingerprint,
  learnSynonym,
  loadLearnedSynonyms,
  loadProfile,
  makeProfile,
  saveProfile,
} from './profiles'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

beforeEach(() => resetMemoryIdb())

describe('headerFingerprint', () => {
  it('ignores order, case, spacing and punctuation but not the words', () => {
    const a = headerFingerprint(['Employee ID', 'Hire Date', 'Name'])
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(headerFingerprint(['name', 'hire_date', 'EMPLOYEE  ID'])).toBe(a)
    expect(headerFingerprint(['Employee ID', 'Hire Date'])).not.toBe(a)
  })
})

describe('mapping profiles', () => {
  const def = datasetDef('workers')
  const headers = ['Worker', 'Start', 'Boss', 'Joined', 'Pay basis']

  it('round-trips your choices, date orders and value corrections through storage', async () => {
    let mapping = autoMap(headers, [], def)
    mapping = withChoice(mapping, 'employeeId', 'Worker')
    mapping = withChoice(mapping, 'hireDate', 'Joined')
    mapping = withChoice(mapping, 'managerId', 'Boss')
    mapping = withChoice(mapping, 'assignmentStart', null)
    const profile = makeProfile(
      'workers',
      headers,
      mapping,
      {
        dateOrders: { Joined: 'DMY' },
        valueMaps: { workerType: { seasonal: 'Contractor' } },
        hourlyToAnnual: { hours: 2080, basisHeader: 'Pay basis' },
      },
      '2026-10-13T09:00:00.000Z',
    )
    await saveProfile(profile)
    expect([...memoryIdbEntries().keys()]).toEqual([`hcp:profile:workers:${profile.fingerprint}`])

    // Same layout, different spelling and order: the saved choices come back.
    const again = ['joined', 'BOSS', 'worker', 'start', 'PAY BASIS']
    const loaded = await loadProfile('workers', again)
    expect(loaded).not.toBe(null)
    const { mapping: m, options } = applyProfile(loaded!, again, def)
    expect(m.employeeId).toEqual({
      header: 'worker',
      confidence: 'high',
      score: 1,
      reason: 'Saved from your last import of this layout',
    })
    expect(m.hireDate.header).toBe('joined')
    expect(m.managerId.header).toBe('BOSS')
    expect(m.assignmentStart).toMatchObject({ header: null, reason: 'Left unmapped last time' })
    // Every field the profile saved without a column reads as left unmapped, as the template does.
    expect(m.name).toMatchObject({ header: null, reason: 'Left unmapped last time' })
    expect(options.dateOrders).toEqual({ joined: 'DMY' })
    expect(options.valueMaps).toEqual({ workerType: { seasonal: 'Contractor' } })
    expect(options.hourlyToAnnual).toEqual({ hours: 2080, basisHeader: 'PAY BASIS' })

    expect(await loadProfile('positions', again)).toBe(null)
    await deleteProfile('workers', profile.fingerprint)
    expect(await loadProfile('workers', again)).toBe(null)
  })

  it('ignores corrupt stored values and a profile saved for another dataset', async () => {
    const fp = headerFingerprint(headers)
    await idbSet(`hcp:profile:workers:${fp}`, { version: 99 })
    expect(await loadProfile('workers', headers)).toBe(null)
    const comp = makeProfile('comp', headers, autoMap(headers, [], datasetDef('comp')))
    await idbSet(`hcp:profile:workers:${fp}`, comp)
    expect(await loadProfile('workers', headers)).toBe(null)
  })

  it('reads a profile whose fields name keys an object reserves as unmapped', () => {
    const profile = makeProfile('workers', headers, autoMap(headers, [], def))
    const hostile = { ...profile, fields: JSON.parse('{"__proto__": "worker", "employeeId": "worker"}') }
    const { mapping } = applyProfile(hostile, headers, def)
    expect(mapping.employeeId.header).toBe('Worker')
    expect(Object.keys(mapping).sort()).toEqual(def.fields.map((f) => f.key).sort())
  })

  it('stays quiet when storage refuses', async () => {
    failMemoryIdb()
    const profile = makeProfile('workers', headers, autoMap(headers, [], def))
    await expect(saveProfile(profile)).resolves.toBeUndefined()
    expect(await loadProfile('workers', headers)).toBe(null)
    await expect(deleteProfile('workers', profile.fingerprint)).resolves.toBeUndefined()
  })
})

describe('learned synonyms', () => {
  it('remembers header picks per dataset', async () => {
    expect(await loadLearnedSynonyms('comp')).toEqual({})
    await learnSynonym('comp', 'Annual Pay (Local)', 'baseSalary')
    await learnSynonym('comp', 'Worker #', 'employeeId')
    expect(await loadLearnedSynonyms('comp')).toEqual({
      'annual pay local': 'baseSalary',
      'worker number': 'employeeId',
    })
    expect([...memoryIdbEntries().keys()]).toEqual(['hcp:profile:comp:synonyms'])
    expect(await loadLearnedSynonyms('workers')).toEqual({})
    const m = autoMap(
      ['Worker #', 'Annual Pay (Local)', 'Effective date'],
      [],
      datasetDef('comp'),
      await loadLearnedSynonyms('comp'),
    )
    expect(m.baseSalary.reason).toBe('You chose this column before')
    await forgetLearnedSynonyms('comp')
    expect(await loadLearnedSynonyms('comp')).toEqual({})
  })

  it('keeps only text picks and works without storage', async () => {
    await idbSet('hcp:profile:comp:synonyms', { a: 'baseSalary', b: 7, c: null })
    expect(await loadLearnedSynonyms('comp')).toEqual({ a: 'baseSalary' })
    failMemoryIdb()
    await expect(learnSynonym('comp', 'x', 'baseSalary')).resolves.toBeUndefined()
    expect(await loadLearnedSynonyms('comp')).toEqual({})
  })
})

describe('forgetAllProfiles', () => {
  const save = (dataset: 'workers' | 'comp', headers: string[]) =>
    saveProfile(makeProfile(dataset, headers, autoMap(headers, [], datasetDef(dataset))))

  it('removes every saved layout and learned pick, and nothing else', async () => {
    await save('workers', ['Worker', 'Joined'])
    await save('workers', ['Employee ID', 'Hire date', 'Manager'])
    await save('comp', ['Employee ID', 'Base salary'])
    await idbSet('hcp:dataset:workers', { rows: [] })
    await learnSynonym('comp', 'Annual Pay', 'baseSalary')
    await learnSynonym('workers', 'Worker', 'employeeId')

    expect(await forgetAllProfiles()).toBe(3)
    expect([...memoryIdbEntries().keys()]).toEqual(['hcp:dataset:workers'])
    expect(await loadProfile('workers', ['Worker', 'Joined'])).toBe(null)
    expect(await loadLearnedSynonyms('comp')).toEqual({})
    expect(await forgetAllProfiles()).toBe(0)
  })

  it('can keep learned picks', async () => {
    await save('comp', ['Employee ID', 'Base salary'])
    await learnSynonym('comp', 'Annual Pay', 'baseSalary')
    expect(await forgetAllProfiles({ synonyms: false })).toBe(1)
    expect(await loadLearnedSynonyms('comp')).toEqual({ 'annual pay': 'baseSalary' })
  })

  it('works without storage', async () => {
    failMemoryIdb()
    expect(await forgetAllProfiles()).toBe(0)
  })
})
