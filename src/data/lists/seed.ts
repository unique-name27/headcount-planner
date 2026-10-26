/**
 * Where lists start: the app's own vocabularies, the sample company's structure, and lists
 * proposed from your data. Pure.
 *
 * A value's parent (a department's business unit, a cost center's department) is proposed only
 * when most of its rows agree: over half of the rows that name a parent name the same one.
 * Otherwise it is left blank for you to set.
 */
import { isFilled } from '../quality/applicability'
import { parseFieldRef } from '../quality/fieldRef'
import {
  type DatasetKey,
  type Datasets,
  isLeaderLevel,
  LEVEL_LABELS,
  LEVELS,
  levelIndex,
  levelTrack,
  REASON_CODES,
  REASON_CODES_OF,
  REGIONS,
  REQUEST_TYPES,
  SITES,
  siteByLocation,
  WORKER_TYPES,
} from '../schema'
import { listDef, listKey, ROLES, type Role } from './defs'
import type { AttrValue, ListDef, ListId, ListValue } from './types'

type Row = Record<string, unknown>

const compare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
export const byValue = (a: ListValue, b: ListValue): number => compare(a.value, b.value)

/* ───────────── the app's own lists ───────────── */

/** "P4 Senior" → "Senior". */
const levelLabel = (l: (typeof LEVELS)[number]) => LEVEL_LABELS[l].replace(`${l} `, '')

/** The request types New request offers a reason for, in type order. */
function offeredFor(reason: string): string {
  if (reason === 'Below the cut line') return 'Set at cycle lock'
  return REQUEST_TYPES.filter((t) => (REASON_CODES_OF[t] as readonly string[]).includes(reason)).join(', ')
}

/** The currencies of the sample's sites, in site order. */
const SITE_CURRENCIES = [...new Set(SITES.map((s) => s.currency))]

/** The values of a vocabulary or fixed list as the app ships them. Empty for your own lists. */
export function builtinValues(id: ListId): ListValue[] {
  const built = (value: string, attrs?: Record<string, AttrValue>): ListValue => ({
    value,
    ...(attrs ? { attrs } : {}),
    builtIn: true,
  })
  switch (id) {
    case 'level':
      return LEVELS.map((l) =>
        built(l, { label: levelLabel(l), track: levelTrack(l), leader: isLeaderLevel(l) ? 'Yes' : 'No' }),
      )
    case 'region':
      return REGIONS.map((r) => built(r))
    case 'currency':
      return SITE_CURRENCIES.map((c) => built(c))
    case 'reasonCode':
      return REASON_CODES.map((r) => built(r, { types: offeredFor(r) }))
    case 'workerType':
      return WORKER_TYPES.map((w) => built(w, { heads: w === 'Employee' ? 1 : 0 }))
    case 'role':
      // Nobody is named until someone is (the sample names its own, see `sampleListValues`).
      return ROLES.map((r) => built(r, { people: null }))
    default:
      return []
  }
}

/** The values of the app's own list, for a field's static vocabulary. */
export const builtinNames = (id: ListId): string[] => builtinValues(id).map((v) => v.value)

/* ───────────── built from data ───────────── */

/** The field on the same row that names a value's parent, per dataset. */
const PARENT_FIELD: Partial<Record<ListId, Partial<Record<DatasetKey, string>>>> = {
  department: {
    positions: 'businessUnit',
    workers: 'businessUnit',
    requests: 'businessUnit',
    targets: 'businessUnit',
    freezes: 'businessUnit',
  },
  costCenter: {
    positions: 'department',
    workers: 'department',
    requests: 'department',
    targets: 'department',
    freezes: 'department',
  },
}

