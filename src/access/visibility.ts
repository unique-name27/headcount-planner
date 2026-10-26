/**
 * Person-level rules (docs/PLAN.md 8.4). Per-mode tables cannot say "never the person in the touched
 * seat", so these rules live in one module and are applied in every engine that lists or counts
 * requests, comments, audit rows or notifications, and to every workspace file exported, opened or
 * merged. An opened shared file is shown through the current mode and Acting as person, never
 * through the mode it was made in. src/plan/audit/ hashes, appends and verifies only; redaction for a
 * viewer is `auditView` alone.
 *
 * 1. Full view: the requester, the submitter (on behalf), every approver on the chain, the HRBP of
 *    each unit it touches, and HR admin.
 * 2. Limited: Leader (inside their org) and Finance (company) see requests in queues and counts; for
 *    Eliminations and changes to a Filled seat only position ID, title, level and org.
 *    2a. Transfers show the moving person's name, from, to, effective date, state and steps, never an
 *        amount, to rule 1's viewers, the managers above either side (Manager mode) and the leaders
 *        whose org holds either side (Leader mode); Finance sees them as rule 2 only.
 * 3. Never: the person in the touched seat or anyone below it, in any mode but HR admin: no row, no
 *    count change, no item, no notification, no audit entry, no allocation change (Manager C).
 * 4. Backfills show the leaver's position ID, never the leaver's name.
 * 5. Approvers-only comments reach only the chain's approvers, the units' HRBPs and HR admin. Text
 *    with an amount (`hasAmount`) is always Approvers only, never reaches Manager mode, and reasons
 *    and audit comments read "an amount" there (`managerText`).
 * 6. Aggregates on screen count only the rows the viewer may see.
 * 7. Audit: `auditView` applies `requestView` to the entry's request; outside HR admin pay and cost
 *    fields read "changed" and rows carry no `seq`, `prevHash` or `hash`.
 * 8. Routing never reads what rule 3 hides from the requester (src/plan/engine/chain.ts).
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled the bodies.
 *
 * Readings taken here: rule 2's "changes to a Filled seat" are read as every Level change and
 * Location change (the requests that change a seat in place), so Leader and Finance never see one in
 * full off the chain; rule 1's HRBP is the Units list's HRBP of any unit the request touches, plus
 * the HRBP pick's unit while that pick holds; in Manager mode an Approvers only comment never shows,
 * whoever approves (rule 5: "they never reach Manager mode").
 *
 * M3 review fixes (core-platform):
 *  - SC-14 (rule 5's grammar, R40): "Mio", "Mrd", "bln" and "Tsd" are size words ("1,2 Mio EUR");
 *    one or two capitals glued to a currency sign are part of it ("CA$ 900", "US$ 95,000"), so
 *    `managerText` replaces the whole span; and a spelled-out number with a size word ("two hundred
 *    thousand"), or a size word with a currency word ("a million dollars"), is an amount.
 *  - SP-14 (11.5's Audit row): outside HR admin, an assumption entry of the band table or of the
 *    trade standard head reads "changed", like a pay field (bp fields still show).
 */
import type { AnalyticsContext } from '@/data/context'
import { unitHrbps } from '@/data/lists/roles'
import type { EffectiveLists } from '@/data/lists/types'
import { DATASETS, type Mode, SITES } from '@/data/schema'
import type { PositionIndex } from '@/data/scope'
import type { AuditEntry, AuditRow, Comment, HcRequest } from '@/plan/types'
import { contextLists } from './lists'
import { can } from './policy'
import { holdingsOn, upward } from './scopes/people'
import type { ScopeLock } from './scopes/types'

export type { AuditRow } from '@/plan/types'

/** What `auditView` writes in place of a pay or cost field's old and new values outside HR admin. */
export const CHANGED = 'changed'

/** What `managerText` writes in place of each amount in Manager mode. */
export const AN_AMOUNT = 'an amount'

