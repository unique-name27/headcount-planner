/**
 * Who reads each registered setting (docs/PLAN.md 12: "Engines read settings only through
 * `ctx.metrics`"). Every setting in the catalog is listed here, by `paramRef` ("metricId#key"), in one
 * of three ways:
 *
 * - **metrics**: a helper reads the value in force through `ctx.metrics` and hands it on
 *   (`costGuardOf`, `qualityRulesOf`, `minGroupOf`). `readers.test.ts` records the reads.
 * - **input**: a pure engine takes the value as an input (`BudgetStatusInput.atRiskShare`); its model
 *   builder reads it through `ctx.metrics` and passes it in, never a constant. The input names are
 *   checked by the type checker, so renaming one breaks the build, and the test drives each engine
 *   with a changed value.
 * - **awaits**: no engine reads it yet; the note names the module that will. The test pins the
 *   list (empty since M2 built the views' engines), so whoever adds a setting with no reader says so.
 *
 * A setting can have both a helper and an input (the anonymity minimum is read by `minGroupOf`
 * and taken by `suppress`), and a helper whose callers are still to come says so in `awaits`. The
 * engines are imported for their types only, so nothing here loads an engine.
 */
import type { LeaveEnv } from '@/access/leave'
import type { QualityOptions } from '@/data/quality/compute'
import { DEFAULT_FRESH_DAYS } from '@/data/quality/rules'
import { DATASET_KEYS } from '@/data/schema'
import type { BudgetStatusInput } from '@/plan/engine/budgetStatus'
import type { ChainOrg } from '@/plan/engine/chain'
import type { backfillFlag, TransitionContext } from '@/plan/engine/requests'
import { PARAM as ACTIONS_PARAM } from '@/views/actions/metrics'
import { PARAM as PLAN_PARAM } from '@/views/plan/metrics'
import { PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'
import { PARAM as TEAM_PARAM } from '@/views/team/metrics'
import { QUALITY_RULES } from './quality'
import { ANONYMITY, FLOOR_USD, LEAVE_COUNTS, MIN_CONTRIBUTORS, MIN_COSTED, PAY_AMOUNTS } from './rules'

/** A helper that reads the setting through `ctx.metrics`. */
export interface MetricsRead {
  readonly kind: 'metrics'
  /** The helper's name, as exported. */
  readonly reader: string
  /** Its module, from the project root. */
  readonly module: string
}

/** A pure engine input that takes the setting's value in force. */
export interface InputRead {
  readonly kind: 'input'
  /** The engine function, as exported. */
  readonly reader: string
  readonly module: string
  /** The input that takes the value: 'BudgetStatusInput.atRiskShare'. */
  readonly input: string
}

export type SettingRead = MetricsRead | InputRead

export interface SettingReaders {
  /** How the value reaches a calculation today; empty while it awaits a reader. */
  readonly reads: readonly SettingRead[]
  /** Who will read it (M2), while no engine does; and where a helper's caller is still to come. */
  readonly awaits?: string
}

/** A key of `T`, checked by the type checker: `keyOf<BudgetStatusInput>('atRiskShare')`. */
const keyOf = <T>(key: Extract<keyof T, string>): string => key

const metrics = (reader: string, module: string): MetricsRead => ({ kind: 'metrics', reader, module })
const input = (reader: string, module: string, inputName: string): InputRead => ({
  kind: 'input',
  reader,
  module,
  input: inputName,
})

const ref = (r: { readonly metricId: string; readonly key: string }): string => `${r.metricId}#${r.key}`

const COST_GUARD = metrics('costGuardOf', 'src/metrics/costGuard.ts')
/** The views' and pages' settings helpers (each view's engine/settings.ts). */
const PLAN_SETTINGS = metrics('settingsOf', 'src/views/plan/engine/settings.ts')
const REQUESTS_SETTINGS = metrics('settingsOf', 'src/views/requests/engine/settings.ts')
const ACTIONS_SETTINGS = metrics('settingsOf', 'src/views/actions/engine/settings.ts')
const QUALITY: SettingReaders = {
  reads: [
    metrics('qualityRulesOf', 'src/metrics/quality.ts'),
    input(
      'computeQuality',
      'src/data/quality/compute.ts',
      `QualityOptions.${keyOf<QualityOptions>('rules')}`,
    ),
  ],
}

/** Every registered setting, by `paramRef`, in catalog order. */
export const SETTING_READERS: Readonly<Record<string, SettingReaders>> = {
  [ref(TEAM_PARAM.atRiskShare)]: {
    reads: [
      input(
        'budgetStatus',
        'src/plan/engine/budgetStatus.ts',
        `BudgetStatusInput.${keyOf<BudgetStatusInput>('atRiskShare')}`,
      ),
    ],
  },
  [ref(PLAN_PARAM.noReqDays)]: { reads: [PLAN_SETTINGS] },
  [ref(REQUESTS_PARAM.waitingDays)]: { reads: [REQUESTS_SETTINGS] },
  [ref(REQUESTS_PARAM.idleDays)]: {
    reads: [
      REQUESTS_SETTINGS,
      input(
        'transition',
        'src/plan/engine/requests.ts',
        `TransitionContext.${keyOf<TransitionContext>('idleDays')}`,
      ),
      input('isExpired', 'src/plan/engine/requests.ts', 'idleDays'),
    ],
  },
  [ref(REQUESTS_PARAM.leaderThresholdUsd)]: {
    reads: [
      input('chainFor', 'src/plan/engine/chain.ts', `ChainOrg.${keyOf<ChainOrg>('leaderThresholdUsd')}`),
    ],
  },
  [ref(REQUESTS_PARAM.backfillWindowDays)]: {
    reads: [
      REQUESTS_SETTINGS,
      input(
        'backfillFlag',
        'src/plan/engine/requests.ts',
        `ctx.${keyOf<Parameters<typeof backfillFlag>[1]>('windowDays')}`,
      ),
    ],
  },
  [ref(ACTIONS_PARAM.snoozeDays)]: { reads: [ACTIONS_SETTINGS] },
  [ref(ACTIONS_PARAM.dueSoonDays)]: { reads: [ACTIONS_SETTINGS] },
  [ref(ACTIONS_PARAM.blockedDays)]: { reads: [ACTIONS_SETTINGS] },
  [ref(ANONYMITY)]: {
    reads: [metrics('minGroupOf', 'src/metrics/privacy.ts'), input('suppress', 'src/lib/stats.ts', 'min')],
  },
  [ref(PAY_AMOUNTS)]: {
    reads: [metrics('payAmountsOptIn', 'src/metrics/privacy.ts')],
    awaits:
      'Nothing branches on it: the rule is locked on, and the access layer applies it as the Show pay amounts switch (src/access/pay.ts showPayIn, M2).',
  },
  [ref(LEAVE_COUNTS)]: {
    reads: [
      metrics('minLeaveCountOf', 'src/metrics/privacy.ts'),
      input('leaveShown', 'src/access/leave.ts', `LeaveEnv.${keyOf<LeaveEnv>('min')}`),
    ],
  },
  [ref(MIN_COSTED)]: { reads: [COST_GUARD] },
  [ref(FLOOR_USD)]: { reads: [COST_GUARD] },
  [ref(MIN_CONTRIBUTORS)]: { reads: [COST_GUARD] },
  [ref(QUALITY_RULES.fill)]: QUALITY,
  [ref(QUALITY_RULES.problems)]: QUALITY,
  [ref(QUALITY_RULES.tolerance)]: QUALITY,
  ...Object.fromEntries(
    DATASET_KEYS.filter((k) => DEFAULT_FRESH_DAYS[k] != null).map((k) => [
      `${QUALITY_RULES.freshness.metricId}#${k}`,
      QUALITY,
    ]),
  ),
}

/** The settings no engine reads yet (`reads` empty), by `paramRef`. */
export const settingsAwaitingReader = (): string[] =>
  Object.entries(SETTING_READERS)
    .filter(([, r]) => r.reads.length === 0)
    .map(([k]) => k)
