/**
 * Reading workspace files (docs/PLAN.md 5.5, 16.2 "workspace (25 MB, checksum, `__proto__`, newer
 * version, hash mismatch ...)"): every refusal with its sentence, the round trip of each kind with
 * typed arrays restored, known keys only, and Import requests' field-by-field read.
 */
import { describe, expect, it } from 'vitest'
import { appendEntry } from '../audit/chain'
import { hcRequest, positionRow } from '../engine/fixtures/common'
import { planLineRows, toPlanLineTable } from '../engine/lineTable'
import { lockHash, verifyLock } from '../engine/versions'
import type {
  AuditEntry,
  HcRequest,
  LockedVersion,
  LockedVersionRef,
  MonthClose,
  PlanLineTable,
  PlanState,
  WorkspaceFile,
} from '../types'
import {
  type BuildFileInput,
  buildWorkspaceFile,
  MAX_FULL_FILE_BYTES,
  MAX_WORKSPACE_BYTES,
  serializeWorkspace,
  workspaceChecksum,
} from './file'
import {
  brokenPartText,
  DAMAGED_TEXT,
  FOREIGN_TEXT,
  FULL_TOO_LARGE_TEXT,
  hashMismatchText,
  lockBrokenText,
  NEWER_TEXT,
  NO_REQUESTS_TEXT,
  NOT_JSON_TEXT,
  readRequest,
  readWorkspace,
  requestsOf,
  TOO_LARGE_TEXT,
  unsafeKeyText,
} from './validate'

/* ───────────── fixtures ───────────── */

const col = <T extends string>(values: T[]) => {
  const dict = [...new Set(values)]
  return { dict, codes: Uint32Array.from(values.map((v) => dict.indexOf(v))) }
}
const nums = (n: number, v: number) => Float64Array.from({ length: n }, () => v)

function lineTable(): PlanLineTable {
  return {
    length: 2,
    versionId: 'fy27-budget',
    positionId: col(['P-1', 'P-1']),
    holderId: col(['E-1', 'E-1']),
    month: col(['2026-04', '2026-05']),
    status: col(['Filled', 'Filled']),
    currency: col(['EUR', 'EUR']),
    basis: col(['hris', 'hris']),
    numbers: {
      heads: nums(2, 1),
      fte: nums(2, 1),
      active: nums(2, 1),
      rate: nums(2, 1.08),
      localBase: nums(2, 9166.666666666666),
      localBonus: nums(2, 916.67),
      localBurden: nums(2, 1925),
      localBenefits: nums(2, 0),
      localOneTime: nums(2, 0),
      localVacancy: nums(2, 0),
      usdBase: nums(2, 9900),
      usdBonus: nums(2, 990),
      usdBurden: nums(2, 2079),
      usdBenefits: nums(2, 0),
      usdOneTime: nums(2, 0),
      usdVacancy: nums(2, 0),
      usdEquity: nums(2, 0),
      usdLoaded: nums(2, 12969),
    },
  }
}

const BUDGET_ASSUMPTIONS: LockedVersion['assumptions'] = [
  { version: 'fy27-budget', table: 'band', org: null, key: 'P4|Munich|FY27', value: 110_000 },
]
const BUDGET_RATES: LockedVersion['rates'] = [
  { currency: 'EUR', set: 'plan', month: '2026-04', usdPerLocal: 1.08 },
]

/**
 * The Budget's own lock hash (M3 recheck: a Full file's locked versions must verify over their own
 * lines, so the fixture's hash is a real one).
 */
const BUDGET_HASH = lockHash({
  lines: lineTable(),
  assumptions: BUDGET_ASSUMPTIONS,
  rates: BUDGET_RATES,
  proration: 'daily',
  engineVersion: 'hcp-engine-1',
})

const BUDGET_REF: LockedVersionRef = {
  versionId: 'fy27-budget',
  name: 'FY27 Budget',
  kind: 'budget',
  fiscalYear: 'FY27',
  state: 'locked',
  hash: BUDGET_HASH,
}

const budget = (): LockedVersion => ({
  versionId: 'fy27-budget',
  name: 'FY27 Budget',
  kind: 'budget',
  fiscalYear: 'FY27',
  grid: { from: '2026-04', to: '2027-03' },
  proration: 'daily',
  state: 'locked',
  createdAt: '2026-03-31T09:00',
  lockedAt: '2026-03-31T09:00',
  lockedBy: 'E10500',
  engineVersion: 'hcp-engine-1',
  parentId: 'fy27-working',
  hash: BUDGET_HASH,
  lines: lineTable(),
  assumptions: BUDGET_ASSUMPTIONS,
  rates: BUDGET_RATES,
  forecast: null,
})

const close = (): MonthClose => {
  const byPosition = Object.create(null) as Record<string, string>
  byPosition['P-1'] = 'P-LEAD'
  return {
    month: '2026-04',
    closedAt: '2026-05-04T09:00',
    by: 'E10500',
    lines: {
      length: 1,
      employeeId: col(['E-1']),
      positionId: col(['P-1']),
      month: col(['2026-04']),
      currency: col(['EUR']),
      leave: col(['none']),
      numbers: Object.fromEntries(
        Object.keys(lineTable().numbers).map((k) => [k, nums(1, 2)]),
      ) as unknown as PlanLineTable['numbers'],
    },
    atoms: {
      closeDate: '2026-04-30',
      atoms: [
        {
          atomId: 'P-LEAD',
          kind: 'leader',
          leaderPositionId: 'P-LEAD',
          businessUnit: 'Silicon Engineering',
          department: null,
          positionIds: ['P-1', 'P-LEAD'],
        },
      ],
      byPosition,
    },
    hash: 'sha256-close-april',
  }
}