/** Who is looking: the mode and its Acting as person, with what the rules need to place them. */
export interface Viewer {
  mode: Mode
  /** The Acting as person; null while the mode's pick is to be made (they then see what no person sees). */
  personId: string | null
  /** The positions the Acting as person holds at the as-of date. */
  seatIds: ReadonlySet<string>
  /**
   * The viewer's seats and every position above them via managerPositionId: a request touching one of
   * these is about the viewer's own seat or a seat above it (rule 3).
   */
  atOrAbove: ReadonlySet<string>
  /** The units the viewer is HRBP of (the Units list's HRBP column; the HRBP pick's unit). */
  hrbpUnits: ReadonlySet<string>
  /** The mode's scope (Manager's tree, Leader's org, HRBP's unit); null for the company. */
  scope: ScopeLock | null
  /** The position tree at the as-of date (rule 2a's managers above each side, rule 3's tree below a seat). */
  positionIndex: PositionIndex
}

/**
 * The viewer for a context: its mode, Acting as pick, scope and position tree, and the lists in force
 * for the HRBP column (the ones the context was built with when not given). Memoized per context.
 */
export function viewerOf(
  ctx: Pick<AnalyticsContext, 'access' | 'positionIndex' | 'all' | 'asOf'>,
  lists?: EffectiveLists | null,
): Viewer {
  let byLists = viewers.get(ctx)
  if (!byLists) {
    byLists = new WeakMap()
    viewers.set(ctx, byLists)
  }
  const inForce = lists ?? contextLists(ctx)
  const key: object = inForce ?? NO_LISTS
  const hit = byLists.get(key)
  if (hit) return hit
  const a = ctx.access
  const personId = a.actingAs?.personId ?? null
  const seats = personId
    ? (holdingsOn(ctx.all.workers, ctx.asOf).seatsOf.get(personId) ?? []).filter((s) =>
        ctx.positionIndex.byId.has(s),
      )
    : []
  const atOrAbove = new Set<string>()
  for (const s of seats) for (const up of upward(s, ctx.positionIndex)) atOrAbove.add(up)
  const hrbpUnits = new Set<string>()
  if (personId && inForce)
    for (const [unit, id] of unitHrbps(inForce)) if (id === personId) hrbpUnits.add(unit)
  if (a.mode === 'hrbp' && !a.unset && a.actingAs?.unit) hrbpUnits.add(a.actingAs.unit)
  const v: Viewer = {
    mode: a.mode,
    personId,
    seatIds: new Set(seats),
    atOrAbove,
    hrbpUnits,
    scope: a.scope,
    positionIndex: ctx.positionIndex,
  }
  byLists.set(key, v)
  return v
}

const NO_LISTS = {}
const viewers = new WeakMap<object, WeakMap<object, Viewer>>()

/** How much of a request a viewer sees (rules 1 to 3; a Transfer is 'full' for rule 2a's viewers). */
export type RequestView = 'full' | 'limited' | 'none'

/** The seats a request touches for rule 3: its seat, the seats a trade gives, a transfer's from seat. */
function touchedSeats(req: HcRequest): string[] {
  return [req.positionId, ...(req.trade?.givePositionIds ?? []), req.transfer?.fromPositionId].filter(
    (x): x is string => !!x,
  )
}

/** Every seat a request touches or sits under, for the units it touches and an org's test. */
function allSeats(req: HcRequest): string[] {
  const t = req.transfer
  return [
    ...touchedSeats(req),
    req.managerPositionId,
    req.trade?.giveOrgPositionId,
    t?.toPositionId,
    t?.toManagerPositionId,
  ].filter((x): x is string => !!x)
}

/** The units a request touches: its own, and the unit of every seat it touches or sits under. */
function unitsOf(req: HcRequest, index: PositionIndex): Set<string> {
  const out = new Set<string>()
  if (req.businessUnit) out.add(req.businessUnit)
  for (const id of allSeats(req)) {
    const u = index.byId.get(id)?.businessUnit
    if (u) out.add(u)
  }
  return out
}

