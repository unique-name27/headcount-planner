/**
 * Official lists on the generated sample (docs/PLAN.md 10.2 and 16.2). The sample company's lists,
 * built from the clean sample with its people named (each unit's HR business partner on the Units
 * list, the HR admin and Finance personas on the Roles list), check the sample the app loads: the
 * starter state and the raw extracts as imported. They leave every dataset and field at its tier,
 * find no value off an org list, and name the people the sample's approval steps go to. One
 * generated sample for the file (16.0).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { ImportIssue } from '../import/types'
import { computeQuality } from '../quality'
import { buildSampleState, type SampleState } from '../quality/seed'
import { generateSample, SAMPLE_AS_OF, type Sample } from '../sample'
import { buildMessySample, RAW_DATASETS, SAMPLE_TIERS, starterSample } from '../sample/raw'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '../schema'
import { analyzeList } from './analyze'
import { LIST_DEFS } from './defs'
import { EMPTY_LISTS } from './edit'
import { effectiveLists, type SampleSource, type SourceKinds, validationVocab } from './effective'
import { rolePeople, unitHrbps } from './roles'
import type { EffectiveLists } from './types'

/** Every dataset is the sample's. */
const ON_SAMPLE = Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample' }])) as SourceKinds

let sample: Sample
let source: SampleSource
let lists: EffectiveLists
/** What the app shows on the sample: the starter state, then the raw extracts as imported. */
let loaded: {
  name: string
  state: SampleState
  issues?: Partial<Record<DatasetKey, readonly ImportIssue[]>>
}[]

const personaId = (key: Sample['personas'][number]['key']) =>
  sample.personas.find((p) => p.key === key)!.employeeId

beforeAll(() => {
  sample = generateSample()
  const w = sample.world
  // The people the sample's lists name: the generator's unit HRBPs (its routing reads the same
  // ones) and the HR admin and Finance personas.
  source = {
    data: sample.datasets,
    people: {
      hrbp: Object.fromEntries([...w.hrbp].map(([unit, person]) => [unit, w.people[person].id])),
      roles: { 'HR admin': [personaId('hr-admin')], Finance: [personaId('finance-fpa')] },
    },
  }
  lists = effectiveLists(EMPTY_LISTS, sample.datasets, ON_SAMPLE, source)
  const starter = starterSample(sample.datasets)
  const messy = buildMessySample(sample.datasets)
  loaded = [
    { name: 'starter', state: buildSampleState(sample.datasets, starter.seed, SAMPLE_AS_OF) },
    {
      name: 'imported',
      state: buildSampleState(sample.datasets, messy.seed, SAMPLE_AS_OF),
      issues: Object.fromEntries(RAW_DATASETS.map((k) => [k, messy.imports[k].result.issues])),
    },
  ]
}, 120_000)

