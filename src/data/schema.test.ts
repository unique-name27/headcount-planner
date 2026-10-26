/**
 * The data model against docs/PLAN.md 5.1, 5.2, 9.1 and 13.1: the eight datasets, their row keys,
 * fields and flags, the vocabularies, the sites, the assumption tables and the views.
 */
import { describe, expect, it } from 'vitest'
import { PLANNED_DATASETS } from '@/app/status'
import { suppress } from '@/lib/stats'
import { FIELD_REFS, fieldDefOf, invalidRefs, isFieldRef, parseFieldRef } from './quality/fieldRef'
import {
  APPROVED_REQUEST_STATES,
  ASSUMPTION_ANY_KEY,
  ASSUMPTION_KEYS,
  ASSUMPTION_TABLES,
  type AssumptionRow,
  assumptionKey,
  type CompRow,
  CYCLE_STAGES,
  DATASET_KEYS,
  DATASETS,
  type DatasetKey,
  datasetDef,
  END_REASONS,
  emptyDatasets,
  type FreezeRow,
  FX_SETS,
  isHrAdminOnly,
  isLeaderLevel,
  isMode,
  isPageKey,
  isRouteView,
  isViewKey,
  LEADER_MIN_LEVEL,
  LEVEL_LABELS,
  LEVELS,
  levelIndex,
  levelTrack,
  MIN_GROUP,
  MODES,
  OPTIONAL_DATASETS,
  PAGE_KEYS,
  PAGE_LABEL,
  PENDING_REQUEST_STATES,
  POSITION_STATUSES,
  type PositionRow,
  PRORATIONS,
  REASON_CODES,
  REASON_CODES_OF,
  REQ_STAGES,
  REQ_STATUSES,
  REQ_TYPES,
  REQUEST_STATES,
  REQUEST_TYPES,
  type ReqRow,
  type RequestRow,
  SITES,
  STEP_DECISIONS,
  STEP_ROLES,
  siteByLocation,
  splitAssumptionKey,
  splitIds,
  type TargetRow,
  TRANSFER_KIND_CODE,
  TRANSFER_KINDS,
  VIEW_KEYS,
  VIEW_LABEL,
  type ViewKey,
  WORKER_TYPES,
  type WorkerRow,
  withAllDatasets,
} from './schema'

/**
 * Every field of every record type, in docs/PLAN.md 5.2 order. Typed `Record<keyof Row, true>`, so
 * tsc fails when a record type gains or loses a field this list does not; the test then holds the
 * dataset definitions to the same list.
 */
type All<T> = Record<keyof T, true>
const positions: All<PositionRow> = {
  positionId: true,
  effectiveDate: true,
  status: true,
  title: true,
  jobFamily: true,
  level: true,
  businessUnit: true,
  department: true,
  costCenter: true,
  location: true,
  legalEntity: true,
  managerPositionId: true,
  workerType: true,
  fte: true,
  startDate: true,
  openedDate: true,
  reqType: true,
  leaderLevel: true,
  endDate: true,
  endReason: true,
  sourceRequestId: true,
}
const workers: All<WorkerRow> = {
  employeeId: true,
  name: true,
  positionId: true,
  assignmentStart: true,
  assignmentEnd: true,
  hireDate: true,
  terminationDate: true,
  workerType: true,
  fte: true,
  level: true,
  businessUnit: true,
  department: true,
  costCenter: true,
  location: true,
  legalEntity: true,
  managerId: true,
  onLeave: true,
  leavePaid: true,
}
const comp: All<CompRow> = {
  employeeId: true,
  effectiveDate: true,
  currency: true,
  baseSalary: true,
  targetBonusPct: true,
}
const reqs: All<ReqRow> = {
  reqId: true,
  positionId: true,
  status: true,
  stage: true,
  reqType: true,
  openedDate: true,
  targetStartDate: true,
  offerAcceptedDate: true,
  startDate: true,
  closedDate: true,
  hiringManagerId: true,
  recruiter: true,
  offerBase: true,
  offerCurrency: true,
  signOnBonus: true,
  relocation: true,
  agencyFee: true,
}
const requests: All<RequestRow> = {
  requestId: true,
  type: true,
  state: true,
  reasonCode: true,
  requesterId: true,
  submittedById: true,
  submittedAt: true,
  updatedAt: true,
  positionId: true,
  businessUnit: true,
  department: true,
  costCenter: true,
  managerPositionId: true,
  level: true,
  location: true,
  jobTitle: true,
  fte: true,
  startDate: true,
  priority: true,
  cycleId: true,
  steps: true,
  confidential: true,
  exception: true,
  // trade (docs/PLAN.md 11.4)
  givePositionIds: true,
  giveOrgPositionId: true,
  creditUsedBp: true,
  count: true,
  jobFamily: true,
  partTimeRest: true,
  restFte: true,
  rateVersion: true,
  rateHash: true,
  giveBp: true,
  getBp: true,
  creditBp: true,
  // transfer (docs/PLAN.md 10.5)
  transferKind: true,
  personId: true,
  fromPositionId: true,
  toManagerPositionId: true,
  toPositionId: true,
  effectiveDate: true,
  moveBudget: true,
}
const targets: All<TargetRow> = {
  fiscalYear: true,
  targetDate: true,
  businessUnit: true,
  department: true,
  costCenter: true,
  leaderPositionId: true,
  targetHeads: true,
  targetCost: true,
}
const freezes: All<FreezeRow> = {
  freezeId: true,
  businessUnit: true,
  department: true,
  costCenter: true,
  leaderPositionId: true,
  startDate: true,
  endDate: true,
  allowBackfill: true,
  reason: true,
}
const assumptions: All<AssumptionRow> = { version: true, table: true, org: true, key: true, value: true }

