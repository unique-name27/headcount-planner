/**
 * Writing workspace files (docs/PLAN.md 5.5, 16.2 "workspace"): kinds, checksum, the Full file's first
 * line, typed arrays written as plain arrays, the refusals, and the file name.
 */
import { describe, expect, it } from 'vitest'
import { sha256 } from '@/lib/sha256'
import { canonicalJson } from '../canonical'
import { hcRequest } from '../engine/fixtures/common'
import type { PlanState, PlanStateSlice, WorkspaceFile } from '../types'
import {
  type BuildFileInput,
  buildWorkspaceFile,
  FULL_FILE_NOTICE,
  MAX_FULL_FILE_BYTES,
  MAX_WORKSPACE_BYTES,
  managerModeLine,
  maxBytesOf,
  PERSONAL_FIELDS,
  serializeWorkspace,
  WORKSPACE_EXTENSION,
  WORKSPACE_FORMAT,
  WORKSPACE_VERSION,
  workspaceChecksum,
  workspaceFileName,
} from './file'

const emptyState = (): PlanState => ({
  v: 1,
  baselineId: null,
  versions: [],
  closes: [],
  adjustments: [],
  overlay: { positions: [], targets: [], freezes: [], assumptions: [] },
  requests: [],
  cycles: [],
  reviewed: [],
  mergeBase: [],
  auditHead: null,
})

const shareable = (over: Partial<Extract<PlanStateSlice, { kind: 'shareable' }>> = {}): PlanStateSlice => ({
  kind: 'shareable',
  requests: [hcRequest('R-1')],
  cycles: [],
  versions: [
    {
      versionId: 'fy27-budget',
      name: 'FY27 Budget',
      kind: 'budget',
      fiscalYear: 'FY27',
      state: 'locked',
      hash: 'sha256-b',
    },
  ],
  closes: [{ month: '2026-09', closedAt: '2026-10-05T09:00', hash: 'sha256-c' }],
  audit: [],
  models: { 'plan.heads.approved': 412, 'plan.cost.loaded': { value: 51_200_000, rounded: true } },
  ...over,
})

const input = (over: Partial<BuildFileInput> = {}): BuildFileInput => ({
  kind: 'shareable',
  savedAt: '2026-10-13T10:00',
  mode: 'hrbp',
  scopeLabel: 'Silicon Engineering',
  actingAs: false,
  plan: shareable(),
  lockedVersions: [
    {
      versionId: 'fy27-budget',
      name: 'FY27 Budget',
      kind: 'budget',
      fiscalYear: 'FY27',
      state: 'locked',
      hash: 'sha256-b',
    },
  ],
  ...over,
})

