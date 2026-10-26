/**
 * Enum and level vocabularies: how free text from HR, recruiting and planning systems maps onto the
 * canonical spellings in `schema.ts`. Every normalizer takes `normText(raw)` and returns a
 * canonical value or null. Null means "not recognized": the importer reports it and never guesses a
 * default.
 */
import {
  ASSUMPTION_KEYS,
  ASSUMPTION_TABLES,
  type AssumptionTable,
  type DatasetKey,
  type Level,
} from '../schema'
import { normText } from './text'

type Normalizer = (t: string) => string | null

/** Ordered rules: the first pattern that matches decides. */
type Rule = readonly [RegExp, string]

/** Any of the phrases as whole words; a trailing `*` lets the word continue ("promot*"). */
function words(...phrases: string[]): RegExp {
  return new RegExp(`\\b(?:${phrases.map((p) => p.replace(/\*$/, '\\w*')).join('|')})\\b`)
}

const firstMatch =
  (rules: readonly Rule[]): Normalizer =>
  (t) => {
    for (const [re, value] of rules) if (re.test(t)) return value
    return null
  }

/** The canonical value whose normalized text equals `t`. */
export function matchCanonical(values: readonly string[], t: string): string | null {
  for (const v of values) if (normText(v) === t) return v
  return null
}

/* ───────────── levels ───────────── */

const LEVEL_WORDS = firstMatch([
  [
    words(
      'svp',
      'evp',
      'senior vice president',
      'executive vice president',
      'senior vp',
      'executive vp',
      'sr vp',
    ),
    'E2',
  ],
  [words('vp', 'vice president', 'avp'), 'E1'],
  [
    words(
      'ceo',
      'cfo',
      'coo',
      'cto',
      'cio',
      'cpo',
      'chro',
      'cro',
      'cxo',
      'chief',
      'c suite',
      'csuite',
      'c level',
      'clevel',
      'president',
    ),
    'E3',
  ],
  [words('director', 'dir'), 'M2'],
  [words('manager', 'mgr', 'supervisor', 'people manager', 'management'), 'M1'],
  [words('executive'), 'E3'],
  [words('principal', 'distinguished', 'fellow'), 'P6'],
  [words('staff'), 'P5'],
  [words('senior', 'sr'), 'P4'],
  [words('junior', 'jr', 'entry', 'associate', 'intern', 'graduate', 'trainee', 'apprentice'), 'P1'],
])

/**
 * Career level from codes, numbers or title words. Codes first (P1-P6, M1-M2, E1-E3; IC, L and T
 * 1-6 are read as P levels, so "IC4" and "L4" are P4), then words from most to least senior so
 * "Senior manager" lands on M1 and "Senior staff" on P5.
 */
export function normalizeLevel(raw: unknown): Level | null {
  if (typeof raw === 'number')
    return Number.isInteger(raw) && raw >= 1 && raw <= 6 ? (`P${raw}` as Level) : null
  const t = normText(raw)
  if (!t) return null
  const compact = t.replace(/\s+/g, '')
  let m = /^(?:level|lvl|grade)?(l|ic|p|t)?([1-6])$/.exec(compact)
  if (m) return `P${m[2]}` as Level
  m = /^(?:l|ic|p|t)\s?([1-6])\b/.exec(t) ?? /^level\s?([1-6])$/.exec(t)
  if (m) return `P${m[1]}` as Level
  m = /^m\s?([12])\b/.exec(t)
  if (m) return `M${m[1]}` as Level
  m = /^e\s?([1-3])\b/.exec(t)
  if (m) return `E${m[1]}` as Level
  return LEVEL_WORDS(t) as Level | null
}

/* ───────────── people and seats ───────────── */