const FIELDS: Record<DatasetKey, readonly string[]> = {
  positions: Object.keys(positions),
  workers: Object.keys(workers),
  comp: Object.keys(comp),
  reqs: Object.keys(reqs),
  requests: Object.keys(requests),
  targets: Object.keys(targets),
  freezes: Object.keys(freezes),
  assumptions: Object.keys(assumptions),
}

/** docs/PLAN.md 5.2: the row keys. */
const ROW_KEYS: Record<DatasetKey, readonly string[]> = {
  positions: ['positionId', 'effectiveDate'],
  workers: ['employeeId', 'positionId', 'assignmentStart'],
  comp: ['employeeId', 'effectiveDate'],
  reqs: ['reqId'],
  requests: ['requestId'],
  targets: ['fiscalYear', 'businessUnit', 'department', 'costCenter', 'leaderPositionId'],
  freezes: ['freezeId'],
  assumptions: ['version', 'table', 'org', 'key'],
}

/** docs/PLAN.md 5.2: the fields in bold. */
const REQUIRED: Record<DatasetKey, readonly string[]> = {
  positions: ['positionId', 'effectiveDate', 'status', 'level', 'businessUnit', 'costCenter', 'location'],
  workers: ['employeeId', 'hireDate', 'workerType'],
  comp: ['employeeId', 'effectiveDate', 'baseSalary'],
  reqs: ['reqId', 'status', 'openedDate'],
  requests: ['requestId', 'type', 'state', 'reasonCode', 'requesterId', 'businessUnit'],
  targets: ['fiscalYear', 'businessUnit', 'targetHeads'],
  freezes: ['freezeId', 'businessUnit', 'startDate'],
  assumptions: ['version', 'table', 'key', 'value'],
}

/** docs/PLAN.md 5.2: the `pay`, `leave` and `cost` flags, and nothing else flagged. */
const PAY = [
  'workers.onLeave',
  'workers.leavePaid',
  'comp.baseSalary',
  'reqs.offerBase',
  'reqs.signOnBonus',
  'reqs.relocation',
  'reqs.agencyFee',
]
const LEAVE = ['workers.onLeave', 'workers.leavePaid']
const COST = ['targets.targetCost']

/** docs/PLAN.md 9.1: the datasets each view reads, inverted to the views each dataset is used by. */
const VIEW_DATASETS: Record<ViewKey, readonly DatasetKey[] | 'all'> = {
  home: 'all',
  team: ['positions', 'workers', 'reqs', 'requests', 'assumptions'],
  plan: ['positions', 'workers', 'comp', 'reqs', 'assumptions', 'freezes'],
  requests: ['requests', 'positions', 'targets', 'freezes', 'assumptions'],
  forecast: ['positions', 'workers', 'comp', 'reqs', 'assumptions', 'freezes'],
  targets: ['targets', 'positions', 'requests', 'assumptions'],
  whatif: ['positions', 'assumptions', 'targets', 'freezes', 'requests'],
  finance: 'all',
}

