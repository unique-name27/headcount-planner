/**
 * Official lists (docs/PLAN.md 16.2): where lists start (the sample company's, the app's own
 * vocabularies, lists proposed from your data), the status rules, validation through the quality
 * index, the templates' dropdowns, editing with exact undo, spellings that differ only in case or
 * spacing, persistence in `hcp:lists` and the settings file, and what the app reads from the lists
 * (leader levels, each unit's HR business partner, the people of each role).
 */
import { describe, expect, it } from 'vitest'
import { orgDatasets } from '@/testkit/orgFixture'
import { computeQuality } from '../quality'
import { comp, emptyDatasets, pos, request } from '../quality/test-fixtures'
import { DATASET_KEYS, type DatasetKey, type Datasets, LEVELS, REASON_CODES } from '../schema'
import { DEFAULT_SETTINGS, parseSettingsFile, settingsBlob } from '../settings'
import { analyzeList, officialParents } from './analyze'
import { listDef } from './defs'
import { applyEdit, applyEdits, canUndo, EMPTY_LISTS, MAX_LOG, undoChange } from './edit'
import {
  effectiveLists,
  officialLists,
  type SampleSource,
  type SourceKinds,
  sampleLists,
  templateLists,
  validationVocab,
} from './effective'
import { importListsSection, listsFileSection, loadLists, sanitizeListsState, saveLists } from './persist'
import { leaderLevels, rolePeople, unitHrbps } from './roles'
import { builtinValues, listFromData } from './seed'
import type { EffectiveLists, ListEdit, ListsState } from './types'

const kinds = (uploads: DatasetKey[] = []): SourceKinds =>
  Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: uploads.includes(k) ? 'upload' : 'sample' }]),
  ) as SourceKinds

const SAMPLE = kinds()
const OWN = kinds([...DATASET_KEYS])
/** The data-layer test org stands in for the generated sample company. */
const SAMPLE_CO: SampleSource = {
  data: orgDatasets(),
  people: { hrbp: { 'Silicon Engineering': 'E3' }, roles: { Finance: ['E6', 'E7'] } },
}

/** Your own seats: departments under the unit most of their rows name, one cost center each. */
function company(): Datasets {
  const d = emptyDatasets()
  d.positions = [
    pos(1, { department: 'Design Verification', businessUnit: 'Silicon Engineering', costCenter: 'CC-100' }),
    pos(2, { department: 'Design Verification', businessUnit: 'Silicon Engineering', costCenter: 'CC-100' }),
    pos(3, { department: 'Design Verification', businessUnit: 'Systems & Software', costCenter: 'CC-100' }),
    pos(4, {
      department: 'Firmware',
      businessUnit: 'Systems & Software',
      costCenter: 'CC-200',
      jobFamily: 'Systems & Software Engineering',
    }),
    pos(5, { department: 'Firmware', businessUnit: 'Systems & Software', costCenter: 'CC-200' }),
    pos(6, { department: 'Payroll', businessUnit: 'Corporate', costCenter: 'CC-300', location: 'Austin' }),
    pos(7, { department: 'DV', businessUnit: 'Silicon Engineering', costCenter: 'CC-100' }),
  ]
  // The requests are still the sample's: their "Photonics" is never proposed.
  d.requests = [request(1, { department: 'Photonics' })]
  return d
}

