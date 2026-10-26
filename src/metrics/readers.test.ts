/**
 * Every registered setting has a reader (docs/PLAN.md 12, "Engines read settings only through
 * `ctx.metrics`"): a helper that reads it through the dictionary, a pure engine that takes it as an
 * input (the views' and pages' own settings are read by their engines' `settingsOf`). Helpers run
 * under `recordParamReads`; each engine input is driven with the value in force and a changed one.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { computeQuality } from '@/data/quality/compute'
import type { FieldRef } from '@/data/quality/fieldRef'
import { DEFAULT_QUALITY_RULES } from '@/data/quality/rules'
import { confirmVersion, makeVersion } from '@/data/quality/versions'
import { DATASET_KEYS } from '@/data/schema'
import { suppress } from '@/lib/stats'
import { budgetStatus, staffed } from '@/plan/engine/budgetStatus'
import { triggersOf } from '@/plan/engine/chain'
import { A1, a1BandCost } from '@/plan/engine/fixtures/budgetStatus'
import { CHAIN_ORG, facts } from '@/plan/engine/fixtures/chain'
import { hcRequest } from '@/plan/engine/fixtures/common'
import { backfillFlag, isExpired } from '@/plan/engine/requests'
import { ORG_AS_OF, orgDatasets } from '@/testkit/orgFixture'
import { settingsOf as actionsSettingsOf } from '@/views/actions/engine/settings'
import { settingsOf as planSettingsOf } from '@/views/plan/engine/settings'
import { PARAM as PLAN_PARAM } from '@/views/plan/metrics'
import { settingsOf as requestsSettingsOf } from '@/views/requests/engine/settings'
import { PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'
import { PARAM as TEAM_PARAM } from '@/views/team/metrics'
import { defaultMetrics } from './api'
import { CATALOG } from './catalog'
import { costGuardOf } from './costGuard'
import { ANONYMITY, minGroupOf, minLeaveCountOf, payAmountsOptIn } from './privacy'
import { QUALITY_RULES, qualityRulesOf } from './quality'
import { SETTING_READERS, settingsAwaitingReader } from './readers'
import { metricsWith, paramRef, recordParamReads } from './testing'
import type { MetricsApi } from './types'

/** The helpers `SETTING_READERS` names, by module and name; each reads every setting it holds. */
const HELPERS: Record<string, (m: MetricsApi) => unknown> = {
  'src/metrics/costGuard.ts#costGuardOf': costGuardOf,
  'src/metrics/quality.ts#qualityRulesOf': qualityRulesOf,
  'src/metrics/privacy.ts#minGroupOf': minGroupOf,
  'src/metrics/privacy.ts#payAmountsOptIn': payAmountsOptIn,
  'src/metrics/privacy.ts#minLeaveCountOf': minLeaveCountOf,
  'src/views/plan/engine/settings.ts#settingsOf': (m) => planSettingsOf(m).noReqDays,
  'src/views/requests/engine/settings.ts#settingsOf': (m) => {
    const s = requestsSettingsOf(m)
    return [s.waitingDays, s.idleDays, s.backfillWindowDays]
  },
  'src/views/actions/engine/settings.ts#settingsOf': actionsSettingsOf,
}

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

const num = (m: MetricsApi, r: { metricId: string; key: string }): number => m.num(r.metricId, r.key)