const all = DATASETS.flatMap((d) => d.fields.map((f) => ({ ref: `${d.key}.${f.key}`, d, f })))
const flagged = (flag: 'pay' | 'leave' | 'cost') => all.filter((x) => x.f[flag]).map((x) => x.ref)

describe('datasets', () => {
  it('are the eight, in order, with their definitions in the same order', () => {
    expect(DATASET_KEYS).toEqual([
      'positions',
      'workers',
      'comp',
      'reqs',
      'requests',
      'targets',
      'freezes',
      'assumptions',
    ])
    expect(DATASETS.map((d) => d.key)).toEqual(DATASET_KEYS)
    expect(OPTIONAL_DATASETS).toEqual(['reqs', 'requests', 'targets', 'freezes'])
    for (const k of DATASET_KEYS) expect(datasetDef(k).key).toBe(k)
  })

  it('have the row keys of docs/PLAN.md 5.2, each a field of its dataset', () => {
    for (const d of DATASETS) {
      expect(d.rowKey, d.key).toEqual(ROW_KEYS[d.key])
      const keys = d.fields.map((f) => f.key)
      for (const k of d.rowKey) expect(keys, `${d.key}.${k}`).toContain(k)
    }
  })

  it('define exactly the fields of their record types, in plan order', () => {
    for (const d of DATASETS)
      expect(
        d.fields.map((f) => f.key),
        d.key,
      ).toEqual(FIELDS[d.key])
  })

  it('require exactly the fields docs/PLAN.md 5.2 marks required', () => {
    for (const d of DATASETS) {
      expect(
        d.fields.filter((f) => f.required).map((f) => f.key),
        d.key,
      ).toEqual(REQUIRED[d.key])
    }
    // Nothing is both required and recommended.
    expect(all.filter((x) => x.f.required && x.f.recommended).map((x) => x.ref)).toEqual([])
  })

  it('flag pay, leave and cost exactly as docs/PLAN.md 5.2', () => {
    expect(flagged('pay')).toEqual(PAY)
    expect(flagged('leave')).toEqual(LEAVE)
    expect(flagged('cost')).toEqual(COST)
    // Leave fields are pay fields too (docs/PLAN.md 7.7); a group total is never one person's pay.
    for (const ref of LEAVE) expect(PAY).toContain(ref)
    for (const ref of COST) expect(PAY).not.toContain(ref)
  })

  it('give enum fields their vocabularies, and only enum fields values', () => {
    const values: Record<string, readonly string[]> = {
      'positions.status': POSITION_STATUSES,
      'positions.workerType': WORKER_TYPES,
      'positions.reqType': REQ_TYPES,
      'positions.endReason': END_REASONS,
      'workers.workerType': WORKER_TYPES,
      'reqs.status': REQ_STATUSES,
      'reqs.stage': REQ_STAGES,
      'reqs.reqType': REQ_TYPES,
      'requests.type': REQUEST_TYPES,
      'requests.state': REQUEST_STATES,
      'requests.reasonCode': REASON_CODES,
      'requests.transferKind': TRANSFER_KINDS,
      'assumptions.table': ASSUMPTION_TABLES,
    }
    expect(
      all
        .filter((x) => x.f.type === 'enum')
        .map((x) => x.ref)
        .sort(),
    ).toEqual(Object.keys(values).sort())
    for (const x of all) {
      if (x.f.type === 'enum') expect(x.f.values, x.ref).toEqual(values[x.ref])
      else expect(x.f.values, x.ref).toBeUndefined()
    }
  })

  it('type levels, money, steps, dates and booleans as the plan describes them', () => {
    const typeOf = (ref: string) => fieldDefOf(ref)?.type
    for (const ref of ['positions.level', 'workers.level', 'requests.level'])
      expect(typeOf(ref), ref).toBe('level')
    for (const ref of [...PAY.filter((r) => !LEAVE.includes(r)), ...COST])
      expect(typeOf(ref), ref).toBe('money')
    for (const ref of LEAVE) expect(typeOf(ref), ref).toBe('boolean')
    expect(typeOf('requests.steps')).toBe('steps')
    expect(typeOf('requests.submittedAt')).toBe('datetime')
    expect(typeOf('requests.updatedAt')).toBe('datetime')
    expect(typeOf('comp.targetBonusPct')).toBe('percent')
    expect(typeOf('positions.openedDate')).toBe('date')
    expect(all.filter((x) => x.f.type === 'steps').map((x) => x.ref)).toEqual(['requests.steps'])
  })

  it('carry the plan’s import hints', () => {
    const openedDate = fieldDefOf('positions.openedDate')!
    for (const s of ['opened date', 'date opened', 'position opened', 'availability date'])
      expect(openedDate.synonyms).toContain(s)
    expect(fieldDefOf('reqs.offerBase')!.description).toContain('full-time rate, not part-time pay')
    expect(fieldDefOf('comp.baseSalary')!.description).toContain('full-time rate, not part-time pay')
  })

  it('never use one header name for two fields of a dataset', () => {
    const norm = (s: string) =>
      s
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    for (const d of DATASETS) {
      const owner = new Map<string, string>()
      for (const f of d.fields) {
        for (const name of new Set([f.label, f.key, ...f.synonyms].map(norm))) {
          const other = owner.get(name)
          expect(other, `${d.key}: "${name}" names ${other} and ${f.key}`).toBeUndefined()
          owner.set(name, f.key)
        }
      }
    }
  })

  it('follow the copy rules in labels and descriptions', () => {
    const texts = [
      ...DATASETS.flatMap((d) => [d.label, d.description, d.sheet]),
      ...all.flatMap((x) => [x.f.label, x.f.description]),
    ]
    for (const t of texts) {
      expect(t.includes('—'), t).toBe(false)
      expect(t.includes('!'), t).toBe(false)
      expect(t.trim(), t).toBe(t)
      expect(t.length, t).toBeGreaterThan(0)
    }
    for (const x of all) {
      expect(x.f.description.endsWith('.'), x.ref).toBe(true)
      expect(x.f.synonyms.length, x.ref).toBeGreaterThan(0)
      for (const s of x.f.synonyms) expect(s, x.ref).toBe(s.toLowerCase())
    }
  })

  it('name the views that read them, as docs/PLAN.md 9.1 lists', () => {
    for (const d of DATASETS) {
      const want = VIEW_KEYS.filter((v) => {
        const ds = VIEW_DATASETS[v]
        return ds === 'all' || ds.includes(d.key)
      })
      expect(d.usedBy, d.key).toEqual(want)
    }
  })

  it('match the M1 status page’s list (src/app/status.ts) until the page reads them from here', () => {
    expect(PLANNED_DATASETS.map((p) => [p.key, p.label, p.required])).toEqual(
      DATASETS.map((d) => [d.key, d.label, !OPTIONAL_DATASETS.includes(d.key)]),
    )
  })

  it('fill in missing datasets with empty lists', () => {
    const empty = emptyDatasets()
    expect(Object.keys(empty)).toEqual(DATASET_KEYS)
    for (const k of DATASET_KEYS) expect(empty[k]).toEqual([])
    const row = { positionId: 'P-1' } as PositionRow
    const filled = withAllDatasets({ positions: [row] })
    expect(filled.positions).toEqual([row])
    expect(filled.assumptions).toEqual([])
    const whole = emptyDatasets()
    expect(withAllDatasets(whole)).toBe(whole)
  })
})