/** Make a change, failing the test when it is refused. */
function must(state: ListsState, eff: EffectiveLists, edit: ListEdit, now = 1_000) {
  const r = applyEdit(state, eff, edit, { now })
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('starting lists', () => {
  it('ship as official on the sample, built from the sample company', () => {
    const lists = officialLists(EMPTY_LISTS, SAMPLE, SAMPLE_CO)
    const depts = lists.department!
    expect(depts).toMatchObject({ status: 'official', source: 'sample', validates: true })
    expect(depts.values.map((v) => v.value)).toEqual([
      'Design Verification',
      'Executive Office',
      'Finance',
      'Sales',
    ])
    expect(depts.values.find((v) => v.value === 'Design Verification')).toMatchObject({
      parent: 'Silicon Engineering',
      attrs: { code: '1130' },
    })
    const units = lists.businessUnit!.values
    expect(units.map((u) => u.value)).toEqual([
      'Corporate',
      'Executive Office',
      'Go-to-Market',
      'Silicon Engineering',
    ])
    expect(units.find((u) => u.value === 'Silicon Engineering')?.attrs).toEqual({
      code: '1100',
      owner: 'Ben Cho',
      hrbp: 'E3',
    })
    // A unit with nobody in a seat now has no owner.
    expect(units.find((u) => u.value === 'Corporate')?.attrs).toEqual({
      code: '1500',
      owner: null,
      hrbp: null,
    })
    expect(lists.location!.values.find((v) => v.value === 'Munich')?.attrs).toEqual({
      country: 'Germany',
      region: 'EMEA',
      jurisdiction: 'de',
      currency: 'EUR',
      legalEntity: 'Northgate Semiconductor GmbH',
    })
    expect(lists.costCenter!.values.find((v) => v.value === '1130-BLR')).toMatchObject({
      parent: 'Design Verification',
      attrs: { name: 'Design Verification, Bengaluru' },
    })
    expect(lists.role!.values).toEqual([
      { value: 'HR admin', attrs: { people: null }, builtIn: true },
      { value: 'Finance', attrs: { people: 'E6;E7' }, builtIn: true },
    ])
    expect(sampleLists(SAMPLE_CO)).toBe(sampleLists(SAMPLE_CO))
    expect(sampleLists(null)).toEqual({})
  })

  it('start the app’s vocabularies from the schema, always official', () => {
    const lists = officialLists(EMPTY_LISTS, OWN)
    expect(lists.level?.values).toHaveLength(LEVELS.length)
    expect(lists.level?.values.find((v) => v.value === 'M1')?.attrs).toEqual({
      label: 'Manager',
      track: 'Manager',
      leader: 'No',
    })
    expect(lists.level?.values.find((v) => v.value === 'M2')?.attrs?.leader).toBe('Yes')
    expect(lists.reasonCode?.values.find((v) => v.value === 'Cost-neutral mix')?.attrs).toEqual({
      types: 'Trade',
    })
    expect(lists.reasonCode?.values.find((v) => v.value === 'Below the cut line')?.attrs).toEqual({
      types: 'Set at cycle lock',
    })
    expect(lists.reasonCode?.values.find((v) => v.value === 'Growth')?.attrs?.types).toBe(
      'New role, Backfill, Level change, Location change, Transfer, Elimination, Start recruiting, Start date',
    )
    expect(lists.workerType?.values.map((v) => [v.value, v.attrs?.heads])).toEqual([
      ['Employee', 1],
      ['Contractor', 0],
      ['Intern', 0],
    ])
    expect(lists.currency?.values.map((v) => v.value)).toEqual([
      'USD',
      'CAD',
      'EUR',
      'ILS',
      'INR',
      'TWD',
      'CNY',
      'VND',
    ])
    expect(lists.role).toMatchObject({ source: 'builtin', validates: true })
    // Your own lists need your data: proposed, not official.
    expect(lists.department).toBeNull()
  })

  it('propose your own lists from your data, with the parent most rows agree on', () => {
    const data = company()
    const mine = kinds(['positions'])
    const eff = effectiveLists(EMPTY_LISTS, data, mine)
    const depts = eff.department
    expect(depts).toMatchObject({ status: 'proposed', source: 'data', validates: false })
    // Only the datasets you loaded: the sample requests' "Photonics" is not proposed.
    expect(depts.values.map((v) => v.value)).toEqual(['Design Verification', 'DV', 'Firmware', 'Payroll'])
    expect(depts.values[0].parent).toBe('Silicon Engineering')
    expect(eff.costCenter.values.map((v) => [v.value, v.parent])).toEqual([
      ['CC-100', 'Design Verification'],
      ['CC-200', 'Firmware'],
      ['CC-300', 'Payroll'],
    ])
    expect(eff.jobFamily.values.map((v) => v.value)).toEqual([
      'Silicon Engineering',
      'Systems & Software Engineering',
    ])
    expect(eff.location.values.find((v) => v.value === 'Austin')?.attrs?.country).toBe('United States')
    // A proposed list checks nothing.
    expect(validationVocab(EMPTY_LISTS, mine).refs.has('positions.department')).toBe(false)
    // Same inputs, same object.
    expect(effectiveLists(EMPTY_LISTS, data, mine)).toBe(eff)
  })

  it('leave the parent blank when no parent holds over half the rows', () => {
    const d = emptyDatasets()
    d.positions = [
      pos(1, { department: 'Shared', businessUnit: 'A' }),
      pos(2, { department: 'Shared', businessUnit: 'B' }),
    ]
    expect(listFromData(listDef('department'), d)[0].parent).toBeNull()
  })
})

describe('status rules', () => {
  it('keep saved lists as saved whatever data is loaded, checking the kind of data they were built for', () => {
    const data = company()
    const mine = kinds(['positions'])
    const eff = effectiveLists(EMPTY_LISTS, data, mine)
    const made = must(EMPTY_LISTS, eff, { kind: 'make-official', list: 'department' })
    expect(made.change.what).toBe('Made departments official.')
    const after = effectiveLists(made.state, data, mine)
    expect(after.department).toMatchObject({ status: 'official', source: 'saved', basis: 'data' })
    expect(validationVocab(made.state, mine).refs.get('requests.department')?.has('Firmware')).toBe(true)
    expect(applyEdit(made.state, after, { kind: 'make-official', list: 'department' })).toEqual({
      ok: false,
      error: 'It is already official.',
    })
    // Back on the sample, the saved list is still yours, but it checks nothing in the sample.
    expect(officialLists(made.state, SAMPLE).department).toMatchObject({
      source: 'saved',
      status: 'proposed',
      validates: false,
      paused: 'yours',
    })
    expect(validationVocab(made.state, SAMPLE).refs.has('positions.department')).toBe(false)
    expect(templateLists(made.state, SAMPLE)['positions.department']).toBeUndefined()
    // Unless you keep checking against it.
    const kept = must(made.state, effectiveLists(made.state, data, SAMPLE), {
      kind: 'make-official',
      list: 'department',
    })
    expect(kept.state.lists.department?.always).toBe(true)
    expect(kept.change.what).toBe('Kept checking the data against departments.')
    expect(officialLists(kept.state, SAMPLE).department).toMatchObject({
      status: 'official',
      validates: true,
    })
    expect(undoChange(kept.state, kept.change.id).lists).toEqual(made.state.lists)
  })

  it('stop checking your data against a list saved on the sample, until you keep it or rebuild it', () => {
    const r = must(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, SAMPLE_CO.data, SAMPLE, SAMPLE_CO), {
      kind: 'add',
      list: 'department',
      value: 'Photonics',
    })
    expect(r.state.lists.department?.basis).toBe('sample')
    expect(officialLists(r.state, SAMPLE).department).toMatchObject({ status: 'official', validates: true })
    const mine = kinds(['positions'])
    const yours = emptyDatasets()
    yours.positions = Array.from({ length: 40 }, (_, i) => pos(i + 1, { department: `Team ${i % 4}` }))
    const eff = effectiveLists(r.state, yours, mine)
    expect(eff.department).toMatchObject({ status: 'proposed', validates: false, paused: 'sample' })
    const vocab = validationVocab(r.state, mine)
    expect(vocab.refs.has('positions.department')).toBe(false)
    const q = computeQuality(yours, {}, undefined, { asOf: '2026-09-30', vocab })
    expect(q.fieldStats('positions.department').invalid).toBe(0)
    // Rebuild it from your data: it checks your data again.
    const rebuilt = must(r.state, eff, {
      kind: 'replace',
      list: 'department',
      values: listFromData(listDef('department'), yours, (k) => mine[k].kind === 'upload'),
      basis: 'data',
    })
    expect(rebuilt.change.what).toBe('Replaced departments with a list built from your data.')
    expect(effectiveLists(rebuilt.state, yours, mine).department).toMatchObject({
      status: 'official',
      validates: true,
    })
    expect(rebuilt.state.lists.department?.draft).toBeUndefined()
  })

  it('keep a proposed list proposed when you change it, until you make it official', () => {
    const data = company()
    const mine = kinds(['positions'])
    const eff = effectiveLists(EMPTY_LISTS, data, mine)
    const r = must(EMPTY_LISTS, eff, {
      kind: 'add',
      list: 'department',
      value: 'Photonics',
      parent: 'Corporate',
    })
    expect(r.state.lists.department?.draft).toBe(true)
    const draft = effectiveLists(r.state, data, mine)
    expect(draft.department).toMatchObject({ status: 'proposed', validates: false, paused: 'draft' })
    expect(draft.department.values.some((v) => v.value === 'Photonics')).toBe(true)
    expect(validationVocab(r.state, mine).refs.has('positions.department')).toBe(false)
    // Starting over keeps it a draft.
    const again = must(r.state, draft, {
      kind: 'replace',
      list: 'department',
      values: listFromData(listDef('department'), data),
      basis: 'data',
    })
    expect(again.state.lists.department?.draft).toBe(true)
    const made = must(r.state, draft, { kind: 'make-official', list: 'department' })
    expect(made.state.lists.department?.draft).toBeUndefined()
    expect(effectiveLists(made.state, data, mine).department).toMatchObject({
      status: 'official',
      validates: true,
    })
    expect(made.state.lists.department?.values.some((v) => v.value === 'Photonics')).toBe(true)
    // Undo takes it back to the draft.
    expect(undoChange(made.state, made.change.id).lists.department?.draft).toBe(true)
  })
})

