/**
 * Approval steps as files write them (`requests.steps`, field type 'steps'): one compact text,
 * steps separated by ";", each "<role> <approver employee ID> <decision>[ <date>]":
 *
 *   Manager E10234 Approved 2026-08-03; HRBP E10077 Pending
 *
 * `readSteps` turns that text into `StepRow`s and `formatSteps` writes it back, so a template or
 * export round-trips exactly. Roles and decisions are read in their common spellings ("HR business
 * partner", "Returned"), and dates in any form the importer reads. Pure.
 */
import {
  type ISODate,
  STEP_DECISIONS,
  STEP_ROLES,
  type StepDecision,
  type StepRole,
  type StepRow,
} from '../schema'
import { partsToDate, readDate } from './dates'
import { normText } from './text'

/** An example for messages and template notes. */
export const STEPS_EXAMPLE = 'Manager E10234 Approved 2026-08-03; HRBP E10077 Pending'

const ROLE_WORDS: Record<string, StepRole> = {
  manager: 'Manager',
  mgr: 'Manager',
  'line manager': 'Manager',
  'direct manager': 'Manager',
  'submitter manager': 'Manager',
  supervisor: 'Manager',
  hrbp: 'HRBP',
  'hr bp': 'HRBP',
  'hr business partner': 'HRBP',
  'hr partner': 'HRBP',
  hr: 'HRBP',
  leader: 'Leader',
  leadership: 'Leader',
  'org leader': 'Leader',
  vp: 'Leader',
  executive: 'Leader',
  finance: 'Finance',
  fpa: 'Finance',
  'fp a': 'Finance',
  'fp and a': 'Finance',
  'finance partner': 'Finance',
}

/** Decision phrases, longest first so "Approved with changes" is not read as "Approved". */
const DECISION_WORDS: [string, StepDecision][] = [
  ['approved with changes', 'Approved with changes'],
  ['approved with edits', 'Approved with changes'],
  ['approved with modifications', 'Approved with changes'],
  ['sent back', 'Sent back'],
  ['send back', 'Sent back'],
  ['returned', 'Sent back'],
  ['approved', 'Approved'],
  ['approve', 'Approved'],
  ['accepted', 'Approved'],
  ['rejected', 'Rejected'],
  ['declined', 'Rejected'],
  ['denied', 'Rejected'],
  ['not yet', 'Pending'],
  ['in review', 'Pending'],
  ['pending', 'Pending'],
  ['awaiting', 'Pending'],
  ['waiting', 'Pending'],
  ['open', 'Pending'],
]

/** The longest run of 1 to 4 leading words that `table` knows, and how many words it took. */
function leading<T>(
  tokens: readonly string[],
  lookup: (phrase: string) => T | undefined,
): [T, number] | null {
  for (let n = Math.min(4, tokens.length); n >= 1; n--) {
    const hit = lookup(normText(tokens.slice(0, n).join(' ')))
    if (hit !== undefined) return [hit, n]
  }
  return null
}

const decisionOf = (phrase: string): StepDecision | undefined =>
  DECISION_WORDS.find(([w]) => w === phrase)?.[1]

/** A role by its spelling; only the table's own words, never a name every object inherits. */
const roleOf = (phrase: string): StepRole | undefined =>
  Object.hasOwn(ROLE_WORDS, phrase) ? ROLE_WORDS[phrase] : undefined

/** One step from its text, or null when it does not read as a step. */
function readStep(text: string): StepRow | null {
  // "Manager: E10234 (Approved, 2026-08-03)" reads like "Manager E10234 Approved 2026-08-03".
  const tokens = text
    .replace(/[():,]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const role = leading(tokens, roleOf)
  if (!role) return null
  let rest = tokens.slice(role[1])
  // The approver may be missing ("HRBP Pending"): then the decision follows the role.
  let approverId = ''
  if (rest.length && !leading(rest, decisionOf)) {
    approverId = rest[0]
    rest = rest.slice(1)
  }
  const decision = leading(rest, decisionOf)
  if (!decision) return null
  rest = rest.slice(decision[1])
  let at: ISODate | null = null
  if (rest.length) {
    const r = readDate(rest.join(' '))
    if (!r.ok) return null
    at = partsToDate(r.parts)
  }
  return { role: role[0], approverId, decision: decision[0], at }
}

const isStep = (v: unknown): v is StepRow => {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<StepRow>
  return (
    (STEP_ROLES as readonly unknown[]).includes(s.role) &&
    typeof s.approverId === 'string' &&
    (STEP_DECISIONS as readonly unknown[]).includes(s.decision) &&
    (s.at === null || (typeof s.at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.at)))
  )
}

/**
 * The steps in a cell: compact text, or steps already in memory (an array of `StepRow`). Null when
 * any part does not read as a step; an empty cell gives an empty list.
 */
export function readSteps(v: unknown): StepRow[] | null {
  if (Array.isArray(v)) return v.every(isStep) ? v.map((s) => ({ ...s })) : null
  if (typeof v !== 'string') return null
  const parts = v
    .split(/[;\n|]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: StepRow[] = []
  for (const p of parts) {
    const step = readStep(p)
    if (!step) return null
    out.push(step)
  }
  return out
}

/** Steps as compact text, the way `readSteps` reads them back. */
export function formatSteps(steps: readonly StepRow[]): string {
  return steps.map((s) => [s.role, s.approverId, s.decision, s.at].filter(Boolean).join(' ')).join('; ')
}