const trade = (): HcRequest =>
  hcRequest('R-T1', {
    type: 'Trade',
    reasonCode: 'Cost-neutral mix',
    level: 'P3',
    location: 'Bengaluru',
    fte: 1,
    startDate: '2027-01-01',
    steps: [
      {
        n: 1,
        role: 'manager',
        approverId: 'E1',
        reasons: ['always'],
        enteredAt: '2026-09-01T09:00',
        decision: 'Approved',
        at: '2026-09-02T09:00',
        note: null,
      },
      {
        n: 2,
        role: 'leader',
        approverId: 'E2',
        reasons: ['band-estimate-over-threshold', 'out-of-plan'],
        enteredAt: '2026-09-02T09:00',
        decision: null,
        at: null,
        note: null,
      },
    ],
    comments: [
      {
        id: 'C-1',
        at: '2026-09-01T10:00',
        by: 'E1110',
        mode: 'manager',
        text: 'Two hires in Jan',
        audience: 'everyone',
      },
    ],
    trade: {
      givePositionIds: ['P-5'],
      giveOrgPositionId: 'P-GTM-MGR',
      creditUsedBp: 0,
      count: 8,
      jobFamily: 'Engineering',
      partTimeRest: false,
      restFte: null,
      rateVersion: 'fy27-q1-reforecast',
      rateHash: 'sha256-q1',
      giveBp: 19_160,
      getBp: 18_056,
      creditBp: 1_104,
    },
  })

const transfer = (): HcRequest =>
  hcRequest('R-X1', {
    type: 'Transfer',
    reasonCode: 'Restructure',
    positionId: 'P-7',
    changes: {
      by: 'E10077',
      at: '2026-09-03T09:00',
      reason: 'Later start',
      changes: [{ field: 'startDate', old: '2026-10-01', new: '2026-11-01' }],
    },
    transfer: {
      kind: 'internal',
      personId: 'E-7',
      fromPositionId: 'P-7',
      toManagerPositionId: null,
      toPositionId: 'P-8',
      effectiveDate: '2026-10-01',
      moveBudget: true,
    },
    outcome: { createdPositionIds: [], changedPositionIds: ['P-7', 'P-8'] },
    exception: { freezeId: 'F-1', reason: 'Customer launch' },
  })

function auditLog(): AuditEntry[] {
  const out: AuditEntry[] = []
  for (let i = 1; i <= 3; i++)
    out.push(
      appendEntry(out.at(-1) ?? null, {
        at: `2026-09-0${i}T09:00`,
        by: 'E10077',
        byName: 'Priya',
        mode: 'hrbp',
        object: 'request',
        id: `R-${i}`,
        field: 'state',
        old: i === 2 ? undefined : 'Submitted',
        new: { state: 'In review', step: i },
        effectiveDate: null,
        comment: i === 3 ? 'Looks right' : null,
        commentAudience: i === 3 ? 'everyone' : null,
      }),
    )
  return out
}

