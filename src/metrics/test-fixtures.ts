/**
 * A small catalog for the dictionary's own tests, independent of what the views register: one
 * setting of every type, a target, and a locked rule.
 */
import { defineMetrics } from './define'
import { catalogOf } from './registry'
import type { MetricDef } from './types'

/** A rate with a target and a boolean, a days and a choice setting. */
export const EXITS = 'forecast.exits.attrition'
/** A share with a percent, a rating-map, a range, a months and a money setting, and no formula. */
export const LOADS = 'plan.cost.loadShare'
/** The anonymity minimum (raise only) beside a locked switch. */
export const ANON = 'privacy.anonymity'

export const FIXTURE_DEFS: MetricDef[] = [
  ...defineMetrics('forecast', [
    {
      id: EXITS,
      name: 'Attrition',
      views: ['plan', 'targets'],
      definition: 'Employees who left in the window, as a share of average heads, annualized.',
      formula: 'exits ÷ average heads × (12 ÷ window months)',
      population: 'Employees only; contractors and interns excluded.',
      window: 'The period picker (default the fiscal year)',
      unit: 'pct',
      goodDirection: 'down',
      target: { value: 0.08, comparator: '<=' },
      uses: ['workers.hireDate', 'workers.terminationDate', 'workers.workerType'],
      owner: 'Finance',
      params: [
        {
          key: 'annualize',
          label: 'Annualize exit rates',
          description: 'Scale rates to a 12-month equivalent.',
          type: 'boolean',
          default: true,
        },
        {
          key: 'firstYearDays',
          label: 'First-year window',
          description: 'Days after hire that count as the first year.',
          type: 'days',
          default: 365,
          min: 30,
          max: 730,
        },
        {
          key: 'cohort',
          label: 'Who can exit',
          description: 'Which people the rate applies to.',
          type: 'choice',
          default: 'hris',
          choices: [
            { value: 'hris', label: 'People in Filled seats' },
            { value: 'all', label: 'Every cohort' },
          ],
        },
      ],
    },
  ]),
  ...defineMetrics('plan', [
    {
      id: LOADS,
      name: 'Standard loads',
      definition: 'Loads as a share of the band midpoint.',
      unit: 'pct2',
      goodDirection: null,
      uses: ['assumptions.value', 'positions.level'],
      params: [
        {
          key: 'loadBudget',
          label: 'Load budget',
          description: 'Loads as a share of base.',
          type: 'percent',
          default: 0.035,
          min: 0,
          max: 0.2,
          format: 'pct2',
        },
        {
          key: 'uplift',
          label: 'Uplift by rating',
          description: 'Uplift by rating.',
          type: 'ratingMap',
          default: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 },
          min: 0,
          max: 0.3,
          format: 'pct',
        },
        {
          key: 'healthyBand',
          label: 'Healthy band position',
          description: 'Positions in the band inside this count as healthy.',
          type: 'range',
          default: [0.9, 1.1],
          min: 0.5,
          max: 1.5,
          format: 'ratio',
        },
        {
          key: 'reviewMonths',
          label: 'Review window',
          description: 'Months a seat counts as new.',
          type: 'months',
          default: 12,
          min: 1,
          max: 36,
        },
        {
          key: 'reviewUsd',
          label: 'Review threshold',
          description: 'Band estimates above this are reviewed.',
          type: 'number',
          default: 250_000,
          min: 0,
          max: 1_000_000,
          step: 1000,
          format: 'moneyFull',
        },
      ],
    },
  ]),
  {
    id: ANON,
    name: 'Anonymity minimum',
    views: ['plan'],
    definition: 'Groups smaller than this are hidden.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    locked: true,
    params: [
      {
        key: 'minGroup',
        label: 'Smallest group shown',
        description: 'It can be raised, never lowered.',
        type: 'number',
        default: 5,
        min: 5,
        max: 50,
        format: 'int',
        locked: 'raiseOnly',
      },
      {
        key: 'payOptIn',
        label: 'Pay amounts are opt-in',
        description: 'Locked.',
        type: 'boolean',
        default: true,
        locked: true,
      },
    ],
  },
]

export const FIXTURE = catalogOf(FIXTURE_DEFS)