describe('validation', () => {
  /** A department list with one retired value, and data with values on, retired and off the list. */
  function setup() {
    const d = emptyDatasets()
    d.positions = [
      pos(1),
      pos(2, { department: 'Old verification' }),
      pos(3, { department: 'Photonics' }),
      pos(4, { department: 'Photonics' }),
    ]
    d.requests = [request(1, { department: 'Photonics' })]
    d.comp = [comp(1), comp(2, { currency: 'GBP' })]
    const own = kinds(['positions', 'requests', 'comp'])
    let state: ListsState = EMPTY_LISTS
    let eff = effectiveLists(state, d, own)
    state = must(state, eff, {
      kind: 'replace',
      list: 'department',
      values: [{ value: 'Design Verification' }, { value: 'Old verification', retired: true }],
      basis: 'data',
    }).state
    eff = effectiveLists(state, d, own)
    return { d, own, state, eff }
  }

  it('counts each value not on an official list once, and still recognizes retired values', () => {
    const { d, own, state } = setup()
    const vocab = validationVocab(state, own)
    const versions = {}
    const q = computeQuality(d, versions, undefined, { asOf: '2026-09-30', vocab })
    expect(q.fieldStats('positions.department').invalid).toBe(2)
    expect(q.fieldRows('positions.department', 'invalid')).toEqual([2, 3])
    expect(q.fieldStats('requests.department').invalid).toBe(1)
    // Not one of the currencies the app knows: counted once, by its official list.
    expect(q.fieldStats('comp.currency').invalid).toBe(1)
    expect(q.vocab).toBe(vocab)
    // The same lists give the same index.
    expect(computeQuality(d, versions, undefined, { asOf: '2026-09-30', vocab })).toBe(q)
    // Without official lists nothing new is checked.
    expect(
      computeQuality(d, {}, undefined, { asOf: '2026-09-30' }).fieldStats('positions.department').invalid,
    ).toBe(0)
  })

  it('recognizes values added to a list', () => {
    const { d, own, state, eff } = setup()
    let next = must(state, eff, { kind: 'add', list: 'department', value: 'Photonics' }).state
    next = must(
      next,
      effectiveLists(next, d, own),
      { kind: 'add', list: 'currency', value: 'GBP' },
      2_000,
    ).state
    const q = computeQuality(d, {}, undefined, { asOf: '2026-09-30', vocab: validationVocab(next, own) })
    expect(q.fieldStats('positions.department').invalid).toBe(0)
    expect(q.fieldStats('comp.currency').invalid).toBe(0)
  })

  it('finds values in the data that are not on the list, by field, and values no row uses', () => {
    const { d, eff } = setup()
    const a = analyzeList(eff.department, d)
    expect(a.notOnList.map((n) => [n.value, n.ref, n.rows])).toEqual([
      ['Photonics', 'positions.department', [2, 3]],
      ['Photonics', 'requests.department', [0]],
    ])
    expect(a.notOnListRows).toBe(3)
    expect(a.uses.get('Old verification')?.total).toBe(1)
    expect(a.notInData).toEqual([])
  })

  it('offers the active values of official lists to the templates', () => {
    const { own, state } = setup()
    const t = templateLists(state, own)
    expect(t['positions.department']).toEqual({
      name: 'Departments',
      label: 'Departments',
      values: ['Design Verification'],
    })
    expect(t['freezes.department']).toBe(t['positions.department'])
    expect(t['positions.level'].values).toHaveLength(11)
    expect(t['comp.currency'].values).toContain('INR')
    // Proposed lists offer nothing.
    expect(t['positions.jobFamily']).toBeUndefined()
  })
})