/** On the request's approval chain. */
const onChain = (req: HcRequest, v: Viewer): boolean =>
  !!v.personId && req.steps.some((s) => s.approverId === v.personId)

/** The HRBP of a unit the request touches. */
const unitHrbp = (req: HcRequest, v: Viewer): boolean =>
  v.hrbpUnits.size > 0 && [...unitsOf(req, v.positionIndex)].some((u) => v.hrbpUnits.has(u))

/** Rule 1: the requester, the submitter, an approver on the chain, a touched unit's HRBP. */
function ruleOne(req: HcRequest, v: Viewer): boolean {
  if (!v.personId) return false
  if (req.requesterId === v.personId || req.submittedById === v.personId) return true
  return onChain(req, v) || unitHrbp(req, v)
}

/** Rule 3: the viewer sits in a touched seat or in the tree below it. */
const ruleThree = (req: HcRequest, v: Viewer): boolean => touchedSeats(req).some((id) => v.atOrAbove.has(id))

/**
 * Rule 3 alone, in every mode but HR admin: the viewer sits in a seat the request touches or in the
 * tree below it, so nothing of the request, its effects included, may move what the viewer reads.
 * Plan > Hiring reads it to keep such a request's plan rows out of the forecast its expected exits
 * come from (docs/PLAN.md 9.7 Privacy; src/views/plan/engine/hiringData.ts).
 */
export function hiddenByRuleThree(req: HcRequest, viewer: Viewer): boolean {
  return viewer.mode !== 'hr-admin' && ruleThree(req, viewer)
}

/** Rule 2's limited kinds: an Elimination, and a change to a seat (read as Level and Location changes). */
const isSensitive = (req: HcRequest): boolean =>
  req.type === 'Elimination' || req.type === 'Level change' || req.type === 'Location change'

/** Inside a Leader's org: a seat the request touches or sits under is in the tree (the company: always). */
function inOrg(req: HcRequest, v: Viewer): boolean {
  const s = v.scope
  if (!s) return true
  const ids = allSeats(req)
  if (s.kind === 'unit') return req.businessUnit === s.unit || ids.some((id) => s.positionIds.has(id))
  return ids.some((id) => s.positionIds.has(id) || s.rootPositionIds.has(id))
}

/** The seats above a position (strictly), in the position tree. */
const above = (id: string | null | undefined, index: PositionIndex): string[] =>
  id ? upward(id, index).slice(1) : []

/** Rule 2a's viewers beyond rule 1: the managers above either side (Manager), the leaders whose org holds either side (Leader). */
function transferViewer(req: HcRequest, v: Viewer): boolean {
  const t = req.transfer
  if (!t) return false
  if (v.mode === 'manager') {
    const receiving =
      t.toManagerPositionId ?? v.positionIndex.byId.get(t.toPositionId ?? '')?.managerPositionId ?? null
    const seats = [
      ...above(t.fromPositionId, v.positionIndex),
      ...(receiving ? upward(receiving, v.positionIndex) : []),
    ]
    return seats.some((id) => v.seatIds.has(id))
  }
  if (v.mode === 'leader') {
    const s = v.scope
    if (!s) return true
    const inside = (id: string | null | undefined) =>
      !!id && (s.positionIds.has(id) || (s.kind === 'tree' && s.rootPositionIds.has(id)))
    return inside(t.fromPositionId) || inside(t.toPositionId) || inside(t.toManagerPositionId)
  }
  return false
}

/** Rules 1, 2, 2a and 3 (commentVisible still requires rule 1 for a Transfer's comments). */
export function requestView(req: HcRequest, viewer: Viewer): RequestView {
  if (viewer.mode === 'hr-admin') return 'full'
  if (ruleThree(req, viewer)) return 'none'
  if (req.type === 'Transfer') {
    // Finance sees transfers as rule 2 only, even on a step it approves (2a overrides rule 1).
    if (viewer.mode === 'finance') return 'limited'
    return ruleOne(req, viewer) || transferViewer(req, viewer) ? 'full' : 'none'
  }
  if (ruleOne(req, viewer)) return 'full'
  if ((viewer.mode === 'leader' && inOrg(req, viewer)) || viewer.mode === 'finance')
    return isSensitive(req) ? 'limited' : 'full'
  return 'none'
}