describe('buildWorkspaceFile', () => {
  it('writes the header and a checksum over the canonical JSON of the body', () => {
    const file = buildWorkspaceFile(input())
    expect(file).toMatchObject({
      format: WORKSPACE_FORMAT,
      version: WORKSPACE_VERSION,
      kind: 'shareable',
      app: 'Headcount Planner',
      mode: 'hrbp',
      scopeLabel: 'Silicon Engineering',
      actingAs: false,
      savedAt: '2026-10-13T10:00',
    })
    expect(file.notice).toBeUndefined()
    expect(file.checksum).toBe(`sha256-${sha256(canonicalJson(file.body))}`)
    expect(file.checksum).toBe(workspaceChecksum(file.body))
    expect(file.body.datasets).toBeUndefined()
  })

  it('makes the same checksum for the same body, whatever the key order', () => {
    const a = buildWorkspaceFile(input())
    const b = buildWorkspaceFile(
      input({
        plan: shareable({
          models: { 'plan.cost.loaded': { rounded: true, value: 51_200_000 }, 'plan.heads.approved': 412 },
        }),
      }),
    )
    expect(a.checksum).toBe(b.checksum)
  })

  it('makes a Requests file of requests only', () => {
    const file = buildWorkspaceFile(
      input({ kind: 'requests', plan: { kind: 'requests', requests: [hcRequest('R-2')] } }),
    )
    expect(file.kind).toBe('requests')
    expect(file.body.plan).toEqual({ kind: 'requests', requests: [hcRequest('R-2')] })
  })

  it('makes a Full file only in HR admin mode, with its notice and the datasets', () => {
    const full = buildWorkspaceFile(
      input({
        kind: 'full',
        mode: 'hr-admin',
        plan: { kind: 'full', state: emptyState(), audit: [] },
        datasets: { positions: [], freezes: [] },
      }),
    )
    expect(full.notice).toBe(FULL_FILE_NOTICE)
    expect(full.body.datasets).toEqual({ positions: [], freezes: [] })
    expect(() =>
      buildWorkspaceFile(
        input({ kind: 'full', mode: 'finance', plan: { kind: 'full', state: emptyState(), audit: [] } }),
      ),
    ).toThrow(/HR admin/)
  })

  it('refuses a slice of another kind and datasets outside a Full file', () => {
    expect(() => buildWorkspaceFile(input({ kind: 'requests' }))).toThrow(/requests slice/)
    expect(() => buildWorkspaceFile(input({ datasets: { positions: [] } }))).toThrow(/Only a Full/)
  })

  it('refuses individual pay, leave or a line table in a Shareable or Requests file', () => {
    expect([...PERSONAL_FIELDS].sort()).toEqual(
      ['agencyFee', 'baseSalary', 'leavePaid', 'offerBase', 'onLeave', 'relocation', 'signOnBonus'].sort(),
    )
    const withPay = shareable({
      audit: [
        {
          at: '2026-10-01T09:00',
          by: 'E1',
          byName: 'A',
          mode: 'hr-admin',
          object: 'position',
          id: 'P-1',
          field: 'comp',
          old: null,
          new: { baseSalary: 150_000 },
          effectiveDate: null,
          comment: null,
          commentAudience: null,
        },
      ],
    })
    expect(() => buildWorkspaceFile(input({ plan: withPay }))).toThrow(/plan\.audit\[0\]\.new\.baseSalary/)
    const leave = {
      kind: 'requests',
      requests: [{ ...hcRequest('R-3'), onLeave: true }],
    } as unknown as PlanStateSlice
    expect(() => buildWorkspaceFile(input({ kind: 'requests', plan: leave }))).toThrow(/onLeave/)
    const table = shareable({ models: { lines: { usdLoaded: new Float64Array([1, 2]) } as never } })
    expect(() => buildWorkspaceFile(input({ plan: table }))).toThrow(/line table/)
    // A guarded model keyed by a component name is the guard's output, not a person's pay.
    expect(() =>
      buildWorkspaceFile(
        input({ plan: shareable({ models: { 'finance.components': { relocation: 120_000 } } }) }),
      ),
    ).not.toThrow()
    // A figure column flagged `pay` is one person's amount (HR admin with the switch on, EX-2).
    const payColumn = shareable({
      models: {
        'plan-positions-grid': {
          id: 'plan-positions-grid',
          title: 'Positions',
          columns: [{ key: 'costAnnualUsd', label: 'Annual cost', money: true, band: false, pay: true }],
          rows: [{ costAnnualUsd: 732_572.4 }],
        },
      },
    })
    expect(() => buildWorkspaceFile(input({ plan: payColumn }))).toThrow(
      /plan\.models\.plan-positions-grid\.columns\[0\] \(a pay column\)/,
    )
    const bandColumn = shareable({
      models: {
        f: {
          id: 'f',
          title: 'F',
          columns: [{ key: 'b', label: 'B', money: true, band: true, pay: false }],
          rows: [],
        },
      },
    })
    expect(() => buildWorkspaceFile(input({ plan: bandColumn }))).not.toThrow()
  })

  it('writes a Manager-mode file its mode line first, and no other mode one (D-MODELINE)', () => {
    const line = "Made in Manager mode for Aditya Joshi's team. No amounts are included."
    const file = buildWorkspaceFile(input({ mode: 'manager', modeLine: line }))
    expect(file.modeLine).toBe(line)
    const text = serializeWorkspace(file)
    expect(text.split('\n').slice(0, 2)).toEqual([
      `{ "modeLine": ${JSON.stringify(line)},`,
      '  "format": "hcplan",',
    ])
    // The line is not part of the body, so the checksum is the same with or without it.
    expect(file.checksum).toBe(buildWorkspaceFile(input({ mode: 'manager' })).checksum)
    expect(managerModeLine('Made in Manager mode.')).toBe(true)
    for (const bad of [
      'Made in HRBP mode for Silicon Engineering.',
      "Made in Manager mode for R2's team. No amounts are included.",
      "Made in Manager mode for 's team. No amounts are included.",
      `${line} `,
    ])
      expect(managerModeLine(bad), bad).toBe(false)
    expect(() => buildWorkspaceFile(input({ mode: 'hrbp', modeLine: line }))).toThrow(/Manager mode/)
    expect(() => buildWorkspaceFile(input({ mode: 'manager', modeLine: 'Made in HR admin mode.' }))).toThrow(
      /Manager mode/,
    )
  })
})