describe('editing', () => {
  const data = company()
  const own = kinds(['positions'])
  const start = () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    let s = must(EMPTY_LISTS, eff, { kind: 'make-official', list: 'businessUnit' }).state
    s = must(s, effectiveLists(s, data, own), { kind: 'make-official', list: 'department' }, 2_000).state
    s = must(s, effectiveLists(s, data, own), { kind: 'make-official', list: 'costCenter' }, 3_000).state
    return { s, eff: effectiveLists(s, data, own) }
  }

  it('adds, refusing duplicates and parents that are not on the parent list', () => {
    const { s, eff } = start()
    expect(applyEdit(s, eff, { kind: 'add', list: 'department', value: ' firmware ' })).toEqual({
      ok: false,
      error: 'Departments already has "Firmware".',
    })
    expect(
      applyEdit(s, eff, { kind: 'add', list: 'department', value: 'Photonics', parent: 'Nowhere' }),
    ).toEqual({
      ok: false,
      error: '"Nowhere" is not on the business units list.',
    })
    const r = must(s, eff, {
      kind: 'add',
      list: 'department',
      value: '  Photonics  lab ',
      parent: 'Corporate',
    })
    expect(r.change.what).toBe('Added "Photonics lab" to departments.')
    expect(r.state.lists.department!.values.map((v) => v.value)).toEqual([
      'Design Verification',
      'DV',
      'Firmware',
      'Payroll',
      'Photonics lab',
    ])
    expect(applyEdit(s, eff, { kind: 'add', list: 'level', value: 'P7' })).toEqual({
      ok: false,
      error: 'Levels are fixed by Headcount Planner. You can retire values but not add them.',
    })
  })

  it('renames a value and the values that name it as their parent', () => {
    const { s, eff } = start()
    const r = must(s, eff, { kind: 'rename', list: 'department', from: 'Firmware', to: 'Embedded software' })
    expect(r.change.what).toBe('Renamed department "Firmware" to "Embedded software".')
    expect(r.change.lists).toEqual(['department', 'costCenter'])
    expect(r.state.lists.costCenter!.values.find((v) => v.value === 'CC-200')?.parent).toBe(
      'Embedded software',
    )
    expect(
      applyEdit(s, eff, { kind: 'rename', list: 'department', from: 'Firmware', to: 'payroll' }).ok,
    ).toBe(false)
    // A unit's rename reaches its departments.
    const u = must(s, eff, {
      kind: 'rename',
      list: 'businessUnit',
      from: 'Systems & Software',
      to: 'Systems',
    })
    expect(u.change.lists).toEqual(['businessUnit', 'department'])
    expect(u.state.lists.department!.values.find((v) => v.value === 'Firmware')?.parent).toBe('Systems')
    // The app's own values keep their names.
    expect(
      applyEdit(EMPTY_LISTS, eff, { kind: 'rename', list: 'currency', from: 'USD', to: 'US dollars' }),
    ).toEqual({
      ok: false,
      error: '"USD" is one of Headcount Planner’s currencies, so its name stays. Add your own value instead.',
    })
    expect(applyEdit(EMPTY_LISTS, eff, { kind: 'rename', list: 'level', from: 'P4', to: 'Senior' })).toEqual({
      ok: false,
      error: 'Levels keep the names Headcount Planner reads.',
    })
  })

  it('retires and restores, moves, changes attributes and deletes only unused values you added', () => {
    const { s, eff } = start()
    let r = must(s, eff, {
      kind: 'retire',
      list: 'department',
      value: 'DV',
      replacedBy: 'Design Verification',
    })
    expect(r.change.what).toBe('Retired department "DV", replaced by "Design Verification".')
    expect(r.state.lists.department!.values.find((v) => v.value === 'DV')).toMatchObject({
      retired: true,
      replacedBy: 'Design Verification',
    })
    r = must(r.state, eff, { kind: 'restore', list: 'department', value: 'DV' })
    expect(r.state.lists.department!.values.find((v) => v.value === 'DV')?.retired).toBeUndefined()
    r = must(r.state, eff, {
      kind: 'move',
      list: 'department',
      value: 'Payroll',
      parent: 'Silicon Engineering',
    })
    expect(r.change.what).toBe('Moved department "Payroll" to Silicon Engineering.')
    r = must(r.state, eff, { kind: 'attrs', list: 'department', value: 'Payroll', attrs: { code: '9100' } })
    expect(r.change.what).toBe('Changed the code of department "Payroll".')
    expect(r.state.lists.department!.values.find((v) => v.value === 'Payroll')?.attrs).toEqual({
      code: '9100',
    })
    expect(applyEdit(r.state, eff, { kind: 'delete', list: 'department', value: 'Payroll' })).toMatchObject({
      ok: false,
      error: 'Only values you added can be deleted. Retire it instead.',
    })
    const added = must(r.state, eff, { kind: 'add', list: 'department', value: 'Photonics' })
    expect(
      applyEdit(
        added.state,
        eff,
        { kind: 'delete', list: 'department', value: 'Photonics' },
        { usage: () => 3 },
      ),
    ).toEqual({
      ok: false,
      error: '3 rows use it. Retire it instead, or map its rows to another value first.',
    })
    const del = must(added.state, eff, { kind: 'delete', list: 'department', value: 'Photonics' })
    expect(del.state.lists.department!.values.some((v) => v.value === 'Photonics')).toBe(false)
    // A unit with departments under it can't be deleted.
    const unit = must(s, eff, { kind: 'add', list: 'businessUnit', value: 'Photonics' })
    const dept = must(unit.state, effectiveLists(unit.state, data, own), {
      kind: 'add',
      list: 'department',
      value: 'Optics',
      parent: 'Photonics',
    })
    expect(
      applyEdit(dept.state, effectiveLists(dept.state, data, own), {
        kind: 'delete',
        list: 'businessUnit',
        value: 'Photonics',
      }),
    ).toEqual({ ok: false, error: 'It is the business unit of 1 department. Move them first.' })
  })

  it('changes a level’s label and leader marking; the track is the app’s', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const lvl = must(EMPTY_LISTS, eff, {
      kind: 'attrs',
      list: 'level',
      value: 'P4',
      attrs: { label: 'Senior engineer' },
    })
    expect(lvl.state.lists.level!.values.find((v) => v.value === 'P4')?.attrs).toEqual({
      label: 'Senior engineer',
      track: 'Individual contributor',
      leader: 'No',
    })
    expect(
      applyEdit(EMPTY_LISTS, eff, { kind: 'attrs', list: 'level', value: 'P6', attrs: { leader: 'maybe' } }),
    ).toEqual({
      ok: false,
      error: 'Leader seats must be one of Yes, No.',
    })
    expect(
      applyEdit(EMPTY_LISTS, eff, { kind: 'attrs', list: 'level', value: 'P6', attrs: { track: 'Manager' } }),
    ).toEqual({
      ok: false,
      error: 'Nothing would change.',
    })
    const leader = must(EMPTY_LISTS, eff, {
      kind: 'attrs',
      list: 'level',
      value: 'P6',
      attrs: { leader: 'yes' },
    })
    expect(leader.state.lists.level!.values.find((v) => v.value === 'P6')?.attrs?.leader).toBe('Yes')
  })
})