describe('field references', () => {
  it('cover every field of every dataset', () => {
    expect(FIELD_REFS).toEqual(all.map((x) => x.ref))
    expect(isFieldRef('positions.managerPositionId')).toBe(true)
    expect(isFieldRef('positions.salary')).toBe(false)
    expect(parseFieldRef('requests.givePositionIds')).toEqual({
      dataset: 'requests',
      field: 'givePositionIds',
    })
    expect(parseFieldRef('employees.name')).toBeNull()
    expect(invalidRefs(['workers.onLeave', 'workers.gender'])).toEqual(['workers.gender'])
  })
})

describe('vocabularies', () => {
  it('keep the anonymity minimum at 5, the same as src/lib/stats (which keeps its own copy)', () => {
    expect(MIN_GROUP).toBe(5)
    expect(suppress(0.5, MIN_GROUP - 1)).toBeNull()
    expect(suppress(0.5, MIN_GROUP)).toBe(0.5)
  })

  it('list the five modes', () => {
    expect(MODES).toEqual(['manager', 'hrbp', 'leader', 'finance', 'hr-admin'])
    for (const m of MODES) expect(isMode(m)).toBe(true)
    for (const v of ['hr', 'developer', 'Manager', '', null, 3]) expect(isMode(v), String(v)).toBe(false)
  })

  it('put P1 to P6 under M1, M2 and E1 to E3, with Director (M2) the leader level', () => {
    expect(LEVELS).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'M1', 'M2', 'E1', 'E2', 'E3'])
    expect(Object.keys(LEVEL_LABELS)).toEqual([...LEVELS])
    expect(LEVEL_LABELS.P4).toBe('P4 Senior')
    expect(LEVEL_LABELS.M2).toBe('M2 Director')
    expect(levelTrack('P4')).toBe('Individual contributor')
    expect(levelTrack('M1')).toBe('Manager')
    expect(levelTrack('E2')).toBe('Executive')
    expect(levelIndex('P1')).toBe(0)
    expect(levelIndex('E3')).toBe(10)
    expect(levelIndex('L4')).toBe(-1)
    expect(LEADER_MIN_LEVEL).toBe('M2')
    expect(LEVELS.filter(isLeaderLevel)).toEqual(['M2', 'E1', 'E2', 'E3'])
  })

  it('spell statuses, stages, types and states as the plan does', () => {
    expect(POSITION_STATUSES).toEqual(['Filled', 'Open', 'Planned', 'On hold', 'Eliminated'])
    expect(WORKER_TYPES).toEqual(['Employee', 'Contractor', 'Intern'])
    expect(REQ_STATUSES).toEqual(['Open', 'On hold', 'Filled', 'Cancelled'])
    expect(REQ_STAGES).toEqual(['Req opened', 'Interviewing', 'Offer accepted', 'Started'])
    expect(REQ_TYPES).toEqual(['New', 'Backfill'])
    expect(REQUEST_TYPES).toEqual([
      'New role',
      'Backfill',
      'Level change',
      'Location change',
      'Transfer',
      'Elimination',
      'Trade',
      'Start recruiting',
      'Start date',
    ])
    expect(REQUEST_STATES).toEqual([
      'Draft',
      'Submitted',
      'In review',
      'Sent back',
      'Approved',
      'Approved with changes',
      'Rejected',
      'Withdrawn',
      'Expired',
    ])
    for (const s of [...PENDING_REQUEST_STATES, ...APPROVED_REQUEST_STATES])
      expect(REQUEST_STATES).toContain(s)
    expect(PENDING_REQUEST_STATES).toEqual(['Submitted', 'In review', 'Sent back'])
    expect(CYCLE_STAGES).toEqual([
      'Open for asks',
      'HRBP review',
      'Leader review',
      'Finance review',
      'Locked',
    ])
    expect(PRORATIONS).toEqual(['daily', 'half-month', 'full-month'])
    expect(FX_SETS).toEqual(['plan', 'actual', 'forecast'])
    expect(END_REASONS).toEqual(['Eliminated', 'Traded', 'Transferred'])
    expect(Object.keys(TRANSFER_KIND_CODE)).toEqual([...TRANSFER_KINDS])
    expect(Object.values(TRANSFER_KIND_CODE)).toEqual(['position', 'internal'])
    expect(STEP_ROLES).toEqual(['Manager', 'HRBP', 'Leader', 'Finance'])
    expect(STEP_DECISIONS[0]).toBe('Pending')
  })

  it('offer reason codes per type from the one list', () => {
    expect(Object.keys(REASON_CODES_OF)).toEqual([...REQUEST_TYPES])
    for (const t of REQUEST_TYPES) {
      expect(REASON_CODES_OF[t].length, t).toBeGreaterThan(0)
      for (const r of REASON_CODES_OF[t]) expect(REASON_CODES, `${t}: ${r}`).toContain(r)
      // Set only by the system at cycle lock (docs/PLAN.md 15.1 R7), never offered in a form.
      expect(REASON_CODES_OF[t], t).not.toContain('Below the cut line')
    }
    expect(REASON_CODES_OF.Trade).toEqual(['Cost-neutral mix', 'Location strategy', 'Level mix', 'Other'])
    const general = REASON_CODES.filter((r) => r !== 'Cost-neutral mix' && r !== 'Below the cut line')
    for (const t of REQUEST_TYPES.filter((x) => x !== 'Trade')) expect(REASON_CODES_OF[t], t).toEqual(general)
  })

  it('split ";"-separated position IDs', () => {
    expect(splitIds('P-1; P-2;;P-3 ')).toEqual(['P-1', 'P-2', 'P-3'])
    expect(splitIds('')).toEqual([])
    expect(splitIds(null)).toEqual([])
  })
})