/** Rule 5: whether a comment on a request reaches the viewer. */
export function commentVisible(c: Comment, req: HcRequest, viewer: Viewer): boolean {
  if (viewer.mode === 'hr-admin') return true
  if (requestView(req, viewer) !== 'full') return false
  // Comments on a transfer reach rule 1 viewers only.
  if (req.type === 'Transfer' && !ruleOne(req, viewer)) return false
  if (viewer.mode === 'manager' && (c.audience === 'approvers' || hasAmount(c.text))) return false
  if (c.audience === 'approvers') return onChain(req, viewer) || unitHrbp(req, viewer)
  return true
}

/** What a limited view keeps of an entry (rule 7): the state, the seat, its title, level and org. */
const LIMITED_FIELDS: ReadonlySet<string> = new Set([
  'state',
  'status',
  'positionId',
  'jobTitle',
  'title',
  'level',
  'businessUnit',
  'department',
  'costCenter',
  'managerPositionId',
])

/** Every field a dataset marks as one person's amount or a money value, by key. */
const PAY_FIELDS: ReadonlySet<string> = new Set([
  ...DATASETS.flatMap((d) => d.fields.filter((f) => f.pay || f.type === 'money').map((f) => f.key)),
  'standardHeadUsd',
  'band',
  'bandUsd',
  'getBandUsd',
  'giveBandUsd',
  'bandEstimate',
  'bandEstimateUsd',
  'costAnnual',
  'severance',
])

/**
 * Org fields whose names hold an amount word but that name a place, never an amount: a cost center is
 * a code ('1220-SJC'), like a department. Rule 7 keeps org fields on every view (M3, core: the M3
 * freeze's one over-redacted field, docs/CONTRACTS-M3.md open item 3).
 */
const ORG_FIELDS: ReadonlySet<string> = new Set(['costCenter'])

/** A pay or cost field (rule 7): one a dataset marks, or one that names an amount; basis-point and org fields show. */
export function isPayField(field: string): boolean {
  if (/bp$/i.test(field) || ORG_FIELDS.has(field)) return false
  return (
    PAY_FIELDS.has(field) ||
    /usd|local|salary|amount|cost|bonus|severance|relocation|agency|offer/i.test(field)
  )
}

/**
 * Rule 7: an audit entry as the viewer may see it. HR admin: the entry. Otherwise an `AuditRow` (no
 * `seq`, `prevHash` or `hash`), redacted, or null when its request is hidden from the viewer.
 * `requestOf` finds the request an entry belongs to (its own `request` entries, and the `position`
 * entries its approval wrote); without it only the entry's own fields decide, and a request or
 * transfer entry whose request is unknown is dropped.
 */