describe('the settings readers', () => {
  it('list every registered setting, in catalog order, and nothing else', () => {
    const registered = CATALOG.list.flatMap((d) => d.params.map((p) => paramRef(d.id, p.key)))
    expect(Object.keys(SETTING_READERS)).toEqual(registered)
  })

  it('read through ctx.metrics wherever a helper is named', () => {
    for (const [setting, r] of Object.entries(SETTING_READERS))
      for (const read of r.reads) {
        if (read.kind !== 'metrics') continue
        const helper = HELPERS[`${read.module}#${read.reader}`]
        expect(helper, `${read.module} ${read.reader}`).toBeDefined()
        const { metrics, reads } = recordParamReads(defaultMetrics())
        helper(metrics)
        expect([...reads], `${read.reader} reads ${setting}`).toContain(setting)
      }
  })

  it('wait for no reader since M2 built the engines, and say why a reader has callers to come', () => {
    expect(settingsAwaitingReader()).toEqual([])
    for (const [setting, r] of Object.entries(SETTING_READERS)) {
      expect(r.reads.length > 0 || !!r.awaits, setting).toBe(true)
      if (r.awaits) expect(r.awaits, setting).toMatch(/\(.*M2.*\)/)
      for (const read of r.reads) expect(read.module, setting).toMatch(/^src\/[\w/]+\.ts$/)
    }
  })

  it('name modules that export the reader (the input names are checked by the type checker)', () => {
    for (const [setting, r] of Object.entries(SETTING_READERS))
      for (const read of r.reads) {
        const text = readFileSync(`${ROOT}${read.module}`, 'utf8')
        const exported = new RegExp(String.raw`export (function|const) ${read.reader}\b`)
        expect(text, `${setting}: ${read.reader} in ${read.module}`).toMatch(exported)
      }
  })
})

describe('the pure engines take the value in force', () => {
  it('budget status reads At risk within the at-risk share', () => {
    const m = defaultMetrics()
    expect(num(m, TEAM_PARAM.atRiskShare)).toBe(A1.atRiskShare)
    // A1 (1): staffed $400,000 against a $480,000 allocation (83%) at the as-of month-end.
    const c = A1.cases[0]
    const status = (share: number) =>
      budgetStatus({
        allocation: { heads: A1.allocation.heads, bandCost: A1.allocation.bandCost },
        staffed: staffed(c.people, A1.months, a1BandCost),
        pending: c.pending,
        atRiskShare: share,
      })
    expect(status(num(m, TEAM_PARAM.atRiskShare)).text).toBe('On track')
    const wide = metricsWith({ [TEAM_PARAM.atRiskShare.metricId]: { [TEAM_PARAM.atRiskShare.key]: 0.2 } })
    expect(status(num(wide, TEAM_PARAM.atRiskShare))).toMatchObject({
      status: 'At risk',
      text: 'At risk: your band cost is within 20% of your allocation',
    })
  })

  it('the chain adds the leader step strictly above the leader threshold', () => {
    const m = defaultMetrics()
    const threshold = num(m, REQUESTS_PARAM.leaderThresholdUsd)
    expect(threshold).toBe(CHAIN_ORG.leaderThresholdUsd)
    const org = { ...CHAIN_ORG, leaderThresholdUsd: threshold }
    const req = hcRequest('R-READ', { type: 'Backfill', positionId: 'P-GTM-101', level: 'P3' })
    const over = (band: number) =>
      triggersOf(req, { org, facts: facts({ bandEstimateUsd: band }) }).has('band-estimate-over-threshold')
    expect(over(threshold)).toBe(false)
    expect(over(threshold + 0.01)).toBe(true)
  })

  it('a Draft expires after the idle days', () => {
    const draft = hcRequest('R-IDLE', { state: 'Draft', submittedAt: null, updatedAt: '2026-08-01T09:00' })
    // 61 days idle on 1 Oct 2026.
    expect(isExpired(draft, '2026-10-01', num(defaultMetrics(), REQUESTS_PARAM.idleDays), false)).toBe(true)
    const patient = metricsWith({ [REQUESTS_PARAM.idleDays.metricId]: { [REQUESTS_PARAM.idleDays.key]: 90 } })
    expect(isExpired(draft, '2026-10-01', num(patient, REQUESTS_PARAM.idleDays), false)).toBe(false)
  })

  it('a Backfill is flagged within the window around an exit', () => {
    const req = hcRequest('R-BF', { type: 'Backfill', state: 'Draft', positionId: 'P-1' })
    // The seat was made 36 days after an exit in its org.
    const flag = (m: MetricsApi) =>
      backfillFlag(req, {
        createdOn: () => '2026-11-20',
        exitsOf: () => [],
        orgExits: () => ['2026-10-15'],
        windowDays: num(m, REQUESTS_PARAM.backfillWindowDays),
      })
    expect(flag(defaultMetrics())).toBe('backfill-no-exit')
    const wide = metricsWith({
      [REQUESTS_PARAM.backfillWindowDays.metricId]: { [REQUESTS_PARAM.backfillWindowDays.key]: 45 },
    })
    expect(flag(wide)).toBe('backfill-new-position')
  })

  it("the views' settings helpers read the value in force, not a constant", () => {
    const changed = metricsWith({
      [PLAN_PARAM.noReqDays.metricId]: { [PLAN_PARAM.noReqDays.key]: 30 },
      [REQUESTS_PARAM.waitingDays.metricId]: { [REQUESTS_PARAM.waitingDays.key]: 8 },
    })
    expect(planSettingsOf(defaultMetrics()).noReqDays).toBe(45)
    expect(planSettingsOf(changed).noReqDays).toBe(30)
    expect(requestsSettingsOf(defaultMetrics()).waitingDays).toBe(5)
    expect(requestsSettingsOf(changed).waitingDays).toBe(8)
    expect(actionsSettingsOf(defaultMetrics())).toEqual({ snoozeDays: 7, dueSoonDays: 7, blockedDays: 14 })
  })

  it('a rate over a group under the anonymity minimum is hidden', () => {
    const raised = metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 7 } })
    expect(suppress(0.5, 6, minGroupOf(defaultMetrics()))).toBe(0.5)
    expect(suppress(0.5, 6, minGroupOf(raised))).toBeNull()
  })
})