describe('change log and undo', () => {
  const data = company()
  const own = kinds(['positions'])

  it('undoes a change back to how the list was, including a list that was not saved', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const a = must(EMPTY_LISTS, eff, { kind: 'add', list: 'department', value: 'Photonics' })
    expect(a.state.lists.department).toBeDefined()
    const undone = undoChange(a.state, a.change.id, 'Jamie', 5_000)
    expect(undone.lists.department).toBeUndefined()
    expect(undone.log[0]).toMatchObject({
      what: 'Undid: Added "Photonics" to departments.',
      by: 'Jamie',
      undoes: a.change.id,
    })
    // The undo can be undone: the change comes back.
    const redo = undoChange(undone, undone.log[0].id, null, 6_000)
    expect(redo.lists.department?.values.some((v) => v.value === 'Photonics')).toBe(true)
    expect(redo.log[0].what).toBe('Restored: Added "Photonics" to departments.')
  })

  it('undoes only while no later change touched the same lists', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const a = must(EMPTY_LISTS, eff, { kind: 'add', list: 'department', value: 'Photonics' })
    const b = must(
      a.state,
      effectiveLists(a.state, data, own),
      { kind: 'add', list: 'jobFamily', value: 'Research' },
      2_000,
    )
    expect(canUndo(b.state, a.change.id)).toBe(true)
    const c = must(
      b.state,
      effectiveLists(b.state, data, own),
      { kind: 'add', list: 'department', value: 'Optics' },
      3_000,
    )
    expect(canUndo(c.state, a.change.id)).toBe(false)
    expect(undoChange(c.state, a.change.id)).toBe(c.state)
    // Without an id, the latest change that can be undone.
    const latest = undoChange(c.state)
    expect(latest.lists.department?.values.some((v) => v.value === 'Optics')).toBe(false)
    expect(latest.lists.department?.values.some((v) => v.value === 'Photonics')).toBe(true)
  })

  it('undoes a rename everywhere it reached', () => {
    const eff0 = effectiveLists(EMPTY_LISTS, data, own)
    let s = must(EMPTY_LISTS, eff0, { kind: 'make-official', list: 'department' }).state
    s = must(s, effectiveLists(s, data, own), { kind: 'make-official', list: 'costCenter' }, 2_000).state
    const r = must(
      s,
      effectiveLists(s, data, own),
      { kind: 'rename', list: 'department', from: 'Firmware', to: 'Embedded' },
      3_000,
    )
    expect(undoChange(r.state, r.change.id).lists).toEqual(s.lists)
  })

  it('logs several changes as one and keeps the log bounded', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const r = applyEdits(
      EMPTY_LISTS,
      eff,
      [
        { kind: 'add', list: 'department', value: 'A' },
        { kind: 'add', list: 'department', value: 'a' },
        { kind: 'add', list: 'jobFamily', value: 'Research' },
      ],
      'Imported.',
    )
    expect(r.applied).toHaveLength(2)
    expect(r.rejected[0].error).toBe('Departments already has "A".')
    expect(r.change?.lists).toEqual(['department', 'jobFamily'])
    expect(undoChange(r.state, r.change!.id).lists).toEqual({})
    let s: ListsState = EMPTY_LISTS
    for (let i = 0; i < MAX_LOG + 5; i++)
      s = undoChange(must(s, eff, { kind: 'add', list: 'jobFamily', value: `F${i}` }, i).state)
    expect(s.log).toHaveLength(MAX_LOG)
  })
})