export function auditView(
  e: AuditEntry,
  viewer: Viewer,
  requestOf?: (e: AuditEntry) => HcRequest | null,
): AuditEntry | AuditRow | null {
  if (viewer.mode === 'hr-admin') return e
  const req = requestOf?.(e) ?? null
  if (!req && (e.object === 'request' || e.object === 'transfer')) return null
  const view: RequestView = req ? requestView(req, viewer) : 'full'
  if (view === 'none') return null
  // Scoped to the mode's scope: a position entry outside it is dropped.
  if (!req && e.object === 'position' && viewer.scope && !viewer.scope.positionIds.has(e.id)) return null
  const { seq: _seq, prevHash: _prev, hash: _hash, ...row } = e
  let out: AuditRow = row
  if (view === 'limited') {
    if (!LIMITED_FIELDS.has(e.field)) return null
    const who = req && e.by === req.requesterId ? 'Requester' : 'Approver'
    out = { ...out, by: who, byName: who, effectiveDate: null, comment: null, commentAudience: null }
  } else if (out.comment && out.commentAudience) {
    const shown = req
      ? commentVisible(
          { id: '', at: e.at, by: e.by, mode: e.mode, text: out.comment, audience: out.commentAudience },
          req,
          viewer,
        )
      : out.commentAudience === 'everyone' && !(viewer.mode === 'manager' && hasAmount(out.comment))
    if (!shown) out = { ...out, comment: null, commentAudience: null }
  }
  // Where band estimates are hidden (Manager), every assumption value reads "changed", whatever the
  // field is called: a band midpoint's field is 'value', like a rate's (review RM-2, defense in depth
  // beside the Audit model's own rule).
  const bandHidden = e.object === 'assumption' && !can(viewer.mode, 'cost:band')
  // 11.5's Audit row (review SP-14): outside HR admin a band midpoint and the standard head are
  // amounts of the pay structure, so their changes read "changed" (rates and bp fields show).
  if (bandHidden || isPayField(e.field) || payStructureEntry(e))
    out = { ...out, old: out.old == null ? out.old : CHANGED, new: out.new == null ? out.new : CHANGED }
  if (viewer.mode === 'manager' && out.comment) out = { ...out, comment: managerText(out.comment, viewer) }
  return out
}

/**
 * An assumption entry of the band table or of the trade table's standard head (review SP-14): its id
 * is '<version>|<table>|<org>|<key>' (src/plan/actions/versions.ts `assumptionAuditId`).
 */
export function payStructureEntry(e: Pick<AuditEntry, 'object' | 'id'>): boolean {
  if (e.object !== 'assumption') return false
  const parts = e.id.split('|')
  const table = parts[1]
  if (table === 'band') return true
  return table === 'trade' && parts.slice(3).join('|').trim() === 'standardHeadUsd'
}

/* ───────────── amounts in text (rule 5) ───────────── */

/** ISO codes of the currencies the app knows, and the common others. */
const ISO_CODES: ReadonlySet<string> = new Set([
  ...SITES.map((s) => s.currency),
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'NZD',
  'SGD',
  'HKD',
  'KRW',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'MXN',
  'BRL',
  'ZAR',
])

/** Currency words that make a number an amount ("2,000 euros"). */
const CURRENCY_WORDS = /^(dollars?|euros?|rupees?|shekels?|pounds?|yen|yuan|renminbi|dong|bucks)\b/i

/** A size word's multiplier: "95k", "1.2M", "3bn", "14 lakh", "1.4 crore", "140 grand". */
const SUFFIX: Readonly<Record<string, number>> = {
  k: 1e3,
  thousand: 1e3,
  grand: 1e3,
  lakh: 1e5,
  lakhs: 1e5,
  lac: 1e5,
  lacs: 1e5,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  crore: 1e7,
  crores: 1e7,
  cr: 1e7,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  // German and Dutch spellings (review SC-14): "1,2 Mio", "5 Mrd", "3 bln", "140 Tsd".
  tsd: 1e3,
  mio: 1e6,
  mrd: 1e9,
  bln: 1e9,
}

/** The size words, longest first so "mm" wins over "m" and "lakhs" over "lakh". */
const SUFFIX_WORDS = Object.keys(SUFFIX).sort((a, b) => b.length - a.length || (a < b ? -1 : 1))

/**
 * Thousands separators: comma, dot, space, no-break and narrow no-break space, thin space and the
 * apostrophes ("140,000", "140.000", "140 000", "140'000"). One run uses one separator throughout.
 */
const SEP = "[,.\\u0020\\u00a0\\u2009\\u202f'\\u2019]"

/**
 * One number in text: Indian grouping ("12,40,000"), thousands grouped with one separator throughout,
 * or plain digits; then an optional decimal part (a dot or a comma) and an optional size word. The
 * digits never start inside another number or its decimal part, or after "_" (the scan checks what
 * stands before a "-", "/" or letter itself).
 */