export class Tally {
  private readonly m = new Map<string, Map<string, number>>()
  add(key: string, value: string) {
    let c = this.m.get(key)
    if (!c) {
      c = new Map()
      this.m.set(key, c)
    }
    c.set(value, (c.get(value) ?? 0) + 1)
  }
  /** The value named most often (the first one found on a tie), or null. */
  top(key: string): string | null {
    let best: string | null = null
    let bestN = 0
    for (const [v, n] of this.m.get(key) ?? []) if (n > bestN) [best, bestN] = [v, n]
    return best
  }
  /** The value over half of the counts name, or null. */
  majority(key: string): string | null {
    const c = this.m.get(key)
    if (!c) return null
    let total = 0
    let best: string | null = null
    let bestN = 0
    for (const [v, n] of c) {
      total += n
      if (n > bestN) {
        best = v
        bestN = n
      }
    }
    return bestN * 2 > total ? best : null
  }
}

const text = (v: unknown): string | null => (isFilled(v) ? String(v).trim() : null)

/**
 * The values of one of your lists found in `data`, reading only the datasets `include` allows,
 * with the parent most rows agree on and, for locations and legal entities, what the known sites
 * say.
 *
 * Spellings that differ only in case or spacing are one value (`listKey`, the rule saved lists
 * follow too): the list holds the spelling most rows use (the first one found on a tie), and the
 * others show as values in the data that are not on the list, to map to it.
 */
export function listFromData(
  def: ListDef,
  data: Datasets,
  include: (key: DatasetKey) => boolean = () => true,
): ListValue[] {
  /** Spellings per value, with their row counts, in the order found. */
  const spellings = new Map<string, Map<string, number>>()
  const parents = new Tally()
  const parentField = PARENT_FIELD[def.id] ?? {}
  for (const ref of def.refs) {
    const p = parseFieldRef(ref)
    if (!p || !include(p.dataset)) continue
    const pf = parentField[p.dataset]
    for (const r of data[p.dataset] as unknown as readonly Row[]) {
      const v = text(r[p.field])
      if (!v) continue
      const key = listKey(v)
      let s = spellings.get(key)
      if (!s) {
        s = new Map()
        spellings.set(key, s)
      }
      s.set(v, (s.get(v) ?? 0) + 1)
      if (pf) {
        const parent = text(r[pf])
        if (parent) parents.add(key, parent)
      }
    }
  }
  const values = [...spellings].map(([key, s]): ListValue => {
    let value = ''
    let most = 0
    for (const [v, n] of s)
      if (n > most) {
        value = v
        most = n
      }
    const out: ListValue = { value }
    if (def.parent) out.parent = parents.majority(key)
    if (def.id === 'location') out.attrs = locationAttrs(value)
    if (def.id === 'legalEntity') out.attrs = legalEntityAttrs(value)
    return out
  })
  return values.sort(byValue)
}

/** A location's country, region, jurisdiction, currency and legal entity: the known site's, else blank. */
export function locationAttrs(location: string): Record<string, AttrValue> {
  const site = siteByLocation.get(location)
  return {
    country: site?.country ?? null,
    region: site?.region ?? null,
    jurisdiction: site?.jurisdiction ?? null,
    currency: site?.currency ?? null,
    legalEntity: site?.legalEntity ?? null,
  }
}

/** A legal entity's country and currency, from the known site it employs at; blank otherwise. */
export function legalEntityAttrs(entity: string): Record<string, AttrValue> {
  const site = SITES.find((s) => s.legalEntity === entity)
  return { country: site?.country ?? null, currency: site?.currency ?? null }
}

/* ───────────── the sample company ───────────── */

const OWN_LISTS: ListId[] = [
  'businessUnit',
  'department',
  'costCenter',
  'location',
  'legalEntity',
  'jobFamily',
]

/** "1130-BLR" → "1130". */
const ccNumber = (cc: string) => /^(\d+)/.exec(cc)?.[1] ?? null

/** "HR business partner, Silicon Engineering" or "HRBP Silicon Engineering". */
const HRBP_TITLE = /\b(?:hr business partner|hrbp)\b/i

/**
 * People the sample's lists name, when the caller knows them (the sample's personas): each unit's
 * HR business partner and the people of each role, by employee ID.
 */
export interface SamplePeople {
  hrbp?: Readonly<Record<string, string>>
  roles?: Partial<Record<Role, readonly string[]>>
}