/** Contractor words are checked before employee words: "Contract employee" is a contractor. */
const workerType = firstMatch([
  [
    words('intern', 'interns', 'internship', 'co op', 'coop', 'student', 'apprentice*', 'trainee', 'summer'),
    'Intern',
  ],
  [
    words(
      'contractor',
      'contract',
      'contingent',
      'temp',
      'temporary',
      'consult*',
      'vendor',
      'agency',
      'freelance*',
      'outsourced',
      '1099',
      'c2c',
      'cwr',
    ),
    'Contractor',
  ],
  [
    words(
      'fte',
      'regular',
      'full time',
      'fulltime',
      'part time',
      'parttime',
      'permanent',
      'employee',
      'salaried',
      'hourly',
      'exempt',
      'non exempt',
      'w2',
      'ft',
      'pt',
      'staff',
      'direct hire',
    ),
    'Employee',
  ],
])

/**
 * A seat's status. Eliminated and On hold are checked first ("Closed", "Frozen"); "Not filled" is
 * an Open seat, and "Not yet open" a Planned one.
 */
const positionStatus = firstMatch([
  [
    words(
      'eliminat*',
      'abolished',
      'closed',
      'inactive',
      'inactivated',
      'deleted',
      'cancel*',
      'retired',
      'removed',
      'terminated',
    ),
    'Eliminated',
  ],
  [words('on hold', 'hold', 'frozen', 'freeze', 'paused', 'suspended'), 'On hold'],
  [words('not yet open', 'not open', 'not opened', 'to be opened', 'future'), 'Planned'],
  [words('not filled', 'unfilled', 'vacant', 'vacancy', 'available', 'open', 'opened', 'recruiting'), 'Open'],
  [words('filled', 'occupied', 'incumbent', 'staffed', 'encumbered'), 'Filled'],
  [words('planned', 'plan', 'proposed', 'approved', 'budgeted', 'pending'), 'Planned'],
])

/** Why a seat ended. */
const endReason = firstMatch([
  [words('trade*', 'traded', 'swap*'), 'Traded'],
  [words('transfer*', 'moved', 'move', 'relocated'), 'Transferred'],
  [
    words(
      'eliminat*',
      'abolish*',
      'rif',
      'reduction',
      'restructur*',
      'closed',
      'cut',
      'removed',
      'redundan*',
    ),
    'Eliminated',
  ],
])

/* ───────────── recruiting ───────────── */

/** "Closed - filled" is checked before "Closed", which on its own means cancelled. */
const reqStatus = firstMatch([
  [words('closed filled', 'filled', 'closed hired', 'hired'), 'Filled'],
  [words('on hold', 'hold', 'paused', 'pause', 'frozen', 'freeze', 'suspended'), 'On hold'],
  [words('cancel*', 'closed', 'withdrawn', 'abandoned', 'eliminated'), 'Cancelled'],
  [
    words(
      'open',
      'opened',
      'approved',
      'sourcing',
      'active',
      'posted',
      'interviewing',
      'in progress',
      'reopened',
      'live',
    ),
    'Open',
  ],
])

/**
 * The req's stage. An accepted offer is checked before any other offer: an offer that is only
 * extended is still interviewing.
 */
const reqStage = firstMatch([
  [words('started', 'hired', 'onboard*', 'joined', 'start*'), 'Started'],
  [words('offer accepted', 'accepted', 'pre ?boarding', 'preboarding'), 'Offer accepted'],
  [/\boffer/, 'Interviewing'],
  [
    words(
      'interview*',
      'screen*',
      'onsite',
      'on site',
      'assessment',
      'panel',
      'shortlist*',
      'sourcing',
      'sourced',
      'phone',
      'final round',
      'reference*',
      'applied',
      'application*',
    ),
    'Interviewing',
  ],
  [words('req opened', 'opened', 'open', 'new', 'approved', 'posted', 'created', 'intake'), 'Req opened'],
])

const reqType = firstMatch([
  [words('backfill', 'replacement', 'replace', 'attrition'), 'Backfill'],
  [
    words('new', 'net new', 'growth', 'incremental', 'addition', 'additional', 'expansion', 'budgeted'),
    'New',
  ],
])