describe('spellings that differ only in case or spacing', () => {
  function messy() {
    const d = emptyDatasets()
    d.positions = [
      pos(1, { department: 'Firmware' }),
      pos(2, { department: 'Firmware' }),
      pos(3, { department: 'firmware' }),
      pos(4, { department: 'FW' }),
      pos(5, { department: 'Payroll  Ops' }),
      pos(6, { department: 'Payroll  Ops' }),
      pos(7, { department: 'Payroll Ops' }),
    ]
    return d
  }

  it('are one value of a list built from data: the spelling most rows use', () => {
    expect(listFromData(listDef('department'), messy()).map((v) => v.value)).toEqual([
      'Firmware',
      'FW',
      'Payroll  Ops',
    ])
  })

  it('round-trip exactly through this browser and the settings file', () => {
    const d = messy()
    const mine = kinds(['positions'])
    const made = must(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, d, mine), {
      kind: 'make-official',
      list: 'department',
    })
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    expect(saveLists(made.state, storage)).toBe(true)
    expect([...store.keys()]).toEqual(['hcp:lists'])
    const loaded = loadLists(storage)
    expect(loaded).toEqual(made.state)
    const imported = importListsSection(JSON.parse(JSON.stringify(listsFileSection(made.state))), EMPTY_LISTS)
    if (!imported.ok) throw new Error(imported.error)
    expect(imported.state.lists.department).toEqual(made.state.lists.department)
    // The rows on the list stay recognized after the reload; the other spellings never were.
    const before = validationVocab(made.state, mine).refs.get('positions.department')!
    const after = validationVocab(loaded, mine).refs.get('positions.department')!
    expect([...after]).toEqual([...before])
    expect(after.has('Payroll  Ops')).toBe(true)
    expect(after.has('firmware')).toBe(false)
    // A file that does hold two such spellings keeps the first.
    const dup = sanitizeListsState({
      lists: {
        department: { values: [{ value: 'Firmware' }, { value: ' firmware ' }], basis: 'data', at: 'x' },
      },
    })
    expect(dup.lists.department?.values.map((v) => v.value)).toEqual(['Firmware'])
  })

  it('are refused as a second value when you add or rename', () => {
    const d = messy()
    const mine = kinds(['positions'])
    const made = must(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, d, mine), {
      kind: 'make-official',
      list: 'department',
    })
    const eff = effectiveLists(made.state, d, mine)
    expect(applyEdit(made.state, eff, { kind: 'add', list: 'department', value: 'payroll ops' })).toEqual({
      ok: false,
      error: 'Departments already has "Payroll  Ops".',
    })
    expect(
      applyEdit(made.state, eff, { kind: 'rename', list: 'department', from: 'FW', to: 'PAYROLL OPS' }).ok,
    ).toBe(false)
  })
})

