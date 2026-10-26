/**
 * The metric dictionary (docs/PLAN.md 12): types, the assembled catalog, the `ctx.metrics` API,
 * your overrides with their change log, persistence, the settings-file section, and the privacy,
 * cost guard and data quality rules. The Excel "Metric dictionary" workbook joins in M2.
 *
 * A view's own `metrics.ts` imports `@/metrics/define`, `@/metrics/types`, `@/metrics/fields`,
 * `@/metrics/rules` and `@/metrics/wording` directly, never this barrel (the barrel loads the
 * catalog, which loads every view's `metrics.ts`).
 */
export {
  defaultMetrics,
  definitionOf,
  definitionsStamp,
  kpiTarget,
  type MetricDefinition,
  mergeDef,
  metricIdOf,
  metricsApi,
  targetStatus,
} from './api'
export { CATALOG, METRICS, metricsOfView, VIEW_METRICS } from './catalog'
export {
  COST_GUARD_METRICS,
  type CostGuardSettings,
  costGuardOf,
  FLOOR_USD,
  floorUsdOf,
  MIN_CONTRIBUTORS,
  MIN_COSTED,
  minContributorsOf,
  minCostedOf,
} from './costGuard'
export { defineMetrics, type MetricInput } from './define'
export {
  COMPONENT_METRICS,
  type GuardClass,
  LEAVE_HIDDEN_IN,
  LEAVE_PREFIX,
  MANAGER_HIDDEN_PREFIXES,
  MANAGER_HIDDEN_RULES,
  METRIC_GUARD,
  type MetricGuard,
  managerHides,
  ROUNDED_COST_PERIODS,
  ROUNDED_MODES,
  roundedHides,
  showsMoney,
} from './guardClass'
export {
  applyImport,
  importMetricsSection,
  importSummary,
  type MetricsFileSection,
  metricsFileSection,
} from './imports'
export {
  applyEdit,
  applyEdits,
  type BatchResult,
  type ChangeOpts,
  canUndo,
  changedFields,
  checkEdit,
  checkTarget,
  cleanOverride,
  comparatorText,
  currentValue,
  defaultComparator,
  defaultValue,
  describeChange,
  EMPTY_METRICS,
  fieldsOf,
  formatFieldValue,
  MAX_LOG,
  MAX_TEXT,
  resetAll,
  resetMetric,
  sameValue,
  sanitizeMetricsState,
  targetDirectionWarning,
  targetText,
  undoChange,
} from './overrides'
export {
  allowedText,
  cloneParam,
  formatParam,
  formatParamNumber,
  isMoneyParam,
  isNumericParam,
  isShareParam,
  isWholeParam,
  NOT_SET,
  type ParamCheck,
  paramDecimals,
  paramFormat,
  parseParamInput,
  parseParamNumber,
  RATING_KEYS,
  readDateSetting,
  sameParam,
  validateParam,
} from './params'
export { loadMetrics, METRICS_KEY, METRICS_STORE_VERSION, saveMetrics } from './persist'
export {
  ANONYMITY,
  LEAVE_COUNTS,
  minGroupOf,
  minLeaveCountOf,
  PAY_AMOUNTS,
  PRIVACY_METRICS,
  payAmountsOptIn,
} from './privacy'
export { QUALITY_METRICS, QUALITY_RULES, qualityRulesOf } from './quality'
export {
  type InputRead,
  type MetricsRead,
  SETTING_READERS,
  type SettingRead,
  type SettingReaders,
  settingsAwaitingReader,
} from './readers'
export {
  catalogOf,
  fieldLabel,
  isFieldOf,
  isTextField,
  METRIC_VIEW_LABEL,
  type MetricCatalog,
  paramField,
  paramKeyOf,
  paramOf,
  readsNoData,
  SHARED_PREFIXES,
  validateCatalog,
  withRequired,
} from './registry'
export {
  COST_GUARD_RULE_IDS,
  PRIVACY_RULE_IDS,
  RULE_ID,
  RULE_SETTINGS,
  type RuleId,
  type RuleSetting,
} from './rules'
export type * from './types'
export { TEXT_FIELDS } from './types'