const NUMBER = new RegExp(
  `(?<![\\p{N}_]|\\p{N}\\.)` +
    `(?<int>\\d{1,2}(?:,\\d{2})+,\\d{3}(?!\\d)|\\d{1,3}(?:(?<sep>${SEP})\\d{3}(?!\\d))(?:\\k<sep>\\d{3}(?!\\d))*|\\d+)` +
    `(?<dec>[.,]\\d+)?` +
    `(?:\\s?(?<suffix>${SUFFIX_WORDS.join('|')})(?![\\p{L}\\p{N}]))?`,
  'giu',
)

/**
 * A currency sign (with one or two capitals glued before it: "CA$", "US$", "A$", "HK$", "R$"), a
 * three-letter ISO code or "Rs" right before the digits, with at most one space.
 */
const BEFORE =
  /(?:(?<sign>(?:(?<![\p{L}\p{N}_])[A-Z]{1,2})?\p{Sc})|(?<![\p{L}\p{N}_])(?<word>[A-Z]{3}|Rs\.?))\s?$/u
/** A currency sign or a three-letter ISO code right after the number, with at most one space. */
const AFTER = /^\s?(?:(?<sign>\p{Sc})|(?<code>[A-Z]{3})(?![\p{L}\p{N}]))/u
/** A currency sign or ISO code left on its own once the numbers are replaced. */
const LONE_MONEY = /\p{Sc}|(?<![\p{L}\p{N}_])[A-Z]{3}(?![\p{L}])/gu

interface AmountSpan {
  start: number
  end: number
}

const isIso = (w: string | undefined): boolean => !!w && ISO_CODES.has(w)
const LETTER = /[\p{L}]/u
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/**
 * A run grouped by dots reads as thousands only when it cannot be a decimal: the leading group has no
 * leading zero, and there are two or more groups ("1.400.000"), a decimal comma follows
 * ("140.000,00"), the leading group has 2 or 3 digits ("14.000", "140.000"), or money marks it
 * ("€1.500"). Otherwise it is a decimal ("1.043 standard heads", "0.753").
 */
function dotGrouped(int: string, dec: string, money: boolean): boolean {
  if (int.startsWith('0')) return false
  const groups = int.split('.')
  return groups.length > 2 || dec.startsWith(',') || groups[0].length >= 2 || money
}

/** Number words, from one to ninety and hundred (a spelled-out amount's digits). */
const NUMBER_WORD =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)'
/** The size words a spelled-out amount ends on. */
const SCALE_WORD = '(?:thousand|million|billion|lakhs?|lacs?|crores?|grand)'
/** The currency words after a number or a size word (`CURRENCY_WORDS`, unanchored). */
const CURRENCY_WORD = '(?:dollars?|euros?|rupees?|shekels?|pounds?|yen|yuan|renminbi|dong|bucks)'

/**
 * A spelled-out amount (review SC-14): number words then a size word ("two hundred thousand",
 * "fifty grand"), or "a" or "an" then a size word and a currency word ("a million dollars"), each
 * with the currency word after it taken in.
 */
const SPELLED = new RegExp(
  `(?<![\\p{L}])(?:${NUMBER_WORD}(?:[\\s-]+(?:and[\\s-]+)?${NUMBER_WORD})*[\\s-]+${SCALE_WORD}(?:\\s+${CURRENCY_WORD})?|an?\\s+${SCALE_WORD}\\s+${CURRENCY_WORD})(?![\\p{L}])`,
  'giu',
)

/** The spans of text that are amounts (see `hasAmount`). */
function amountSpans(text: string): AmountSpan[] {
  const out = digitSpans(text)
  const re = new RegExp(SPELLED.source, SPELLED.flags)
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ start: m.index, end: m.index + m[0].length })
  return out.sort((a, b) => a.start - b.start || b.end - a.end)
}