const fullState = (): PlanState => ({
  v: 1,
  baselineId: 'sample-2026-09-30',
  versions: [
    {
      versionId: 'fy27-working',
      name: 'FY27 Working',
      kind: 'working',
      fiscalYear: 'FY27',
      grid: { from: '2026-04', to: '2027-03' },
      proration: 'daily',
      state: 'working',
      createdAt: '2026-03-20T09:00',
      lockedAt: null,
      lockedBy: null,
      engineVersion: 'hcp-engine-1',
      parentId: null,
      hash: null,
    },
    budget(),
  ],
  closes: [close()],
  adjustments: [
    {
      id: 'ADJ-1',
      postedIn: '2026-10',
      forMonth: '2026-08',
      positionId: null,
      kind: 'hire',
      reason: 'Back-dated hire',
      delta: {
        employeeId: 'E-9',
        positionId: null,
        month: '2026-08',
        heads: 1,
        fte: 1,
        active: 0.5,
        currency: 'USD',
        rate: 1,
        local: { base: 1, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
        usd: { base: 1, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0, equity: 0, loaded: 1 },
        leave: 'none',
      },
    },
  ],
  overlay: {
    positions: [
      positionRow('P-NEW', { status: 'Planned', startDate: '2027-01-01', sourceRequestId: 'R-T1' }),
    ],
    targets: [{ fiscalYear: 'FY27', businessUnit: 'Go-to-Market', targetHeads: 40, targetCost: 8_000_000 }],
    freezes: [
      {
        freezeId: 'F-1',
        businessUnit: 'Operations',
        startDate: '2026-08-01',
        endDate: null,
        allowBackfill: true,
      },
    ],
    assumptions: [{ version: 'fy27-working', table: 'fx', org: null, key: 'EUR|plan|2026-10', value: 1.1 }],
  },
  requests: [hcRequest('R-1'), trade(), transfer()],
  cycles: [
    {
      cycleId: 'FY28',
      fiscalYear: 'FY28',
      stage: 'Open for asks',
      openedAt: '2026-09-15T09:00',
      openedBy: 'E10500',
      dates: { asksDue: '2026-10-16', hrbpReviewDue: null, leaderReviewDue: null, financeReviewDue: null },
      hrbpDone: [],
      leaderDone: [],
      cutLines: [{ businessUnit: 'Silicon Engineering', afterHeads: 40 }],
      lockedAt: null,
      lockedBy: null,
    },
  ],
  reviewed: [{ exceptionId: 'not-in-plan:E-9', at: '2026-10-02T09:00', by: 'E10500' }],
  mergeBase: [{ requestId: 'R-1', updatedAt: '2026-09-01T09:00' }],
  auditHead: { seq: 3, hash: auditLog()[2].hash },
})

const baseInput = (over: Partial<BuildFileInput> = {}): BuildFileInput => ({
  kind: 'shareable',
  savedAt: '2026-10-13T10:00',
  mode: 'hrbp',
  scopeLabel: 'Silicon Engineering',
  actingAs: true,
  plan: {
    kind: 'shareable',
    requests: [hcRequest('R-1'), trade()],
    cycles: fullState().cycles,
    versions: [BUDGET_REF],
    closes: [{ month: '2026-04', closedAt: '2026-05-04T09:00', hash: 'sha256-close-april' }],
    audit: [{ ...auditLog()[0], seq: undefined, prevHash: undefined, hash: undefined } as never],
    models: { 'plan.heads.approved': 412, 'targets.gap': [{ org: 'Silicon Engineering', heads: -18 }] },
  },
  lockedVersions: [BUDGET_REF],
  ...over,
})

const fullInput = (): BuildFileInput =>
  baseInput({
    kind: 'full',
    mode: 'hr-admin',
    actingAs: false,
    plan: { kind: 'full', state: fullState(), audit: auditLog() },
    datasets: {
      positions: [positionRow('P-1', { level: 'P4', location: 'Munich', fte: 0.6 })],
      requests: [
        {
          requestId: 'R-1',
          type: 'New role',
          state: 'Submitted',
          reasonCode: 'Growth',
          requesterId: 'E1110',
          businessUnit: 'Go-to-Market',
          steps: [{ role: 'Manager', approverId: 'E1', decision: 'Approved', at: '2026-08-03' }],
          restFte: null,
        },
      ],
      workers: [],
    },
  })

const textOf = (file: WorkspaceFile) => serializeWorkspace(file)
const read = (text: string, locked: readonly LockedVersionRef[] = [BUDGET_REF]) =>
  readWorkspace(text, new TextEncoder().encode(text).length, locked)

/** Parsed JSON of a hand-edited file: untyped on purpose. */
// biome-ignore lint/suspicious/noExplicitAny: a hand-edited file is untyped JSON
type Raw = Record<string, any>

/** A file's text after `edit` changes its parsed form, with the checksum recomputed (a hand-made file). */
function crafted(file: WorkspaceFile, edit: (raw: Raw) => void): string {
  const raw = JSON.parse(serializeWorkspace(file))
  edit(raw)
  raw.checksum = workspaceChecksum(raw.body)
  return JSON.stringify(raw)
}

/* ───────────── tests ───────────── */

describe('readWorkspace: round trips', () => {
  it('reads back a Shareable file as it was built', () => {
    const file = buildWorkspaceFile(baseInput())
    const r = read(textOf(file))
    expect(r).toEqual({ ok: true, file })
  })

  it('reads back a Requests file', () => {
    const file = buildWorkspaceFile(
      baseInput({
        kind: 'requests',
        mode: 'manager',
        plan: { kind: 'requests', requests: [hcRequest('R-1'), transfer()] },
      }),
    )
    expect(read(textOf(file))).toEqual({ ok: true, file })
  })

  it('reads back a Full file with typed-array columns restored and the audit chain intact', () => {
    const file = buildWorkspaceFile(fullInput())
    const r = read(textOf(file))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.file).toEqual(file)
    const plan = r.file.body.plan
    if (plan.kind !== 'full') throw new Error('not full')
    const locked = plan.state.versions[1] as LockedVersion
    expect(locked.lines.numbers.usdLoaded).toBeInstanceOf(Float64Array)
    expect(locked.lines.positionId.codes).toBeInstanceOf(Uint32Array)
    expect(plan.state.closes[0].lines.numbers.heads).toBeInstanceOf(Float64Array)
    expect(Object.getPrototypeOf(plan.state.closes[0].atoms.byPosition)).toBeNull()
    expect(plan.audit.map((e) => e.hash)).toEqual(auditLog().map((e) => e.hash))
    expect(r.file.notice).toBe('Contains individual pay')
    expect(r.file.body.datasets?.requests?.[0]).toMatchObject({
      steps: [{ role: 'Manager', decision: 'Approved' }],
    })
  })

  it('accepts a file at exactly 25 MB', () => {
    const text = textOf(buildWorkspaceFile(baseInput()))
    expect(readWorkspace(text, MAX_WORKSPACE_BYTES, [BUDGET_REF]).ok).toBe(true)
  })
})