describe('sites', () => {
  it('are 13, in 8 countries with 8 currencies and one legal entity per country', () => {
    expect(SITES).toHaveLength(13)
    const countries = new Set(SITES.map((s) => s.country))
    expect(countries.size).toBe(8)
    expect(new Set(SITES.map((s) => s.currency)).size).toBe(8)
    expect(new Set(SITES.map((s) => s.legalEntity)).size).toBe(8)
    for (const c of countries) {
      const here = SITES.filter((s) => s.country === c)
      expect(new Set(here.map((s) => s.legalEntity)).size, c).toBe(1)
      expect(new Set(here.map((s) => s.currency)).size, c).toBe(1)
    }
    expect(siteByLocation.size).toBe(13)
  })

  it('carry the plan’s zones: the location is the zone, and Munich’s factor is 0.61', () => {
    const munich = siteByLocation.get('Munich')!
    expect(munich).toMatchObject({
      country: 'Germany',
      currency: 'EUR',
      legalEntity: 'Northgate Semiconductor GmbH',
      region: 'EMEA',
      zone: 'Munich',
      zoneFactor: 0.61,
    })
    const factors = Object.fromEntries(SITES.map((s) => [s.location, s.zoneFactor]))
    expect(factors).toEqual({
      'San Jose': 1,
      Austin: 0.9,
      Raleigh: 0.88,
      Boulder: 0.9,
      Seattle: 0.97,
      Toronto: 0.72,
      Vancouver: 0.72,
      Munich: 0.61,
      Haifa: 0.7,
      Bengaluru: 0.26,
      Hsinchu: 0.42,
      Shanghai: 0.38,
      'Ho Chi Minh City': 0.2,
    })
    for (const s of SITES) expect(s.zone, s.location).toBe(s.location)
    expect(siteByLocation.get('Bengaluru')?.legalEntity).toBe('Northgate Semiconductor India Pvt. Ltd.')
    expect(siteByLocation.get('San Jose')?.legalEntity).toBe('Northgate Semiconductor Inc.')
  })
})