/** The spans of text whose digits are amounts. */
function digitSpans(text: string): AmountSpan[] {
  const out: AmountSpan[] = []
  const re = new RegExp(NUMBER.source, NUMBER.flags)
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const g = m.groups ?? {}
    const at = m.index
    let int = g.int ?? ''
    let dec = g.dec ?? ''
    const sep = g.sep ?? ''
    const suffix = g.suffix ?? ''
    const end = at + m[0].length
    const prev = text[at - 1] ?? ''
    const next = text[end] ?? ''

    // What stands before the digits: a currency sign or code (glued or one space away), else nothing
    // that makes the digits part of a code ("P-2589", "E10077", "FY27", "1550-HSZ/1560-HSZ").
    const before = BEFORE.exec(text.slice(Math.max(0, at - 6), at))
    const preSign = !!before?.groups?.sign
    const preCode = isIso(before?.groups?.word) || /^Rs\.?$/.test(before?.groups?.word ?? '')
    const pre = preSign || preCode
    const preStart = pre && before ? at - before[0].length : at
    if (!pre && LETTER.test(prev)) {
      // The digits end a code ("P4", "FY27"); a number grouped after it ("P4 140 000") is read on its own.
      re.lastIndex = at + (/^\d+/.exec(m[0])?.[0].length ?? m[0].length)
      continue
    }
    if (!pre && (prev === '-' || prev === '/') && LETTER_OR_DIGIT.test(text[at - 2] ?? '') && !sep) {
      // "R-1025", "2026-12-31": a code or a date part, unless it is the second half of a range of
      // grouped amounts ("140,000-150,000"), which the grouping marks.
      if (LETTER.test(text[at - 2] ?? '') || !/\d[,.\s'’]\d{3}$/u.test(text.slice(0, at - 1))) continue
    }

    // What stands after: a currency sign or code, or a currency word.
    const after = AFTER.exec(text.slice(end, end + 5))
    const postSign = !!after?.groups?.sign
    const postCode = isIso(after?.groups?.code)
    const post = postSign || postCode
    const word = CURRENCY_WORDS.test(text.slice(end).trimStart())
    const money = pre || post || word

    const plain = !sep && !int.includes(',') && !dec && !suffix
    // A plain run joined to a code or a date: "1550-HSZ", "2026-12-31", "5000abc"; but not one per a
    // period ("95000/yr", "8000/month": M3 recheck), which is an amount like any other.
    const perPeriod = next === '/' && PER_PERIOD.test(text.slice(end + 1))
    if (
      plain &&
      !money &&
      !perPeriod &&
      (next === '-' || next === '/') &&
      LETTER_OR_DIGIT.test(text[end + 1] ?? '')
    )
      continue
    if (!post && !suffix && LETTER_OR_DIGIT.test(next)) continue

    // A dot run that is a decimal ("1.043") reads as its leading group and a decimal part.
    if (sep === '.' && !dotGrouped(int, dec, money)) {
      const [lead, frac] = int.split('.')
      int = lead
      dec = `.${frac}`
    }
    const decimal = dec && !(sep === ',' && dec.startsWith(',')) && !(sep === '.' && dec.startsWith('.'))
    const digits = int.replace(/\D/g, '')
    const value =
      Number(`${digits}${decimal ? `.${dec.slice(1)}` : ''}`) *
      (suffix ? (SUFFIX[suffix.toLowerCase()] ?? 1) : 1)
    // A plain four-digit year is not an amount ("in 2027"), unless money marks it.
    const year = plain && /^(19|20)\d{2}$/.test(int)
    if (!(money || !!suffix || (value >= 1000 && !year))) continue
    out.push({ start: preStart, end: post && after ? end + after[0].length : end })
  }
  out.push(...rangeSpans(text))
  return out
}

/** A period after a slash: "95000/yr", "8000/month", "120000/annum" (M3 recheck). */
const PER_PERIOD =
  /^(?:yrs?|years?|annum|pa|p\.a\.|mos?|months?|mths?|wks?|weeks?|days?|hrs?|hours?)(?![\p{L}\p{N}])/iu

/**
 * Two numbers joined by a dash, "to" or "and" (M3 recheck): "95000-110000", "95-110k", "1.2-1.5M",
 * "95k-110k", "between 95 and 110 thousand". Neither end may follow a letter, a digit, a dash, a
 * slash or a separator (codes and IDs: "P-1030-1059", "R-K7QM-1371"), and the second is not followed
 * by a letter, a digit or a dash or slash and more digits (dates: "2026-12-31").
 */
const RANGE = new RegExp(
  `(?<![\\p{L}\\p{N}_.,:'’/-])(?<a>\\d+(?:[.,]\\d+)?)(?:\\s?(?<as>${SUFFIX_WORDS.join('|')})(?![\\p{L}\\p{N}]))?` +
    `(?:\\s?[-–]\\s?|\\s+(?:to|and)\\s+)` +
    `(?<b>\\d+(?:[.,]\\d+)?)(?:\\s?(?<bs>${SUFFIX_WORDS.join('|')}))?(?![\\p{L}\\p{N}]|[-/]\\d)`,
  'giu',
)

/**
 * The ranges that are amounts (M3 recheck, beside R40): either end 1,000 or more (a plain four-digit
 * year is not), or a size word on either end, which reads for both ("95-110k" is 95,000 to 110,000).
 * The span covers both ends and the size word, so Manager mode reads the whole range as "an amount".
 */
function rangeSpans(text: string): AmountSpan[] {
  const out: AmountSpan[] = []
  const big = (s: string): boolean => !/^(19|20)\d{2}$/.test(s) && Number(s.replace(',', '.')) >= 1000
  const re = new RegExp(RANGE.source, RANGE.flags)
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const g = m.groups ?? {}
    if (g.as || g.bs || big(g.a ?? '') || big(g.b ?? ''))
      out.push({ start: m.index, end: m.index + m[0].length })
    // Read on from just after the first end: the second may start a range of its own ("95 to 110 to 120").
    re.lastIndex = m.index + Math.max(1, g.a?.length ?? 1)
  }
  return out
}