/* ───────────── requests ───────────── */

/** Specific types first: a "Backfill trade" is a trade, a "New hire backfill" a backfill. */
const requestType = firstMatch([
  [words('trade', 'trades', 'swap', 'exchange', 'headcount trade'), 'Trade'],
  [words('start recruiting', 'open req', 'open requisition', 'recruit*', 'start hiring'), 'Start recruiting'],
  [words('start date', 'new start date', 'move start', 'change start'), 'Start date'],
  [words('backfill', 'replacement', 'replace', 'attrition'), 'Backfill'],
  [
    words(
      'level change',
      're level',
      'relevel',
      'regrade',
      're grade',
      'grade change',
      'promotion',
      'upgrade',
      'downgrade',
    ),
    'Level change',
  ],
  [
    words('location change', 'location move', 'relocation', 'relocate', 'site change', 'change location'),
    'Location change',
  ],
  [words('transfer', 'internal move', 'position move', 'move'), 'Transfer'],
  [
    words('eliminat*', 'remove', 'removal', 'cut', 'rif', 'reduction', 'close position', 'close seat'),
    'Elimination',
  ],
  [
    words('new role', 'new position', 'new headcount', 'net new', 'new', 'growth', 'addition', 'add'),
    'New role',
  ],
])

/** Negative words first: "Not approved" is rejected, "Not submitted" a draft. */
const requestState = firstMatch([
  [
    words(
      'approved with changes',
      'approved with edits',
      'approved with modifications',
      'approved modified',
      'partially approved',
      'approved with conditions',
    ),
    'Approved with changes',
  ],
  [
    words(
      'sent back',
      'send back',
      'returned',
      'return*',
      'needs changes',
      'needs info',
      'more info',
      'rework',
    ),
    'Sent back',
  ],
  [words('not submitted', 'unsubmitted', 'draft*', 'saved', 'not started'), 'Draft'],
  [words('withdraw*', 'withdrew', 'cancel*', 'retracted', 'recalled'), 'Withdrawn'],
  [words('expired', 'lapsed', 'timed out', 'stale'), 'Expired'],
  [words('reject*', 'declined', 'denied', 'not approved', 'refused'), 'Rejected'],
  [words('approved', 'accepted', 'granted', 'complete*', 'done'), 'Approved'],
  [
    words(
      'in review',
      'under review',
      'reviewing',
      'pending*',
      'awaiting*',
      'waiting',
      'in progress',
      'in approval',
      'routing',
    ),
    'In review',
  ],
  [words('submitted', 'new', 'open', 'raised'), 'Submitted'],
])

const reasonCode = firstMatch([
  [words('below the cut line', 'below cut line', 'cut line', 'below the line'), 'Below the cut line'],
  [words('freeze exception', 'exception'), 'Freeze exception'],
  [words('cost neutral', 'neutral', 'mix change'), 'Cost-neutral mix'],
  [words('level mix', 'leveling', 'levelling', 'level balance'), 'Level mix'],
  [words('location strategy', 'site strategy', 'geo strategy', 'location'), 'Location strategy'],
  [
    words('attrition backfill', 'backfill', 'attrition', 'replacement', 'replace', 'regrettable loss'),
    'Attrition backfill',
  ],
  [words('new capability', 'capability', 'new skill*', 'skills gap', 'new product'), 'New capability'],
  [words('restructur*', 'reorg*', 're org', 'reorganization', 'reorganisation'), 'Restructure'],
  [
    words('cost reduction', 'cost saving*', 'cost cut*', 'savings', 'budget cut*', 'reduce cost', 'cost'),
    'Cost reduction',
  ],
  [words('growth', 'grow', 'expansion', 'scale', 'scaling', 'demand'), 'Growth'],
  [words('other', 'misc*', 'miscellaneous'), 'Other'],
])