/** The workers in their seats now: each worker's rows with no assignment end and no last day. */
function currentHolders(data: Datasets): Map<string, Datasets['workers'][number]> {
  const out = new Map<string, Datasets['workers'][number]>()
  for (const w of data.workers)
    if (w.positionId && !w.assignmentEnd && !w.terminationDate && w.workerType === 'Employee')
      out.set(w.positionId, w)
  return out
}

/**
 * The sample company's lists, built from its clean structure: the org units, cost centers, sites,
 * legal entities and job families it has, with codes from its cost center scheme, each business
 * unit's most senior person as its owner and its HR business partner (from `people`, else the
 * holder of an "HR business partner" seat whose title names the unit), and the people of each role
 * when `people` names them.
 */
export function sampleListValues(
  clean: Datasets,
  people: SamplePeople = {},
): Partial<Record<ListId, ListValue[]>> {
  const out: Partial<Record<ListId, ListValue[]>> = {}
  for (const id of OWN_LISTS) out[id] = listFromData(listDef(id), clean)

  // Codes: a department's is the number its cost centers share; a business unit's is the
  // hundred its departments' numbers fall in.
  const deptCode = new Tally()
  for (const p of clean.positions) {
    const n = p.costCenter ? ccNumber(p.costCenter) : null
    if (n && p.department) deptCode.add(p.department, n)
  }
  const departments = out.department ?? []
  for (const d of departments) d.attrs = { code: deptCode.majority(d.value) }
  const unitCode = new Tally()
  for (const d of departments) {
    const code = d.attrs?.code
    if (d.parent && typeof code === 'string' && code.length >= 2)
      unitCode.add(d.parent, `${code.slice(0, 2)}00`)
  }

  // Owners: the most senior person in a seat of the unit now. HRBPs: named, or found by title.
  const holders = currentHolders(clean)
  const latestSeat = new Map<string, Datasets['positions'][number]>()
  for (const p of clean.positions) {
    const cur = latestSeat.get(p.positionId)
    if (!cur || p.effectiveDate >= cur.effectiveDate) latestSeat.set(p.positionId, p)
  }
  const owner = new Map<string, { level: number; name: string; hired: string }>()
  const hrbpByTitle = new Map<string, string>()
  const units = (out.businessUnit ?? []).map((u) => u.value)
  for (const seat of latestSeat.values()) {
    if (seat.status === 'Eliminated') continue
    const w = holders.get(seat.positionId)
    if (!w) continue
    const lvl = levelIndex(seat.level)
    const cur = owner.get(seat.businessUnit)
    if (!cur || lvl > cur.level || (lvl === cur.level && w.hireDate < cur.hired))
      owner.set(seat.businessUnit, { level: lvl, name: w.name ?? w.employeeId, hired: w.hireDate })
    const title = seat.title ?? ''
    if (HRBP_TITLE.test(title)) {
      const unit = units.find((u) => title.toLowerCase().includes(u.toLowerCase()))
      if (unit && !hrbpByTitle.has(unit)) hrbpByTitle.set(unit, w.employeeId)
    }
  }
  for (const u of out.businessUnit ?? [])
    u.attrs = {
      code: unitCode.majority(u.value),
      owner: owner.get(u.value)?.name ?? null,
      hrbp:
        (people.hrbp && Object.hasOwn(people.hrbp, u.value) ? people.hrbp[u.value] : null) ??
        hrbpByTitle.get(u.value) ??
        null,
    }

  // A cost center's name is its department and site, as the sample's scheme builds them.
  const ccName = new Tally()
  for (const p of clean.positions)
    if (p.costCenter && p.department) ccName.add(p.costCenter, `${p.department}, ${p.location}`)
  for (const c of out.costCenter ?? []) c.attrs = { name: ccName.majority(c.value) }

  out.role = builtinValues('role').map((r) => {
    const named = people.roles?.[r.value as Role]
    return named?.length ? { ...r, attrs: { people: named.join(';') } } : r
  })
  return out
}