describe('serializeWorkspace', () => {
  const tableState = (): PlanState => ({
    ...emptyState(),
    versions: [
      {
        versionId: 'fy27-budget',
        name: 'FY27 Budget',
        kind: 'budget',
        fiscalYear: 'FY27',
        grid: { from: '2026-04', to: '2027-03' },
        proration: 'daily',
        state: 'locked',
        createdAt: '2026-03-31T09:00',
        lockedAt: '2026-03-31T09:00',
        lockedBy: 'E1',
        engineVersion: 'hcp-engine-1',
        parentId: 'fy27-working',
        hash: 'sha256-b',
        lines: {
          length: 1,
          versionId: 'fy27-budget',
          positionId: { dict: ['P-1'], codes: new Uint32Array([0]) },
          holderId: { dict: [''], codes: new Uint32Array([0]) },
          month: { dict: ['2026-04'], codes: new Uint32Array([0]) },
          status: { dict: ['Planned'], codes: new Uint32Array([0]) },
          currency: { dict: ['USD'], codes: new Uint32Array([0]) },
          basis: { dict: ['band'], codes: new Uint32Array([0]) },
          numbers: {
            heads: new Float64Array([0]),
            fte: new Float64Array([1]),
            active: new Float64Array([0.5]),
            rate: new Float64Array([1]),
            localBase: new Float64Array([100.25]),
            localBonus: new Float64Array([0]),
            localBurden: new Float64Array([0]),
            localBenefits: new Float64Array([0]),
            localOneTime: new Float64Array([0]),
            localVacancy: new Float64Array([0]),
            usdBase: new Float64Array([100.25]),
            usdBonus: new Float64Array([0]),
            usdBurden: new Float64Array([0]),
            usdBenefits: new Float64Array([0]),
            usdOneTime: new Float64Array([0]),
            usdVacancy: new Float64Array([0]),
            usdEquity: new Float64Array([0]),
            usdLoaded: new Float64Array([100.25]),
          },
        },
        assumptions: [],
        rates: [],
        forecast: null,
      },
    ],
  })

  it("puts a Full file's notice on its first line, then the format", () => {
    const text = serializeWorkspace(
      buildWorkspaceFile(
        input({ kind: 'full', mode: 'hr-admin', plan: { kind: 'full', state: tableState(), audit: [] } }),
      ),
    )
    const [first, second] = text.split('\n')
    expect(first).toBe('{ "notice": "Contains individual pay",')
    expect(second).toBe('  "format": "hcplan",')
    expect(text.endsWith('\n')).toBe(true)
  })

  it("writes a Full file's header one key a line and its body compact on the last lines", () => {
    const file = buildWorkspaceFile(
      input({ kind: 'full', mode: 'hr-admin', plan: { kind: 'full', state: tableState(), audit: [] } }),
    )
    const text = serializeWorkspace(file)
    const lines = text.split('\n')
    expect(lines.at(-1)).toBe('')
    expect(lines.at(-2)).toBe('}')
    const body = lines.at(-3) ?? ''
    expect(body.startsWith('  "body": {')).toBe(true)
    // C35: a locked version's amounts in integer cents.
    expect(body).toContain('"usdLoaded":[10025]')
    expect(lines.slice(0, -3).every((l) => !l.includes('"body"'))).toBe(true)
    const parsed = JSON.parse(text) as WorkspaceFile
    expect(parsed.checksum).toBe(file.checksum)
    expect(workspaceChecksum(parsed.body)).toBe(file.checksum)
  })

  it('starts other files with the format, two-space indented', () => {
    const text = serializeWorkspace(buildWorkspaceFile(input()))
    expect(text.split('\n')[0]).toBe('{ "format": "hcplan",')
    expect(text.split('\n')[1]).toBe('  "version": 1,')
    expect(text).not.toContain('notice')
  })

  it('writes typed-array columns as plain arrays, and the checksum still holds over the parsed body', () => {
    const file = buildWorkspaceFile(
      input({ kind: 'full', mode: 'hr-admin', plan: { kind: 'full', state: tableState(), audit: [] } }),
    )
    const text = serializeWorkspace(file)
    const parsed = JSON.parse(text) as WorkspaceFile
    const plan = parsed.body.plan as Extract<PlanStateSlice, { kind: 'full' }>
    const lines = (
      plan.state.versions[0] as unknown as {
        lines: {
          numbers: Record<string, unknown>
          cents: Record<string, unknown>
          positionId: { codes: unknown }
        }
      }
    ).lines
    expect(lines.numbers.fte).toEqual([1])
    expect(lines.cents.usdLoaded).toEqual([10025])
    expect(lines.positionId.codes).toEqual([0])
    expect(workspaceChecksum(parsed.body)).toBe(file.checksum)
  })

  it("writes a Full file's locked lines by column, amounts as integer cents and the rest exact (C35)", () => {
    const state = tableState()
    const v = state.versions[0] as Extract<PlanState['versions'][number], { state: 'locked' }>
    const numbers = { ...v.lines.numbers }
    numbers.active = new Float64Array([16 / 31])
    numbers.rate = new Float64Array([1.0869565217391304])
    numbers.localBase = new Float64Array([1234.5678])
    numbers.usdBurden = new Float64Array([-0.004])
    const table = { ...v.lines, numbers }
    const file = buildWorkspaceFile(
      input({
        kind: 'full',
        mode: 'hr-admin',
        plan: { kind: 'full', state: { ...state, versions: [{ ...v, lines: table }] }, audit: [] },
      }),
    )
    const parsed = JSON.parse(serializeWorkspace(file)) as {
      body: { plan: { state: { versions: { lines: Record<string, Record<string, number[]>> }[] } } }
    }
    const lines = parsed.body.plan.state.versions[0].lines
    expect(Object.keys(lines.numbers).sort()).toEqual(['active', 'fte', 'heads', 'rate'])
    expect(Object.keys(lines.cents)).toHaveLength(14)
    expect(lines.numbers.active).toEqual([16 / 31])
    expect(lines.numbers.rate).toEqual([1.0869565217391304])
    expect(lines.cents.localBase).toEqual([123457])
    expect(lines.cents.usdBurden).toEqual([0])
    expect(Object.values(lines.cents).every((c) => c.every((x) => Number.isInteger(x)))).toBe(true)
    // The file in memory holds the same cents, so the file read back is the file built.
    const built = file.body.plan as Extract<PlanStateSlice, { kind: 'full' }>
    const lv = built.state.versions[0] as Extract<PlanState['versions'][number], { state: 'locked' }>
    expect(lv.lines.numbers.localBase[0]).toBe(1234.57)
    expect(lv.lines.numbers.active[0]).toBe(16 / 31)
    // The caller's table is not changed.
    expect(table.numbers.localBase[0]).toBe(1234.5678)
  })

  it('stays under the size limit for a typical Shareable file', () => {
    expect(serializeWorkspace(buildWorkspaceFile(input())).length).toBeLessThan(MAX_WORKSPACE_BYTES)
    expect(MAX_WORKSPACE_BYTES).toBe(26_214_400)
  })

  it('sets the import limit by kind: 25 MB for Shareable and Requests, 150 MB for Full (C35)', () => {
    expect(MAX_FULL_FILE_BYTES).toBe(157_286_400)
    expect(maxBytesOf('shareable')).toBe(MAX_WORKSPACE_BYTES)
    expect(maxBytesOf('requests')).toBe(MAX_WORKSPACE_BYTES)
    expect(maxBytesOf('full')).toBe(MAX_FULL_FILE_BYTES)
  })
})