describe('the sample company’s lists on the sample', () => {
  it('are official and check the sample', () => {
    for (const def of LIST_DEFS) {
      expect(lists[def.id].status, def.id).toBe('official')
      expect(lists[def.id].validates, def.id).toBe(true)
      if (def.kind === 'org') {
        expect(lists[def.id].source, def.id).toBe('sample')
        expect(lists[def.id].values.length, def.id).toBeGreaterThan(0)
      }
    }
  })

  it('leave every dataset and every field at its tier, with no value newly unrecognized', () => {
    const vocab = validationVocab(EMPTY_LISTS, ON_SAMPLE, source)
    // The org lists hand the quality index a list for every field they check.
    for (const def of LIST_DEFS)
      if (def.kind === 'org') for (const ref of def.refs) expect(vocab.refs.has(ref), ref).toBe(true)
    for (const { name, state, issues } of loaded) {
      const without = computeQuality(state.data, state.versions, issues, { asOf: SAMPLE_AS_OF })
      const withLists = computeQuality(state.data, state.versions, issues, { asOf: SAMPLE_AS_OF, vocab })
      expect(withLists.vocab, name).toBe(vocab)
      const tiers = Object.fromEntries(DATASET_KEYS.map((k) => [k, withLists.datasetTier(k)]))
      expect(tiers, name).toEqual(SAMPLE_TIERS)
      for (const k of DATASET_KEYS)
        for (const f of datasetDef(k).fields) {
          const ref = `${k}.${f.key}` as const
          expect(withLists.fieldTier(ref), `${name} ${ref}`).toBe(without.fieldTier(ref))
          expect(withLists.fieldStats(ref).invalid, `${name} ${ref}`).toBe(without.fieldStats(ref).invalid)
        }
    }
  })

  it('find no value in the data off an org list', () => {
    const shown = loaded.map(({ name, state }) => ({ name, data: state.data }))
    for (const { name, data } of [{ name: 'clean', data: sample.datasets }, ...shown])
      for (const def of LIST_DEFS) {
        if (def.kind !== 'org') continue
        const a = analyzeList(lists[def.id], data)
        expect(a.filled, `${name} ${def.id}`).toBeGreaterThan(0)
        expect(
          a.notOnList.map((n) => `${n.ref} ${n.value}`),
          `${name} ${def.id}`,
        ).toEqual([])
      }
  })

  it('name the HR admin and Finance personas on the Roles list, and each unit’s HR business partner', () => {
    const hrAdmin = personaId('hr-admin')
    const finance = personaId('finance-fpa')
    expect(rolePeople(lists, 'HR admin')).toEqual([hrAdmin])
    expect(rolePeople(lists, 'Finance')).toEqual([finance])
    const hrbps = unitHrbps(lists)
    expect(hrbps.get('Silicon Engineering')).toBe(personaId('hrbp-se'))
    // Every business unit on the list has its HR business partner.
    const units = lists.businessUnit.values.map((v) => v.value)
    expect([...hrbps.keys()].sort()).toEqual([...units].sort())
    // Each person the lists name holds an employee seat on the as-of date.
    const holding = new Set(
      sample.datasets.workers
        .filter(
          (r) =>
            r.workerType === 'Employee' &&
            r.positionId &&
            r.assignmentStart != null &&
            r.assignmentStart <= SAMPLE_AS_OF &&
            (r.assignmentEnd == null || r.assignmentEnd >= SAMPLE_AS_OF) &&
            (r.terminationDate == null || r.terminationDate >= SAMPLE_AS_OF),
        )
        .map((r) => r.employeeId),
    )
    for (const id of [hrAdmin, finance, ...hrbps.values()]) expect(holding.has(id), id).toBe(true)
  })

  it('name the people the sample’s approval steps go to (10.2)', () => {
    const hrbps = unitHrbps(lists)
    const unitHrbp = new Set(hrbps.values())
    const finance = new Set(rolePeople(lists, 'Finance'))
    let hrbpSteps = 0
    let financeSteps = 0
    for (const r of sample.datasets.requests) {
      const steps = r.steps ?? []
      const firstHrbp = steps.find((s) => s.role === 'HRBP')
      for (const s of steps) {
        if (s.role === 'HRBP') {
          hrbpSteps++
          expect(unitHrbp.has(s.approverId), `${r.requestId} HRBP`).toBe(true)
          // The first HRBP step is the request's own unit's (a transfer's from-unit, a trade's giving unit).
          if (s === firstHrbp && r.type !== 'Transfer' && r.type !== 'Trade')
            expect(s.approverId, `${r.requestId} HRBP`).toBe(hrbps.get(r.businessUnit))
        }
        if (s.role === 'Finance') {
          financeSteps++
          expect(finance.has(s.approverId), `${r.requestId} Finance`).toBe(true)
        }
      }
    }
    expect(hrbpSteps).toBeGreaterThan(0)
    expect(financeSteps).toBeGreaterThan(0)
  })
})