describe('readWorkspace: line tables in Full files (C35)', () => {
  /** A Budget whose hash is its own lock hash, so `verifyLock` can be checked after the round trip. */
  const hashed = (): LockedVersion => {
    const v = budget()
    return {
      ...v,
      hash: lockHash({
        lines: v.lines,
        assumptions: v.assumptions,
        rates: v.rates,
        proration: v.proration,
        engineVersion: v.engineVersion,
      }),
    }
  }
  const fileWith = (v: LockedVersion) =>
    buildWorkspaceFile({
      ...fullInput(),
      lockedVersions: [],
      plan: {
        kind: 'full',
        state: { ...fullState(), versions: [fullState().versions[0], v] },
        audit: auditLog(),
      },
    })
  const lockedOf = (file: WorkspaceFile): LockedVersion => {
    const plan = file.body.plan
    if (plan.kind !== 'full') throw new Error('not full')
    return plan.state.versions[1] as LockedVersion
  }

  it('reads amounts written as integer cents, and the lock hash still verifies', () => {
    const v = hashed()
    const text = textOf(fileWith(v))
    expect(text).toContain('"localBase":[916667,916667]')
    const r = readWorkspace(text, text.length, [])
    if (!r.ok) throw new Error(r.reason)
    const back = lockedOf(r.file)
    expect(back.lines.numbers.localBase).toEqual(Float64Array.from([9166.67, 9166.67]))
    expect(back.lines.numbers.rate).toEqual(Float64Array.from([1.08, 1.08]))
    expect(back.hash).toBe(v.hash)
    expect(verifyLock(back)).toBe(true)
  })

  it('still reads a Full file written before C35, every number exact under `numbers`', () => {
    const v = hashed()
    const text = crafted(fileWith(v), (raw) => {
      const lines = raw.body.plan.state.versions[1].lines
      lines.numbers = Object.fromEntries(Object.entries(v.lines.numbers).map(([k, c]) => [k, Array.from(c)]))
      delete lines.cents
    })
    const r = readWorkspace(text, text.length, [])
    if (!r.ok) throw new Error(r.reason)
    const back = lockedOf(r.file)
    expect(back.lines.numbers.localBase).toEqual(Float64Array.from([9166.666666666666, 9166.666666666666]))
    expect(verifyLock(back)).toBe(true)
  })

  it('reads a locked version whose lines are written as rows', () => {
    const v = hashed()
    const rows = [...planLineRows(v.lines)]
    const text = crafted(fileWith(v), (raw) => {
      raw.body.plan.state.versions[1].lines = rows.reverse()
    })
    const r = readWorkspace(text, text.length, [])
    if (!r.ok) throw new Error(r.reason)
    const back = lockedOf(r.file)
    expect(back.lines).toEqual(toPlanLineTable('fy27-budget', rows))
    expect(verifyLock(back)).toBe(true)
  })

  it('refuses a cent that is not a whole number, naming it', () => {
    const text = crafted(fileWith(hashed()), (raw) => {
      raw.body.plan.state.versions[1].lines.cents.usdBase[1] = 990000.5
    })
    expect(readWorkspace(text, text.length, [])).toEqual({
      ok: false,
      reason: brokenPartText('body.plan.state.versions[1].lines.cents.usdBase[1]'),
    })
  })
})