describe('the data quality rules', () => {
  it('default to the quality constants', () => {
    const m = defaultMetrics()
    expect(qualityRulesOf(m)).toBe(DEFAULT_QUALITY_RULES)
    for (const [k, days] of Object.entries(DEFAULT_QUALITY_RULES.freshDays))
      expect(m.num(QUALITY_RULES.freshness.metricId, k), k).toBe(days)
    // The same values give the same object, so the quality index is reused.
    const loose = () => metricsWith({ [QUALITY_RULES.fill.metricId]: { [QUALITY_RULES.fill.key]: 0.85 } })
    expect(qualityRulesOf(loose())).toBe(qualityRulesOf(loose()))
    expect(qualityRulesOf(loose()).minCoverage).toBe(0.85)
  })

  it('reach the quality index: fill threshold and problem rate', () => {
    const data = orgDatasets()
    // Location blank on one position row in N: below 95% filled.
    data.positions = data.positions.map((r, i) => (i === 0 ? { ...r, location: '' } : r))
    const ref: FieldRef = 'positions.location'
    // Every mapping confirmed, so a field's fill decides between silver and bronze.
    const versions = Object.fromEntries(
      DATASET_KEYS.map((k) => [
        k,
        confirmVersion(
          makeVersion({ dataset: k, source: 'sample', rows: data[k] }),
          'x',
          '2026-09-30T00:00:00Z',
        ),
      ]),
    )
    const index = (m: MetricsApi) =>
      computeQuality(data, versions, undefined, { asOf: ORG_AS_OF, rules: qualityRulesOf(m) })
    const before = index(defaultMetrics())
    const coverage = before.fieldStats(ref).coverage
    expect(coverage).toBeGreaterThan(0.85)
    expect(coverage).toBeLessThan(0.95)
    expect(before.explain(ref)).toContain('silver needs 95%.')
    expect(before.fieldTier(ref)).toBe('bronze')

    const loose = metricsWith({ [QUALITY_RULES.fill.metricId]: { [QUALITY_RULES.fill.key]: 0.85 } })
    const after = index(loose)
    expect(after.rules.minCoverage).toBe(0.85)
    expect(after.fieldTier(ref)).toBe('silver')
    expect(after.explain(ref)).not.toContain('silver needs')
    const strict = metricsWith({ [QUALITY_RULES.fill.metricId]: { [QUALITY_RULES.fill.key]: 0.975 } })
    expect(index(strict).explain(ref)).toContain('silver needs 97.5%.')

    const issueLabel = (m: MetricsApi) =>
      index(m)
        .checks('positions')
        .find((r) => r.id === 'issue-rate')?.label
    expect(issueLabel(defaultMetrics())).toBe('Issue rate within 2%')
    const lenient = metricsWith({
      [QUALITY_RULES.problems.metricId]: { [QUALITY_RULES.problems.key]: 0.035 },
    })
    expect(issueLabel(lenient)).toBe('Issue rate within 3.5%')
  })
})