/**
 * Rule 5: true for a currency sign or ISO currency code, or a number worth 1,000 or more, grouped or
 * not ("95k" and "1.2M" count). Readings taken: every common spelling counts (thousands grouped by
 * commas, dots, spaces or apostrophes, Indian grouping, decimal commas, k, M, lakh, crore and grand,
 * a sign or ISO code before or after, glued or not); a dot run that can only be a decimal
 * ("1.043 standard heads") is not grouped; identifiers and dates are not numbers ("P-2589",
 * "1550-HSZ", "2026-12-31", "31.12.2026"), and a plain four-digit year is not an amount.
 */
export function hasAmount(text: string): boolean {
  if (!text) return false
  if (/\p{Sc}/u.test(text)) return true
  for (const w of text.match(/(?<![\p{L}\p{N}_])[A-Z]{3}(?![\p{L}])/gu) ?? [])
    if (ISO_CODES.has(w)) return true
  return amountSpans(text).length > 0
}

/**
 * Rule 5: in Manager mode each amount in the text becomes "an amount", its sign or code included,
 * and so does a currency sign or ISO code left on its own, so nothing `hasAmount` finds is left.
 * Other modes get the text unchanged.
 */
export function managerText(text: string, viewer: Pick<Viewer, 'mode'>): string {
  if (viewer.mode !== 'manager' || !text) return text
  let out = ''
  let at = 0
  for (const s of amountSpans(text)) {
    if (s.start < at) {
      // Two amounts sharing a sign ("5€6"): one replacement covers both.
      at = Math.max(at, s.end)
      continue
    }
    out += text.slice(at, s.start) + AN_AMOUNT
    at = s.end
  }
  out += text.slice(at)
  return out.replace(LONE_MONEY, (w) => (w.length === 3 && !ISO_CODES.has(w) ? w : AN_AMOUNT))
}