describe('readWorkspace: refusals', () => {
  const good = () => buildWorkspaceFile(baseInput())

  it('refuses a Shareable or Requests file over 25 MB, before reading it', () => {
    expect(readWorkspace(textOf(good()), MAX_WORKSPACE_BYTES + 1, [])).toEqual({
      ok: false,
      reason: TOO_LARGE_TEXT,
    })
    const requests = buildWorkspaceFile(
      baseInput({ kind: 'requests', plan: { kind: 'requests', requests: [] } }),
    )
    expect(readWorkspace(textOf(requests), MAX_WORKSPACE_BYTES + 1, [])).toEqual({
      ok: false,
      reason: TOO_LARGE_TEXT,
    })
    expect(TOO_LARGE_TEXT).toBe(
      'This file is larger than 25 MB, the most a Shareable or Requests file can be. Nothing was imported.',
    )
  })

  it('reads a Full file over 25 MB and refuses one over 150 MB (C35)', () => {
    const text = textOf(buildWorkspaceFile(fullInput()))
    expect(readWorkspace(text, MAX_WORKSPACE_BYTES + 1, [BUDGET_REF]).ok).toBe(true)
    expect(readWorkspace(text, MAX_FULL_FILE_BYTES, [BUDGET_REF]).ok).toBe(true)
    expect(readWorkspace(text, MAX_FULL_FILE_BYTES + 1, [BUDGET_REF])).toEqual({
      ok: false,
      reason: FULL_TOO_LARGE_TEXT,
    })
    expect(FULL_TOO_LARGE_TEXT).toBe(
      'This file is larger than 150 MB, the most a Full file can be. Nothing was imported.',
    )
  })

  it('refuses a file over 25 MB whose header says Full when its parsed kind is not', () => {
    // The header is peeked before parsing; the kind is checked again once the file is parsed.
    const text = textOf(good()).replace('"kind": "shareable"', '"kind": "full", "kind": "shareable"')
    expect(readWorkspace(text, MAX_WORKSPACE_BYTES + 1, [])).toEqual({ ok: false, reason: TOO_LARGE_TEXT })
  })

  it('refuses text that is not JSON', () => {
    expect(read('{ "format": "hcplan", ')).toEqual({ ok: false, reason: NOT_JSON_TEXT })
    expect(read('')).toEqual({ ok: false, reason: NOT_JSON_TEXT })
  })

  it('refuses __proto__, constructor and prototype keys anywhere, and pollutes nothing', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const top = textOf(good()).replace('{ "format"', `{ "${key}": { "polluted": true }, "format"`)
      expect(read(top), key).toEqual({ ok: false, reason: unsafeKeyText(key) })
      const deep = crafted(good(), (raw) => {
        raw.body.plan.requests[0] = JSON.parse(`{ "${key}": { "polluted": true }, "requestId": "R-9" }`)
      })
      expect(read(deep), key).toEqual({ ok: false, reason: unsafeKeyText(key) })
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(unsafeKeyText('__proto__')).toBe(
      'This file holds a key that is not allowed ("__proto__"). Nothing was imported.',
    )
  })

  it('refuses a foreign format', () => {
    for (const text of [
      '[]',
      '"hcplan"',
      JSON.stringify({ kind: 'hcp-settings', version: 1, settings: {} }),
      textOf(good()).replace('"format": "hcplan"', '"format": "xlsx"'),
      textOf(good()).replace('"app": "Headcount Planner"', '"app": "Another app"'),
      textOf(good()).replace('"version": 1', '"version": "1"'),
    ])
      expect(read(text)).toEqual({ ok: false, reason: FOREIGN_TEXT })
  })

  it('refuses a newer version', () => {
    expect(read(textOf(good()).replace('"version": 1', '"version": 2'))).toEqual({
      ok: false,
      reason: NEWER_TEXT,
    })
  })

  it('refuses a file whose body no longer matches its checksum', () => {
    const text = textOf(good())
    expect(read(text.replace('"plan.heads.approved": 412', '"plan.heads.approved": 413'))).toEqual({
      ok: false,
      reason: DAMAGED_TEXT,
    })
    expect(read(text.replace(/"checksum": "sha256-[0-9a-f]+"/, '"checksum": "sha256-0"'))).toEqual({
      ok: false,
      reason: DAMAGED_TEXT,
    })
  })

  it('refuses a file whose locked version differs from the workspace by hash', () => {
    const r = read(textOf(good()), [{ ...BUDGET_REF, hash: 'sha256-budget-b' }])
    expect(r).toEqual({ ok: false, reason: hashMismatchText('FY27 Budget') })
    expect(hashMismatchText('FY27 Budget')).toBe(
      "This file's FY27 Budget does not match this workspace's (hash differs). Nothing was imported.",
    )
    // A Budget is the year's one Budget even under another ID.
    expect(read(textOf(good()), [{ ...BUDGET_REF, versionId: 'budget-2027', hash: 'sha256-x' }]).ok).toBe(
      false,
    )
    // A Full file's own locked versions are checked too.
    const full = buildWorkspaceFile({ ...fullInput(), lockedVersions: [] })
    expect(read(textOf(full), [{ ...BUDGET_REF, hash: 'sha256-budget-b' }])).toEqual({
      ok: false,
      reason: hashMismatchText('FY27 Budget'),
    })
  })

  it('reads a file whose locked versions match, or that the workspace does not have', () => {
    expect(read(textOf(good()), [BUDGET_REF]).ok).toBe(true)
    expect(read(textOf(good()), []).ok).toBe(true)
    expect(
      read(textOf(good()), [
        { ...BUDGET_REF, fiscalYear: 'FY28', versionId: 'fy28-budget', hash: 'sha256-z' },
      ]).ok,
    ).toBe(true)
  })

  it('refuses a hand-made file with a broken part, naming the part', () => {
    const full = buildWorkspaceFile(fullInput())
    const cases: [string, (raw: Raw) => void][] = [
      [
        'body.plan.state.versions[1].lines.positionId.codes',
        (raw) => raw.body.plan.state.versions[1].lines.positionId.codes.push(0),
      ],
      [
        'body.plan.state.versions[1].lines.cents.usdLoaded[0]',
        (raw) => {
          raw.body.plan.state.versions[1].lines.cents.usdLoaded[0] = 'x'
        },
      ],
      [
        'body.plan.state.versions[1].lines.numbers.rate[0]',
        (raw) => {
          raw.body.plan.state.versions[1].lines.numbers.rate[0] = 'x'
        },
      ],
      [
        'body.plan.state.requests[1].trade.count',
        (raw) => {
          raw.body.plan.state.requests[1].trade.count = '8'
        },
      ],
      [
        'body.plan.state.requests[0].state',
        (raw) => {
          raw.body.plan.state.requests[0].state = 'Done'
        },
      ],
      [
        'body.plan.state.versions[0].hash',
        (raw) => {
          raw.body.plan.state.versions[0].hash = 'sha256-working'
        },
      ],
      [
        'body.datasets.positions[0].level',
        (raw) => {
          raw.body.datasets.positions[0].level = 'L4'
        },
      ],
      [
        'body.datasets.positions[0].positionId',
        (raw) => {
          delete raw.body.datasets.positions[0].positionId
        },
      ],
      [
        'body.datasets.salaries',
        (raw) => {
          raw.body.datasets.salaries = []
        },
      ],
      [
        'body.plan.audit[1].seq',
        (raw) => {
          raw.body.plan.audit[1].seq = 0
        },
      ],
      [
        'body.plan.kind',
        (raw) => {
          raw.kind = 'shareable'
          delete raw.body.datasets
        },
      ],
    ]
    for (const [path, edit] of cases)
      expect(read(crafted(full, edit)), path).toEqual({ ok: false, reason: brokenPartText(path) })
  })

  it('refuses datasets in a Shareable file', () => {
    const text = crafted(good(), (raw) => {
      raw.body.datasets = { positions: [] }
    })
    expect(read(text)).toEqual({ ok: false, reason: brokenPartText('body.datasets') })
  })
})