describe('workspaceFileName', () => {
  it('names the kind, a safe scope and the as-of date', () => {
    const file = buildWorkspaceFile(input({ scopeLabel: 'Silicon Engineering / Munich (EMEA)' }))
    expect(workspaceFileName(file, '2026-09-30')).toBe(
      'headcount-planner-shareable-silicon-engineering-munich-emea-2026-09-30.hcplan.json',
    )
    expect(workspaceFileName(file, '2026-09-30').endsWith(WORKSPACE_EXTENSION)).toBe(true)
  })

  it('keeps names short and plain', () => {
    const file = buildWorkspaceFile(input({ scopeLabel: 'Société Générale ../../etc' }))
    expect(workspaceFileName(file, '2026-09-30T23:59')).toBe(
      'headcount-planner-shareable-societe-generale-etc-2026-09-30.hcplan.json',
    )
    const blank = buildWorkspaceFile(input({ scopeLabel: '   ' }))
    expect(workspaceFileName(blank, '2026-09-30')).toBe(
      'headcount-planner-shareable-all-2026-09-30.hcplan.json',
    )
    const long = buildWorkspaceFile(input({ scopeLabel: 'x'.repeat(200) }))
    expect(workspaceFileName(long, '2026-09-30').length).toBeLessThan(120)
  })
})
