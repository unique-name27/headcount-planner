/**
 * Canonical spellings for free-text fields that have a known vocabulary: work sites, legal
 * entities and currencies. Unlike enum fields, an unknown value here is kept as written (every
 * company has its own sites; the official lists check them).
 */
import { type DatasetKey, SITES } from '../schema'
import { normText } from './text'
import { matchCanonical } from './vocab'

/** Other names and codes for the sample company's sites: old city names, airport and site codes. */
export const LOCATION_ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  blr: 'Bengaluru',
  saigon: 'Ho Chi Minh City',
  hcmc: 'Ho Chi Minh City',
  'ho chi minh': 'Ho Chi Minh City',
  hcm: 'Ho Chi Minh City',
  sgn: 'Ho Chi Minh City',
  munchen: 'Munich',
  muenchen: 'Munich',
  muc: 'Munich',
  'hsin chu': 'Hsinchu',
  hsz: 'Hsinchu',
  sanjose: 'San Jose',
  sjc: 'San Jose',
  aus: 'Austin',
  rdu: 'Raleigh',
  bld: 'Boulder',
  sea: 'Seattle',
  yyz: 'Toronto',
  yvr: 'Vancouver',
  hfa: 'Haifa',
  sha: 'Shanghai',
}

const SITE_NAMES = SITES.map((s) => s.location)

/** A table's own entry for `key`, never a name every object inherits ("constructor"). */
const own = (table: Readonly<Record<string, string>>, key: string): string | null =>
  Object.hasOwn(table, key) ? table[key] : null
const LEGAL_ENTITIES = [...new Set(SITES.map((s) => s.legalEntity))]

function vocabMatch(values: readonly string[], aliases: Record<string, string>, raw: unknown): string | null {
  const t = normText(raw)
  if (!t) return null
  const exact = matchCanonical(values, t) ?? own(aliases, t)
  if (exact) return exact
  // "San Jose, CA" or "Munich (DE)": try the part before a comma or bracket.
  const head = normText(String(raw).split(/[,(/|]/)[0])
  if (head && head !== t) {
    const h = matchCanonical(values, head) ?? own(aliases, head)
    if (h) return h
  }
  return null
}

/** A work site's canonical name ("Bangalore, India" is Bengaluru), or null when it is not a known site. */
export const canonicalLocation = (raw: unknown): string | null =>
  vocabMatch(SITE_NAMES, LOCATION_ALIASES, raw)

/**
 * Canonical spelling for free-text fields that have a known vocabulary (site, legal entity,
 * currency). Returns null when the value is not in the vocabulary; the importer then keeps the
 * original text.
 */
export function canonicalText(dataset: DatasetKey, field: string, raw: unknown): string | null {
  switch (`${dataset}.${field}`) {
    case 'positions.location':
    case 'workers.location':
    case 'requests.location':
      return canonicalLocation(raw)
    case 'positions.legalEntity':
    case 'workers.legalEntity':
      return matchCanonical(LEGAL_ENTITIES, normText(raw))
    case 'comp.currency':
    case 'reqs.offerCurrency':
      return normalizeCurrency(raw)
    default:
      return null
  }
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  us$: 'USD',
  usd$: 'USD',
  c$: 'CAD',
  ca$: 'CAD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'CNY',
  rmb: 'CNY',
  '₹': 'INR',
  rs: 'INR',
  nt$: 'TWD',
  ntd: 'TWD',
  '₪': 'ILS',
  nis: 'ILS',
  '₫': 'VND',
  'us dollar': 'USD',
  'us dollars': 'USD',
  'canadian dollar': 'CAD',
  euro: 'EUR',
  euros: 'EUR',
  'indian rupee': 'INR',
  rupee: 'INR',
  'new taiwan dollar': 'TWD',
  yuan: 'CNY',
  renminbi: 'CNY',
  shekel: 'ILS',
  'israeli shekel': 'ILS',
  dong: 'VND',
}

/** ISO 4217 code from a code, symbol or common name; null when it is not a currency. */
export function normalizeCurrency(raw: unknown): string | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!s) return null
  const symbol = own(CURRENCY_SYMBOLS, s)
  if (symbol) return symbol
  return /^[a-z]{3}$/.test(s) ? s.toUpperCase() : null
}