describe('readWorkspace: a cycle’s ranked order (M3, `Cycle.order`)', () => {
  const ranked = (): BuildFileInput => {
    const full = fullInput()
    const state = (full.plan as { state: PlanState }).state
    return {
      ...full,
      plan: {
        kind: 'full',
        state: {
          ...state,
          cycles: state.cycles.map((c) => ({
            ...c,
            order: [{ businessUnit: 'Silicon Engineering', requestIds: ['R-2', 'R-1'] }],
          })),
        },
        audit: auditLog(),
      },
    }
  }

  it('reads each unit’s order back as it was built', () => {
    const file = buildWorkspaceFile(ranked())
    const r = read(textOf(file))
    expect(r).toEqual({ ok: true, file })
    if (!r.ok) return
    const plan = r.file.body.plan as { state: PlanState }
    expect(plan.state.cycles[0].order).toEqual([
      { businessUnit: 'Silicon Engineering', requestIds: ['R-2', 'R-1'] },
    ])
  })

  it('reads a cycle with no order as one with none (files made before M3)', () => {
    const r = read(textOf(buildWorkspaceFile(fullInput())))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect('order' in (r.file.body.plan as { state: PlanState }).state.cycles[0]).toBe(false)
  })

  it('refuses an order that is not a list of units and request IDs, naming the part', () => {
    for (const bad of [{ businessUnit: 'X' }, { businessUnit: 'X', requestIds: [''] }, 'R-1'] as unknown[]) {
      const text = crafted(buildWorkspaceFile(ranked()), (raw) => {
        raw.body.plan.state.cycles[0].order = [bad]
      })
      const r = read(text)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.reason).toContain('body.plan.state.cycles[0].order[0]')
    }
  })
})

