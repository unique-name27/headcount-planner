/**
 * The twelve official lists: what each holds, the fields it checks, its parent list and the
 * attributes its values carry. The Units list (business units) names each unit's HR business
 * partner; the Levels list can mark a level's seats as leader seats or not (the "Director+" rule's
 * override); the Roles list names the people HR admin and Finance act as.
 */
import type { FieldRef } from '../quality/fieldRef'
import { REGIONS } from '../schema'
import type { ListDef, ListId } from './types'

/** A yes-or-no attribute's choices. */
export const YES_NO = ['Yes', 'No'] as const

/** The Roles list: the people each of these modes acts as (docs/PLAN.md 8.2). */
export const ROLES = ['HR admin', 'Finance'] as const
export type Role = (typeof ROLES)[number]

const ORG_UNITS = (field: string): FieldRef[] =>
  (['positions', 'workers', 'requests', 'targets', 'freezes'] as const).map(
    (d) => `${d}.${field}` as FieldRef,
  )

export const LIST_DEFS: readonly ListDef[] = [
  {
    id: 'businessUnit',
    label: 'Business units',
    singular: 'Business unit',
    kind: 'org',
    refs: ORG_UNITS('businessUnit'),
    attrs: [
      { key: 'code', label: 'Code' },
      { key: 'owner', label: 'Owner' },
      {
        key: 'hrbp',
        label: 'HR business partner',
        readBy:
          'HRBP mode offers this person for the unit, and a request’s HRBP step goes to them: an employee ID from Workers.',
      },
    ],
    sheet: 'Business units',
    name: 'BusinessUnits',
    about:
      'The top of the org structure, each with its HR business partner. Departments roll up to one business unit each.',
  },
  {
    id: 'department',
    label: 'Departments',
    singular: 'Department',
    kind: 'org',
    refs: ORG_UNITS('department'),
    parent: 'businessUnit',
    attrs: [{ key: 'code', label: 'Code' }],
    sheet: 'Departments',
    name: 'Departments',
    about: 'Each department sits under one business unit and owns its cost centers.',
  },
  {
    id: 'costCenter',
    label: 'Cost centers',
    singular: 'Cost center',
    kind: 'org',
    refs: ORG_UNITS('costCenter'),
    parent: 'department',
    attrs: [{ key: 'name', label: 'Name' }],
    sheet: 'Cost centers',
    name: 'CostCenters',
    about: 'Cost center codes, each owned by one department, such as 1130-BLR.',
  },
  {
    id: 'location',
    label: 'Locations',
    singular: 'Location',
    kind: 'org',
    refs: ['positions.location', 'workers.location', 'requests.location'],
    attrs: [
      { key: 'country', label: 'Country' },
      { key: 'region', label: 'Region', options: REGIONS },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'currency', label: 'Currency' },
      { key: 'legalEntity', label: 'Legal entity' },
    ],
    sheet: 'Locations',
    name: 'Locations',
    about:
      'Work sites, with the country, region, jurisdiction, pay currency and legal entity of each. A blank legal entity on a seat reads the location’s.',
  },
  {
    id: 'region',
    label: 'Regions',
    singular: 'Region',
    kind: 'fixed',
    // No field holds a region: each location's region is on the Locations list.
    refs: [],
    attrs: [],
    sheet: 'Regions',
    name: 'Regions',
    about: 'The regions that locations roll up to. Each location’s region is set in the Locations list.',
  },
  {
    id: 'legalEntity',
    label: 'Legal entities',
    singular: 'Legal entity',
    kind: 'org',
    refs: ['positions.legalEntity', 'workers.legalEntity'],
    attrs: [
      { key: 'country', label: 'Country' },
      { key: 'currency', label: 'Currency' },
    ],
    sheet: 'Legal entities',
    name: 'LegalEntities',
    about: 'The employing companies, one per country in the sample, each with its country and currency.',
  },
  {
    id: 'currency',
    label: 'Currencies',
    singular: 'Currency',
    kind: 'vocab',
    refs: ['comp.currency', 'reqs.offerCurrency'],
    attrs: [],
    sheet: 'Currencies',
    name: 'Currencies',
    about: 'The ISO codes pay and offers are written in. Add the ones your people are paid in.',
  },
  {
    id: 'level',
    label: 'Levels',
    singular: 'Level',
    kind: 'fixed',
    refs: ['positions.level', 'workers.level', 'requests.level'],
    attrs: [
      { key: 'label', label: 'Label' },
      { key: 'track', label: 'Track', derived: true },
      {
        key: 'leader',
        label: 'Leader seats',
        options: YES_NO,
        readBy:
          'Cost atoms, the leader filter and the leader step read it: Yes makes every seat at the level a leader seat, No none. A seat’s own Leader seat column still wins.',
      },
    ],
    sheet: 'Levels',
    name: 'Levels',
    about:
      'The level ladder, P1 to E3. The app reads these exact codes. Director (M2) and above are leader seats unless you change it here.',
  },
  {
    id: 'jobFamily',
    label: 'Job families',
    singular: 'Job family',
    kind: 'org',
    refs: ['positions.jobFamily', 'requests.jobFamily'],
    attrs: [],
    sheet: 'Job families',
    name: 'JobFamilies',
    about: 'The broad groups of related jobs a seat belongs to.',
  },
  {
    id: 'reasonCode',
    label: 'Reason codes',
    singular: 'Reason code',
    kind: 'fixed',
    refs: ['requests.reasonCode'],
    attrs: [{ key: 'types', label: 'Offered for', derived: true }],
    sheet: 'Reason codes',
    name: 'ReasonCodes',
    about:
      'Why a request is made. The app reads these exact values; New request offers each for the request types shown, and Below the cut line is set only at cycle lock.',
  },
  {
    id: 'workerType',
    label: 'Worker types',
    singular: 'Worker type',
    kind: 'fixed',
    refs: ['positions.workerType', 'workers.workerType'],
    attrs: [{ key: 'heads', label: 'Heads', type: 'number', derived: true }],
    sheet: 'Worker types',
    name: 'WorkerTypes',
    about: 'Employee, Contractor and Intern. An employee counts 1 head; contractors and interns count 0.',
  },
  {
    id: 'role',
    label: 'Roles',
    singular: 'Role',
    kind: 'fixed',
    refs: [],
    reads: ['workers'],
    attrs: [
      {
        key: 'people',
        label: 'People',
        readBy:
          'Acting as offers these people in the role’s mode, and the Finance person approves Finance steps: employee IDs from Workers, separated by ";".',
      },
    ],
    sheet: 'Roles',
    name: 'Roles',
    about:
      'The people who act as HR admin and as Finance: their picks set who an audit entry and an approval are by.',
  },
]