describe('assumption tables', () => {
  it('describe every table once', () => {
    expect(Object.keys(ASSUMPTION_KEYS)).toEqual([...ASSUMPTION_TABLES])
    for (const t of ASSUMPTION_TABLES) {
      const def = ASSUMPTION_KEYS[t]
      expect(def.table, t).toBe(t)
      expect(def.label.length, t).toBeGreaterThan(0)
      expect(def.note.includes('—'), t).toBe(false)
      expect(def.editors, t).toContain('hr-admin')
      expect(def.unit === 'by part', t).toBe(!!def.parts)
      expect(def.dims.includes('part'), t).toBe(!!def.parts)
    }
  })

  it('write each note for the person setting the table: no doc reference or code key (M4 review CP-6)', () => {
    // Finance > Assumptions shows the note as the table's hint.
    for (const t of ASSUMPTION_TABLES) {
      const { note } = ASSUMPTION_KEYS[t]
      expect(note, t).not.toMatch(/docs\/|PLAN\.md|\.md\b/)
      expect(note.match(/\b[a-z]+[A-Z][A-Za-z]*\b/g) ?? [], t).toEqual([])
      expect(note.charAt(0), t).toBe(note.charAt(0).toUpperCase())
    }
  })

  it('key each table by the dimensions docs/PLAN.md 5.2 lists, with its unit', () => {
    const shape = Object.fromEntries(
      ASSUMPTION_TABLES.map((t) => [t, [ASSUMPTION_KEYS[t].dims.join('|'), ASSUMPTION_KEYS[t].unit]]),
    )
    expect(shape).toEqual({
      band: ['level|zone|fiscalYear', 'local'],
      bonusTarget: ['level', 'fraction'],
      bonusFunding: ['fiscalYear', 'fraction'],
      equity: ['level', 'usd'],
      burden: ['country|component', 'fraction'],
      burdenCap: ['country|component', 'local'],
      benefits: ['country', 'local'],
      severance: ['country', 'months'],
      merit: ['fiscalYear|part', 'by part'],
      promotionPool: ['fiscalYear|part', 'by part'],
      fx: ['currency|set|month', 'usdPerLocal'],
      timeToFill: ['level', 'days'],
      fillRate: ['', 'fraction'],
      attrition: ['', 'fraction'],
      backfillRate: ['', 'fraction'],
      backfillLag: ['', 'months'],
      vacancyFactor: ['', 'fraction'],
      glAccount: ['component', 'code'],
      trade: ['part', 'by part'],
    })
    expect(Object.keys(ASSUMPTION_KEYS.merit.parts!)).toEqual(['date', 'pct', 'cutoff'])
    expect(ASSUMPTION_KEYS.merit.parts!.date.unit).toBe('yyyymmdd')
    expect(Object.keys(ASSUMPTION_KEYS.promotionPool.parts!)).toEqual(['date', 'pct'])
    expect(Object.keys(ASSUMPTION_KEYS.trade.parts!)).toEqual([
      'standardHeadUsd',
      'minFte',
      'fteStep',
      'partTime',
      'dimensions',
      'creditLapse',
    ])
    expect(ASSUMPTION_KEYS.trade.parts!.partTime.dims).toEqual(['location'])
  })

  it('leave caps, merit, promotion pool and the bonus tables to HR admin (docs/PLAN.md 7.4)', () => {
    expect(ASSUMPTION_TABLES.filter(isHrAdminOnly)).toEqual([
      'bonusTarget',
      'bonusFunding',
      'burdenCap',
      'merit',
      'promotionPool',
    ])
    for (const t of ASSUMPTION_TABLES) {
      const { editors } = ASSUMPTION_KEYS[t]
      expect(editors.includes('finance'), t).toBe(!isHrAdminOnly(t))
      expect(
        editors.every((m) => ['hr-admin', 'finance', 'hrbp'].includes(m)),
        t,
      ).toBe(true)
    }
    // HRBP edits only its unit's forecast drivers, in Working (docs/PLAN.md 15.1 R18); attrition is Finance's.
    expect(ASSUMPTION_TABLES.filter((t) => ASSUMPTION_KEYS[t].editors.includes('hrbp'))).toEqual([
      'timeToFill',
      'fillRate',
      'backfillRate',
      'backfillLag',
    ])
  })

  it('join and split keys with "|", and key org-only tables with *', () => {
    expect(assumptionKey(['P4', 'Munich', 'FY27'])).toBe('P4|Munich|FY27')
    expect(assumptionKey(['FY28', 'date'])).toBe('FY28|date')
    expect(assumptionKey([])).toBe(ASSUMPTION_ANY_KEY)
    expect(ASSUMPTION_ANY_KEY).toBe('*')
    expect(splitAssumptionKey('EUR|plan|2026-09')).toEqual(['EUR', 'plan', '2026-09'])
    expect(splitAssumptionKey('partTime | Bengaluru')).toEqual(['partTime', 'Bengaluru'])
  })
})

describe('views and pages', () => {
  it('are the eight views in folder-tab order and the three masthead pages', () => {
    expect(VIEW_KEYS).toEqual([
      'home',
      'team',
      'plan',
      'requests',
      'forecast',
      'targets',
      'whatif',
      'finance',
    ])
    expect(VIEW_LABEL.whatif).toBe('What if')
    expect(VIEW_LABEL.team).toBe('My team')
    expect(PAGE_KEYS).toEqual(['data', 'actions', 'audit'])
    expect(PAGE_LABEL.data).toBe('Data room')
  })

  it('validate route names, own keys only', () => {
    expect(isViewKey('plan')).toBe(true)
    expect(isViewKey('data')).toBe(false)
    expect(isPageKey('audit')).toBe(true)
    expect(isRouteView('actions')).toBe(true)
    expect(isRouteView('whatif')).toBe(true)
    for (const v of ['toString', 'constructor', '__proto__', 'scorecard', 'dev', '', null])
      expect(isRouteView(v), String(v)).toBe(false)
  })
})
