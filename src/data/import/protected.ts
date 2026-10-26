/**
 * Columns Headcount Planner never reads or keeps, whatever the sheet: protected characteristics
 * (gender, ethnicity, age and birth date, nationality, citizenship, religion, disability and health,
 * veteran status, sexual orientation, marital status), stand-ins for them (graduation year reveals
 * age), free-text comments and notes, and column names a JavaScript object reserves (`__proto__`,
 * `constructor`, `prototype`). They are dropped when the sheet is read, so they never reach the
 * stored raw sheet, the mapping or a dataset. Pure.
 */
import { APP_NAME } from '@/app/brand'
import { normalizeHeader } from './text'

/** Header words that mark a protected field wherever they appear ("Primary nationality"). */
const PROTECTED_WORDS = new Set([
  'gender',
  'sex',
  'ethnicity',
  'ethnic',
  'race',
  'nationality',
  'nationalities',
  'citizenship',
  'citizen',
  'birth',
  'birthdate',
  'birthday',
  'dob',
  'religion',
  'religious',
  'disability',
  'disabled',
  'medical',
  'health',
  'diagnosis',
  'veteran',
  'orientation',
  'marital',
  'pregnancy',
  'pregnant',
])

/** Whole headers that are protected but whose words are also used elsewhere ("age" vs "req age"). */
const PROTECTED_HEADERS = new Set([
  'age',
  'age band',
  'age group',
  'age range',
  'employee age',
  'national origin',
  'country of origin',
  'passport country',
  'passport nationality',
  'lgbtq',
])

/** Stand-ins for a protected characteristic: graduation year reveals age. */
const PROXY_WORDS = new Set(['graduation', 'graduated'])
const PROXY_HEADERS = new Set([
  'grad year',
  'grad yr',
  'grad date',
  'class of',
  'class year',
  'year graduated',
  'degree year',
  'year of degree',
  'degree date',
  'year of graduation',
])

/**
 * Free text: never imported. A comment, justification or note can carry anything, an amount
 * included, and no dataset has a field for it (request comments live in the plan state).
 */
const COMMENT_WORDS = new Set([
  'comment',
  'comments',
  'verbatim',
  'verbatims',
  'justification',
  'justifications',
  'note',
  'notes',
])
const COMMENT_HEADERS = new Set([
  'open text',
  'free text',
  'open ended',
  'open response',
  'written feedback',
  'text response',
  'free text response',
])

/** Names a JavaScript object reserves: a row keyed by one could change how every row behaves. */
const RESERVED = /^(?:__proto__|constructor|prototype)$/i

export type DropReason = 'protected' | 'proxy' | 'comment' | 'reserved'

/** Why a column is never imported, or null when it may be. */
export function dropReason(header: unknown): DropReason | null {
  if (RESERVED.test(String(header ?? '').trim())) return 'reserved'
  const h = normalizeHeader(header)
  if (!h) return null
  const words = h.split(' ')
  // "Sexual orientation", "Gender identity", "Date of birth", "Country of citizenship"
  if (PROTECTED_HEADERS.has(h) || words.some((w) => PROTECTED_WORDS.has(w))) {
    // "Orientation" alone is new-hire orientation, not a protected field.
    if (words.includes('orientation') && !words.includes('sexual')) {
      if (!words.some((w) => w !== 'orientation' && PROTECTED_WORDS.has(w))) return null
    }
    // "Sex" only as its own word: "Essex" or "Sussex" sites never match (words are whole).
    return 'protected'
  }
  if (PROXY_HEADERS.has(h) || words.some((w) => PROXY_WORDS.has(w))) return 'proxy'
  if (COMMENT_HEADERS.has(h) || words.some((w) => COMMENT_WORDS.has(w))) return 'comment'
  return null
}

export interface DroppedColumn {
  header: string
  reason: DropReason
}

/** The columns of a header row that are never imported. */
export function droppedColumns(headers: readonly string[]): DroppedColumn[] {
  const out: DroppedColumn[] = []
  for (const header of headers) {
    const reason = dropReason(header)
    if (reason) out.push({ header, reason })
  }
  return out
}

/** The Data room's reason for leaving out a graduation year. */
export const PROXY_TEXT = `Graduation year can reveal age, so ${APP_NAME} does not read it.`

/** "Gender and Citizenship were left out: Headcount Planner never imports protected characteristics." */
export function droppedText(dropped: readonly DroppedColumn[]): string | null {
  if (!dropped.length) return null
  const list = (xs: string[]) =>
    xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  const verb = (xs: string[]) => (xs.length === 1 ? 'was' : 'were')
  const parts: string[] = []
  const of = (reason: DropReason) => dropped.filter((d) => d.reason === reason).map((d) => d.header)
  const prot = of('protected')
  const proxies = of('proxy')
  const comments = of('comment')
  const reserved = of('reserved')
  if (prot.length)
    parts.push(`${list(prot)} ${verb(prot)} left out: ${APP_NAME} never imports protected characteristics.`)
  if (proxies.length) parts.push(`${list(proxies)} ${verb(proxies)} left out. ${PROXY_TEXT}`)
  if (comments.length)
    parts.push(`${list(comments)} ${verb(comments)} left out: free-text comments are never imported.`)
  if (reserved.length)
    parts.push(
      `${list(reserved)} ${verb(reserved)} left out: ${reserved.length === 1 ? 'that column name is' : 'those column names are'} reserved.`,
    )
  return parts.join(' ')
}