describe('persistence and the settings file', () => {
  const data = company()
  const own = kinds(['positions'])

  it('saves and loads, checking what it reads', () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    const r = must(EMPTY_LISTS, eff, { kind: 'add', list: 'department', value: 'Photonics' })
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    saveLists(r.state, storage)
    expect(loadLists(storage)).toEqual(r.state)
    expect(loadLists({ getItem: () => '{oops', setItem: () => undefined })).toEqual(EMPTY_LISTS)
    expect(
      loadLists({
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => undefined,
      }),
    ).toEqual(EMPTY_LISTS)
    expect(
      saveLists(r.state, {
        getItem: () => null,
        setItem: () => {
          throw new Error('full')
        },
      }),
    ).toBe(false)
    // Unknown lists, names an object reserves and bad values are dropped; the app's values come back to its lists.
    const clean = sanitizeListsState(
      JSON.parse(`{
        "lists": {
          "__proto__": { "values": [{ "value": "x" }] },
          "constructor": { "values": [] },
          "nope": { "values": [] },
          "department": { "values": [{ "value": "A" }, { "value": "a" }, { "value": "" }, 7], "basis": "data", "at": "x" },
          "reasonCode": { "values": [{ "value": "Growth", "retired": true }, { "value": "Made up" }], "basis": "odd", "at": "x" }
        },
        "log": [{ "id": "x", "at": "y", "what": "z", "ops": [{ "op": "explode", "list": "department" }] }]
      }`),
    )
    expect(Object.keys(clean.lists).sort()).toEqual(['department', 'reasonCode'])
    expect(clean.lists.department?.values).toEqual([{ value: 'A', parent: null }])
    const reasons = clean.lists.reasonCode!.values
    expect(reasons.some((v) => v.value === 'Made up')).toBe(false)
    expect(reasons.find((v) => v.value === 'Growth')).toMatchObject({ retired: true, builtIn: true })
    expect(reasons).toHaveLength(REASON_CODES.length)
    expect(clean.lists.reasonCode?.basis).toBe('file')
    expect(clean.log).toEqual([])
  })

  it('round-trips through the settings file', async () => {
    const eff = effectiveLists(EMPTY_LISTS, data, own)
    let s = must(EMPTY_LISTS, eff, { kind: 'make-official', list: 'department' }).state
    s = must(
      s,
      effectiveLists(s, data, own),
      { kind: 'add', list: 'department', value: 'Photonics', parent: 'Corporate' },
      2_000,
    ).state
    expect(listsFileSection(EMPTY_LISTS)).toBeUndefined()
    const blob = settingsBlob(DEFAULT_SETTINGS, new Date('2026-10-01T00:00:00Z'), {
      lists: listsFileSection(s),
    })
    const parsed = parseSettingsFile(await blob.text(), DEFAULT_SETTINGS, '2026-10-01')
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.listsSection).toBeDefined()
    const r = importListsSection(parsed.listsSection, EMPTY_LISTS, 'Jamie', 9_000)
    if (!r.ok) throw new Error(r.error)
    expect(r.state.lists).toEqual(s.lists)
    expect(r.changed).toEqual(['department'])
    expect(r.summary).toBe('Official lists: replaced departments.')
    expect(r.state.log[0]).toMatchObject({
      what: 'Loaded 1 official list from a settings file.',
      by: 'Jamie',
    })
    // Undo puts the lists back.
    expect(undoChange(r.state).lists).toEqual({})
    // The same file again changes nothing.
    expect(importListsSection(parsed.listsSection, r.state)).toMatchObject({
      ok: true,
      changed: [],
      state: r.state,
    })
    // A file with only lists in it is still a settings file; a newer section is refused.
    const onlyLists = JSON.stringify({
      kind: 'hcp-settings',
      version: 1,
      exportedAt: 'x',
      settings: {},
      lists: listsFileSection(s),
    })
    expect(parseSettingsFile(onlyLists, DEFAULT_SETTINGS, '2026-10-01').ok).toBe(true)
    expect(importListsSection({ version: 2, lists: {} }, EMPTY_LISTS)).toEqual({
      ok: false,
      error: 'The official lists in the file come from a newer version and could not be read.',
    })
    expect(importListsSection('nope', EMPTY_LISTS).ok).toBe(false)
  })
})