export const LIST_IDS: readonly ListId[] = LIST_DEFS.map((d) => d.id)

const BY_ID = new Map(LIST_DEFS.map((d) => [d.id, d]))
const BY_REF = new Map<string, ListDef>()
for (const d of LIST_DEFS) for (const r of d.refs) BY_REF.set(r, d)

export const listDef = (id: ListId): ListDef => BY_ID.get(id) as ListDef

export const isListId = (v: unknown): v is ListId => typeof v === 'string' && BY_ID.has(v as ListId)

/** The list a field is checked against, or undefined. */
export const listOfRef = (ref: string): ListDef | undefined => BY_REF.get(ref)

/** Lists one level down: departments under business units, cost centers under departments. */
export const childLists = (id: ListId): ListDef[] => LIST_DEFS.filter((d) => d.parent === id)

/** Values can be added, renamed and moved (your own lists) or only added (the app's vocabularies). */
export const canAdd = (def: ListDef): boolean => def.kind !== 'fixed'

/**
 * Spellings that differ only in case or spacing ("Design Verification", "design verification",
 * "Design  Verification") are one value of a list: a list holds one of them, exactly as spelled.
 */
export const listKey = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Every field any list reads. */
export const LIST_REFS: readonly FieldRef[] = LIST_DEFS.flatMap((d) => d.refs)