describe('readWorkspace: known keys only', () => {
  it('drops keys a workspace file does not have, everywhere', () => {
    const text = crafted(buildWorkspaceFile(fullInput()), (raw) => {
      raw.extra = 'x'
      raw.body.extra = 'x'
      raw.body.datasets.positions[0].salary = 150_000
      raw.body.plan.state.requests[0].salary = 150_000
      raw.body.plan.state.versions[0].note = 'x'
      raw.body.plan.state.overlay.positions[0].baseSalary = 1
    })
    const r = read(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const json = JSON.stringify(r.file)
    expect(json).not.toContain('salary')
    expect(json).not.toContain('baseSalary')
    expect(json).not.toContain('"extra"')
    expect(json).not.toContain('"note":"x"')
  })
})

describe('readRequest and requestsOf', () => {
  it('reads requests from Requests and Shareable files, refusing other kinds', () => {
    const req = buildWorkspaceFile(
      baseInput({ kind: 'requests', plan: { kind: 'requests', requests: [hcRequest('R-1'), trade()] } }),
    )
    expect(requestsOf(req)).toEqual({
      ok: true,
      kind: 'requests',
      requests: [hcRequest('R-1'), trade()],
      skipped: 0,
    })
    expect(requestsOf(buildWorkspaceFile(baseInput()))).toMatchObject({
      ok: true,
      kind: 'shareable',
      skipped: 0,
    })
    expect(requestsOf(buildWorkspaceFile(fullInput()))).toEqual({ ok: false, reason: NO_REQUESTS_TEXT })
    expect(NO_REQUESTS_TEXT).toBe('This file has no requests to merge.')
  })

  it('keeps a trade’s "Move target too?" choice and its credit before and after a change (M3 verify)', () => {
    const approved: HcRequest = {
      ...trade(),
      state: 'Approved with changes',
      changes: {
        by: 'E2',
        at: '2026-09-03T09:00',
        reason: 'Fewer seats this year',
        changes: [{ field: 'count', old: 8, new: 6 }],
        credit: { old: 1_104, new: 5_618 },
      },
      trade: { ...(trade().trade as NonNullable<HcRequest['trade']>), count: 6, moveTarget: false },
    }
    const file = buildWorkspaceFile(
      baseInput({ kind: 'requests', plan: { kind: 'requests', requests: [approved] } }),
    )
    const r = read(textOf(file))
    expect(r).toEqual({ ok: true, file })
    if (!r.ok) return
    const got = requestsOf(r.file)
    expect(got.ok && got.requests[0]?.trade?.moveTarget).toBe(false)
    expect(got.ok && got.requests[0]?.changes?.credit).toEqual({ old: 1_104, new: 5_618 })
    // A file with neither key reads neither (files made before the fix).
    const plain = read(
      textOf(
        buildWorkspaceFile(baseInput({ kind: 'requests', plan: { kind: 'requests', requests: [trade()] } })),
      ),
    )
    const plainReqs = plain.ok ? requestsOf(plain.file) : null
    expect(plainReqs).toMatchObject({ requests: [trade()] })
    const plainTrade = plainReqs?.ok ? plainReqs.requests[0]?.trade : null
    expect(plainTrade && 'moveTarget' in plainTrade).toBe(false)
  })

  it('skips a request missing a required field and ignores every other key', () => {
    const file = buildWorkspaceFile(
      baseInput({
        kind: 'requests',
        plan: { kind: 'requests', requests: [hcRequest('R-1'), hcRequest('R-2'), trade()] },
      }),
    )
    const text = crafted(file, (raw) => {
      delete raw.body.plan.requests[0].requesterId
      raw.body.plan.requests[1].businessUnit = ''
      raw.body.plan.requests[2].offerBase = 95_000
      raw.body.plan.requests.push('not a request', { requestId: 'R-9' })
    })
    const r = read(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const got = requestsOf(r.file)
    expect(got).toEqual({ ok: true, kind: 'requests', requests: [trade()], skipped: 4 })
    expect(JSON.stringify(got)).not.toContain('offerBase')
  })

  it('fills blanks for missing optional fields', () => {
    const minimal = {
      requestId: 'R-5',
      type: 'Elimination',
      state: 'Draft',
      reasonCode: 'Cost reduction',
      requesterId: 'E1',
      businessUnit: 'Operations',
      submittedAt: '2026-09-01T09:00',
    }
    expect(readRequest(minimal)).toEqual({
      ...hcRequest('R-5', {
        type: 'Elimination',
        state: 'Draft',
        reasonCode: 'Cost reduction',
        requesterId: 'E1',
        businessUnit: 'Operations',
        managerPositionId: '',
        department: null,
      }),
      updatedAt: '2026-09-01T09:00',
    })
    expect(readRequest({ ...minimal, submittedAt: undefined })?.updatedAt).toBe('')
  })

  it('refuses a field of the wrong type or value', () => {
    const ok = hcRequest('R-1')
    expect(readRequest(ok)).toEqual(ok)
    for (const bad of [
      { ...ok, type: 'Promotion' },
      { ...ok, reasonCode: 'Because' },
      { ...ok, level: 'L4' },
      { ...ok, fte: '1' },
      { ...ok, confidential: 'no' },
      { ...ok, steps: [{ n: 1 }] },
      { ...ok, comments: [{ id: 'C', at: 'x', by: 'E', mode: 'boss', text: 't', audience: 'everyone' }] },
      { ...ok, trade: { givePositionIds: 'P-1;P-2', count: 1 } },
      null,
      [],
      'R-1',
    ])
      expect(readRequest(bad)).toBeNull()
  })

  it('reads times only as ISO dates or date-times, and skips and counts a request whose time is not (IN-12)', () => {
    const ok = hcRequest('R-1')
    for (const at of [
      '2026-09-23',
      '2026-09-23T14:05',
      '2026-09-30T09:01:00.000Z',
      '2026-10-02T11:00:00+02:00',
    ])
      expect(readRequest({ ...ok, updatedAt: at }), at).toEqual({ ...ok, updatedAt: at })
    const comment = {
      id: 'C',
      at: '2026-09-23T14:05',
      by: 'E',
      mode: 'manager',
      text: 't',
      audience: 'everyone',
    }
    const step = {
      n: 1,
      role: 'hrbp',
      approverId: 'E',
      reasons: [],
      enteredAt: null,
      decision: null,
      at: null,
    }
    for (const bad of [
      { ...ok, updatedAt: 'zzz' },
      { ...ok, updatedAt: '2026-02-30T10:00Z' },
      { ...ok, updatedAt: '2026-09-23 14:05' },
      { ...ok, updatedAt: '2026-09-23T25:00' },
      { ...ok, submittedAt: 'yesterday' },
      { ...ok, comments: [{ ...comment, at: 'last week' }] },
      { ...ok, steps: [{ ...step, enteredAt: '23/09/2026' }] },
      { ...ok, steps: [{ ...step, at: 'soon' }] },
    ])
      expect(readRequest(bad), JSON.stringify(bad)).toBeNull()
    const file = buildWorkspaceFile(
      baseInput({
        kind: 'requests',
        plan: { kind: 'requests', requests: [hcRequest('R-2'), hcRequest('R-3')] },
      }),
    )
    const text = crafted(file, (raw) => {
      raw.body.plan.requests[1].updatedAt = 'zzz'
    })
    const r = read(text)
    if (!r.ok) throw new Error(r.reason)
    expect(requestsOf(r.file)).toMatchObject({ ok: true, skipped: 1, requests: [{ requestId: 'R-2' }] })
  })
})

describe('readWorkspace: the request ID tag (D-ID)', () => {
  const withTag = (idTag: unknown) =>
    crafted(buildWorkspaceFile(fullInput()), (raw) => {
      raw.body.plan.state.idTag = idTag
    })

  it("reads a Full file's tag back, and a state with none as one with none", () => {
    const r = read(withTag('K7QM'))
    if (!r.ok || r.file.body.plan.kind !== 'full') throw new Error('not read')
    expect(r.file.body.plan.state.idTag).toBe('K7QM')
    const none = read(textOf(buildWorkspaceFile(fullInput())))
    if (!none.ok || none.file.body.plan.kind !== 'full') throw new Error('not read')
    expect('idTag' in none.file.body.plan.state).toBe(false)
  })

  it('refuses a tag that is not one, naming the part', () => {
    for (const bad of ['k7qm', 'ABCDE', 'IL0U', 7])
      expect(read(withTag(bad)), String(bad)).toEqual({
        ok: false,
        reason: brokenPartText('body.plan.state.idTag'),
      })
  })
})

describe('readWorkspace: the M3 recheck', () => {
  const locked = (r: ReturnType<typeof read>): LockedVersion | null =>
    r.ok && r.file.body.plan.kind === 'full'
      ? ((r.file.body.plan.state.versions.find((v) => v.state === 'locked') as LockedVersion) ?? null)
      : null

  it('refuses a Full file whose locked lines no longer match their own lock hash, checksum written again', () => {
    const good = read(textOf(buildWorkspaceFile(fullInput())))
    expect(good.ok).toBe(true)
    expect(verifyLock(locked(good) as LockedVersion)).toBe(true)
    // One amount of the FY27 Budget raised by a dollar, and the file signed again.
    const forged = crafted(buildWorkspaceFile(fullInput()), (raw) => {
      const v = raw.body.plan.state.versions.find((x: Raw) => x.state === 'locked')
      v.lines.cents.usdBase[0] += 100
    })
    expect(read(forged)).toEqual({ ok: false, reason: lockBrokenText('FY27 Budget') })
    expect(lockBrokenText('FY27 Budget')).toBe(
      "This file's FY27 Budget does not match its own lock (hash differs). Nothing was imported.",
    )
  })

  it("reads Remove override's removals back from a Full file", () => {
    const removed = {
      version: 'fy27-working',
      table: 'attrition' as const,
      org: 'Operations',
      key: '*',
      value: 0.14,
    }
    const state = { ...fullState(), overlay: { ...fullState().overlay, removedAssumptions: [removed] } }
    const r = read(
      textOf(buildWorkspaceFile({ ...fullInput(), plan: { kind: 'full', state, audit: auditLog() } })),
    )
    if (!r.ok || r.file.body.plan.kind !== 'full') throw new Error('not read')
    expect(r.file.body.plan.state.overlay.removedAssumptions).toEqual([removed])
    // A state with none reads with none.
    const none = read(textOf(buildWorkspaceFile(fullInput())))
    if (!none.ok || none.file.body.plan.kind !== 'full') throw new Error('not read')
    expect('removedAssumptions' in none.file.body.plan.state.overlay).toBe(false)
  })

  it("reads a Full file's ID secret back, and refuses one that is not 32 hex characters", () => {
    const withSecret = (idSecret: unknown) =>
      crafted(buildWorkspaceFile(fullInput()), (raw) => {
        raw.body.plan.state.idSecret = idSecret
      })
    const r = read(withSecret('0123456789abcdef0123456789abcdef'))
    if (!r.ok || r.file.body.plan.kind !== 'full') throw new Error('not read')
    expect(r.file.body.plan.state.idSecret).toBe('0123456789abcdef0123456789abcdef')
    for (const bad of ['K7QM', 'ABCDEF0123456789ABCDEF0123456789', 7])
      expect(read(withSecret(bad)), String(bad)).toEqual({
        ok: false,
        reason: brokenPartText('body.plan.state.idSecret'),
      })
  })

  it('reads the wall-clock stamps a merge compares, and refuses one that is no ISO date-time', () => {
    const stamped = (revisedAt: unknown, createdAt: unknown) =>
      crafted(buildWorkspaceFile(fullInput()), (raw) => {
        raw.body.plan.state.requests[0].revisedAt = revisedAt
        raw.body.plan.state.requests[0].createdAt = createdAt
      })
    const r = read(stamped('2026-10-25T09:01:00.000Z', '2026-10-24T15:00:00.000Z'))
    if (!r.ok || r.file.body.plan.kind !== 'full') throw new Error('not read')
    expect(r.file.body.plan.state.requests[0]).toMatchObject({
      revisedAt: '2026-10-25T09:01:00.000Z',
      createdAt: '2026-10-24T15:00:00.000Z',
    })
    expect(read(stamped('yesterday', null))).toEqual({
      ok: false,
      reason: brokenPartText('body.plan.state.requests[0].revisedAt'),
    })
    // A request read from a Requests file keeps them too (Import requests reads them field by field).
    expect(readRequest({ ...hcRequest('R-9'), revisedAt: '2026-10-25T09:01:00.000Z' })?.revisedAt).toBe(
      '2026-10-25T09:01:00.000Z',
    )
  })
})