describe('what the app reads from the lists', () => {
  it('reads leader levels: Director and above unless the Levels list says otherwise', () => {
    const eff = effectiveLists(EMPTY_LISTS, company(), kinds(['positions']))
    expect([...leaderLevels(eff)]).toEqual(['M2', 'E1', 'E2', 'E3'])
    let s = must(EMPTY_LISTS, eff, {
      kind: 'attrs',
      list: 'level',
      value: 'P6',
      attrs: { leader: 'Yes' },
    }).state
    s = must(s, effectiveLists(s, company(), kinds(['positions'])), {
      kind: 'attrs',
      list: 'level',
      value: 'M2',
      attrs: { leader: 'No' },
    }).state
    expect([...leaderLevels(effectiveLists(s, company(), kinds(['positions'])))]).toEqual([
      'P6',
      'E1',
      'E2',
      'E3',
    ])
  })

  it('reads each unit’s HR business partner and the people of each role', () => {
    const eff = effectiveLists(EMPTY_LISTS, SAMPLE_CO.data, SAMPLE, SAMPLE_CO)
    expect([...unitHrbps(eff)]).toEqual([['Silicon Engineering', 'E3']])
    expect(rolePeople(eff, 'Finance')).toEqual(['E6', 'E7'])
    expect(rolePeople(eff, 'HR admin')).toEqual([])
    expect(builtinValues('role').map((v) => v.value)).toEqual(['HR admin', 'Finance'])
  })
})

describe('official parents', () => {
  it('come from an official list only', () => {
    const eff = effectiveLists(EMPTY_LISTS, company(), kinds(['positions']))
    expect(officialParents(eff.department).size).toBe(0)
    const sample = officialLists(EMPTY_LISTS, SAMPLE, SAMPLE_CO).department!
    expect(officialParents(sample).get('Sales')).toBe('Go-to-Market')
  })
})