/** Internal first: "Internal position move" is a person filling an Open seat. */
const transferKind = firstMatch([
  [
    words('internal move', 'internal', 'person move', 'internal transfer', 'fill open seat', 'internal hire'),
    'Internal move',
  ],
  [words('position move', 'seat move', 'move position', 'move seat', 'position', 'seat'), 'Position move'],
])

/* ───────────── assumptions ───────────── */

const TABLE_ALIASES: Record<string, AssumptionTable> = {
  bands: 'band',
  'band midpoint': 'band',
  midpoint: 'band',
  midpoints: 'band',
  'salary band': 'band',
  'salary bands': 'band',
  'pay band': 'band',
  'pay bands': 'band',
  'bonus target': 'bonusTarget',
  'sti target': 'bonusTarget',
  'target incentive': 'bonusTarget',
  'bonus funding': 'bonusFunding',
  funding: 'bonusFunding',
  sbc: 'equity',
  stock: 'equity',
  lti: 'equity',
  'payroll tax': 'burden',
  'payroll taxes': 'burden',
  'employer tax': 'burden',
  'employer taxes': 'burden',
  'social charges': 'burden',
  'burden rate': 'burden',
  'burden cap': 'burdenCap',
  'tax cap': 'burdenCap',
  'wage base': 'burdenCap',
  benefit: 'benefits',
  'merit increase': 'merit',
  'promotion budget': 'promotionPool',
  'fx rate': 'fx',
  'exchange rate': 'fx',
  'exchange rates': 'fx',
  'currency rate': 'fx',
  'currency rates': 'fx',
  ttf: 'timeToFill',
  'days to fill': 'timeToFill',
  turnover: 'attrition',
  'attrition rate': 'attrition',
  'turnover rate': 'attrition',
  vacancy: 'vacancyFactor',
  'vacancy rate': 'vacancyFactor',
  'gl account': 'glAccount',
  gl: 'glAccount',
  account: 'glAccount',
  accounts: 'glAccount',
  trades: 'trade',
  'trade rate': 'trade',
  'trade ratio': 'trade',
  'trade ratios': 'trade',
}

/** A table by its code ("bonusTarget"), its label ("Target bonus") or a common name ("FX rate"). */
export const normalizeAssumptionTable: Normalizer = (t) => {
  const compact = t.replace(/\s+/g, '')
  for (const table of ASSUMPTION_TABLES) {
    if (table.toLowerCase() === compact) return table
    if (normText(ASSUMPTION_KEYS[table].label) === t) return table
  }
  return Object.hasOwn(TABLE_ALIASES, t) ? TABLE_ALIASES[t] : null
}

/** Field-specific normalizers for every enum field in `DATASETS`, keyed `dataset.field`. */
export const ENUM_NORMALIZERS: Record<string, Normalizer> = {
  'positions.status': positionStatus,
  'positions.workerType': workerType,
  'positions.reqType': reqType,
  'positions.endReason': endReason,
  'workers.workerType': workerType,
  'reqs.status': reqStatus,
  'reqs.stage': reqStage,
  'reqs.reqType': reqType,
  'requests.type': requestType,
  'requests.state': requestState,
  'requests.reasonCode': reasonCode,
  'requests.transferKind': transferKind,
  'assumptions.table': normalizeAssumptionTable,
}

/** Canonical value for an enum field: exact spelling first, then the field's own vocabulary. */
export function normalizeEnumValue(
  dataset: DatasetKey,
  field: string,
  values: readonly string[],
  raw: unknown,
): string | null {
  const t = normText(raw)
  if (!t) return null
  const exact = matchCanonical(values, t)
  if (exact) return exact
  const fn = ENUM_NORMALIZERS[`${dataset}.${field}`]
  const v = fn ? fn(t) : null
  return v && values.includes(v) ? v : null
}
