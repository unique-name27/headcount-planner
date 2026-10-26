/**
 * The help content checks as functions (PLAN 14.2, 14.3 and 16.2: ids, links, targets, 4 to 6
 * steps, sentence case, no em dash), so each writer tests its own file with them and help-engine's
 * content test runs them over everything.
 *
 *  - `sentenceCaseProblem(title)`: a capital first letter and no other capitals except the names in
 *    `PROPER_NAMES`, acronyms (two or more capitals), words with a digit and the pronoun "I" (the
 *    template app's rule).
 *  - `copyProblems(text, opts)`: an em dash between words ("—" in quotes, the missing-value
 *    placeholder, is fine), "!", a nagging verb (chase, nag, ping, hound, remind, unblock), a word of
 *    `BANNED_MODE_WORDS` (unless `exempt`: the `about-server` article only) or `BANNED_HASH_WORDS`
 *    (never exempt). Text is read as a reader sees it (`plainText`).
 *  - `articleProblems` and `tourProblems`: every check of one article or tour against the app (links
 *    resolve, routes and tabs exist, targets exist in the source, 4 to 6 steps for a view tour, the
 *    copy and title rules on every string, every mode's wording included).
 *
 * M4 freeze (docs/CONTRACTS-M4.md): `PROPER_NAMES`, `NAGGING`, `sentenceCaseProblem` and
 * `copyProblems` are built, so help-views and help-trust can test their files from day one;
 * help-engine filled `articleProblems` and `tourProblems`.
 */
import { BANNED_HASH_WORDS, BANNED_MODE_WORDS, BANNED_WORDS_EXEMPT } from '@/access/copy'
import { HELP_ARTICLE_IDS, HELP_TOUR_IDS } from '@/access/ids'
import { isViewKey } from '@/data/schema'
import { checkLink, type LinkWorld } from './links'
import { blockTexts, linksIn, plainText } from './markup'
import { HELP_GROUPS, type HelpArticle, type Tour, type TourStep } from './types'

/** Names written with capitals wherever they appear (pages, tabs, controls, versions, the company). */
export const PROPER_NAMES: readonly string[] = [
  'Headcount Planner',
  'Northgate Semiconductor',
  'Silicon Engineering',
  'Go-to-Market',
  'My team',
  'What if',
  'Action center',
  'Data room',
  'Data quality',
  'Metric definitions',
  'Sub-org targets',
  'Tree × cost center',
  'Trade rates',
  'Show pay amounts',
  'Show data quality',
  'Import requests',
  'Export requests',
  'Export for a manager',
  'Open a shared file',
  'Turn into requests',
  'Move budget too',
  'Move target too',
  'Copy note',
  'Mark reviewed',
  'Full file',
  'Shareable',
  'Acting as',
  'HR admin',
  'Q1 Reforecast',
  'Budget',
  'Working',
  'Other',
  'Home',
  'Plan',
  'Requests',
  'Forecast',
  'Targets',
  'Finance',
  'Audit',
  'Overview',
  'Positions',
  'Openings',
  'Transfers',
  'Queue',
  'New',
  'Mine',
  'Approvals',
  'Cycle',
  'Variance',
  'Bridge',
  'Gap',
  'Levers',
  'Versions',
  'Assumptions',
  'Freezes',
  'Reconcile',
  'Export',
  'Manager',
  'Leader',
  'Settings',
  'Help',
  // The Data room's tabs and a dataset's panels (help-engine, M4).
  'Datasets',
  'Lists',
  'Workspace',
  'Raw',
  'Mapping',
  'Quality',
  'Certify',
  'Excel',
  'PowerPoint',
  'Phase 3',
]

/** The nagging verbs no copy uses (14.3). */
export const NAGGING =
  /\b(chase|chasing|nag|nagging|ping|pinging|hound|hounding|remind|reminding|unblock|unblocking)\b/i

/** Sentence case: a capital first letter, and no other capitals except names, acronyms and words with a digit. */
export function sentenceCaseProblem(title: string): string | null {
  if (!/^[A-Z0-9"?/]/.test(title)) return 'does not start with a capital'
  let rest = title
  for (const p of PROPER_NAMES) rest = rest.split(p).join('')
  const words = rest.split(/\s+/).slice(1)
  // "I" is capitalized in sentence case too ("How do I send decisions back?").
  const bad = words.filter(
    (w) =>
      /[A-Z]/.test(w) &&
      !/^[A-Z0-9&-]{2,}[.,:?)]?$/.test(w) &&
      !/\d/.test(w) &&
      !/^I(['’]\w+)?[.,:?)]?$/.test(w),
  )
  return bad.length ? `capitalized: ${bad.join(', ')}` : null
}

/** Every copy rule a text breaks (see the module comment); empty when it keeps them. */
export function copyProblems(text: string, opts: { exempt?: boolean } = {}): string[] {
  const plain = plainText(text)
  const out: string[] = []
  if (/\w\s*—\s*\w/.test(plain.replace(/"—"/g, ''))) out.push('em dash between words')
  if (plain.includes('!')) out.push('exclamation mark')
  const nag = NAGGING.exec(plain)
  if (nag) out.push(`nagging verb "${nag[0]}"`)
  const lower = plain.toLowerCase()
  if (!opts.exempt) for (const w of BANNED_MODE_WORDS) if (lower.includes(w)) out.push(`banned word "${w}"`)
  for (const w of BANNED_HASH_WORDS) if (lower.includes(w)) out.push(`banned word "${w}"`)
  return out
}

/** A link label that reads as an id ("plan.heads", "view-plan") rather than as text. */
const RAW_LABEL = /^[a-z]+[.:-][a-z]/

/** The problems of one string: the copy rules, and links that do not resolve or read as ids. */
function textProblems(where: string, text: string, world: LinkWorld, exempt: boolean): string[] {
  const out = copyProblems(text, { exempt }).map((p) => `${where}: ${p}`)
  for (const l of linksIn(text)) {
    const why = checkLink(l, world)
    if (why) out.push(`${where}: [${l.label}](${l.kind}:${l.target}) ${why}`)
    if (RAW_LABEL.test(l.label)) out.push(`${where}: link label "${l.label}" reads as an id`)
  }
  return out
}

/** A route as an article or a step names it: a real page, and a real tab of it. */
function routeProblem(view: string, tab: string | undefined, world: LinkWorld): string | null {
  return checkLink({ kind: 'route', target: tab ? `${view}.${tab}` : view, label: '' }, world)
}

/**
 * Every problem of one article: its id registered, its group one of `HELP_GROUPS`, its route, tour
 * and definitions real, a summary and a body (a generated article may carry only its summary), every
 * link resolving in `world` with a label that reads as text, its title and every heading sentence
 * case, and `copyProblems` on its title, summary, every `without` summary, every block and every
 * keyword (`about-server` exempt from the banned mode words only). Empty when it keeps them all. One
 * sentence each, starting with the article id.
 */
export function articleProblems(a: HelpArticle, world: LinkWorld): string[] {
  const out: string[] = []
  const at = (what: string) => `${a.id} ${what}`
  if (!(HELP_ARTICLE_IDS as readonly string[]).includes(a.id)) out.push(`${a.id}: not in HELP_ARTICLE_IDS`)
  if (!HELP_GROUPS.some((g) => g.key === a.group)) out.push(`${a.id}: no group "${a.group}"`)
  if (a.route) {
    const why = routeProblem(a.route.view, a.route.tab, world)
    if (why) out.push(`${at('route')}: ${why}`)
  }
  if (a.tour && !world.hasTour(a.tour)) out.push(`${at('tour')}: no tour "${a.tour}"`)
  for (const m of a.metrics ?? []) if (!world.hasMetric(m)) out.push(`${at('definitions')}: no metric "${m}"`)
  if (!a.summary.trim()) out.push(`${at('summary')}: empty`)
  if (!a.body.length && !a.generated) out.push(`${at('body')}: empty`)
  const exempt = (BANNED_WORDS_EXEMPT.articles as readonly string[]).includes(a.id)
  const title = sentenceCaseProblem(a.title)
  if (title) out.push(`${at('title')}: ${title}`)
  out.push(...textProblems(at('title'), a.title, world, exempt))
  out.push(...textProblems(at('summary'), a.summary, world, exempt))
  for (const w of a.without ?? []) out.push(...textProblems(at('without'), w.summary, world, exempt))
  a.body.forEach((b, i) => {
    if ('h' in b) {
      const h = sentenceCaseProblem(plainText(b.h))
      if (h) out.push(`${at(`heading ${i + 1}`)}: ${h}`)
    }
    for (const t of blockTexts(b)) out.push(...textProblems(at(`block ${i + 1}`), t, world, exempt))
  })
  for (const k of [...(a.keywords ?? []), ...(a.keywordsWhere ?? []).flatMap((x) => x.words)])
    out.push(...textProblems(at('keyword'), k, world, exempt))
  return out
}

/** Elements of the band, on every page: a step on one needs no page of its own. */
export const EVERYWHERE_TARGETS: readonly string[] = [
  'folder-tabs',
  'masthead-mode',
  'masthead-help',
  'masthead-settings',
  'masthead-data',
  'masthead-audit',
  'masthead-actions',
  'masthead-workspace',
  'masthead-more',
]

/** A step's selector as a `data-tour` name: `[data-tour="kpi-strip"]` → "kpi-strip". */
const nameOf = (target: string): string | null => target.match(/^\[data-tour="([^"]+)"\]$/)?.[1] ?? null

/** Every way a step can read: as written, and in each mode's wording. */
function everyWording(s: TourStep): TourStep[] {
  return [
    s,
    ...(s.wording ?? []).map((w) => ({
      ...s,
      title: w.title ?? s.title,
      body: w.body,
      target: w.target ?? s.target,
      ...(w.view ? { view: w.view, tab: w.tab ?? '' } : {}),
    })),
  ]
}

/**
 * Whether a `data-tour` name is drawn somewhere in the source: a Figure's id as a string literal
 * (Figure draws `figure-<id>`), or the attribute, written out or picked in an expression.
 */
export function targetInSource(name: string, source: string): boolean {
  if (name.startsWith('figure-')) {
    const id = name.slice('figure-'.length)
    return source.includes(`"${id}"`) || source.includes(`'${id}'`)
  }
  if (source.includes(`data-tour="${name}"`)) return true
  // A name picked in an expression: data-tour={mode === 'manager' ? 'filter-leader' : undefined}.
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`data-tour=\\{[^}]*['"\`]${esc}['"\`]`).test(source)
}

/**
 * Every problem of one tour: its id registered, 4 to 6 steps for a `view-<key>` tour (and its route
 * that view), steps for every tour, a summary and a length, every step's target a
 * `[data-tour="..."]` (or a Figure id) found in `source` (the app's source but help's own files:
 * the components and the views' figure ids), every step's page
 * and tab real (a step on the band needs none), its title and every step's title sentence case and
 * `copyProblems` on every string, every mode's wording included. No tour is exempt from the banned
 * words.
 */
export function tourProblems(t: Tour, world: LinkWorld, source: string): string[] {
  const out: string[] = []
  const at = (what: string) => `tour ${t.id} ${what}`
  if (!(HELP_TOUR_IDS as readonly string[]).includes(t.id)) out.push(`tour ${t.id}: not in HELP_TOUR_IDS`)
  const viewKey = t.id.startsWith('view-') ? t.id.slice('view-'.length) : null
  if (viewKey !== null) {
    if (!isViewKey(viewKey)) out.push(`tour ${t.id}: no view "${viewKey}"`)
    if (t.route !== viewKey) out.push(`${at('route')}: "${t.route ?? ''}" is not ${viewKey}`)
    if (t.steps.length < 4 || t.steps.length > 6)
      out.push(`tour ${t.id}: ${t.steps.length} steps, not 4 to 6`)
  } else if (!t.steps.length) out.push(`tour ${t.id}: no steps`)
  if (t.route) {
    const why = routeProblem(t.route, undefined, world)
    if (why) out.push(`${at('route')}: ${why}`)
  }
  if (!t.summary.trim()) out.push(`${at('summary')}: empty`)
  if (!t.length.trim()) out.push(`${at('length')}: empty`)
  const title = sentenceCaseProblem(t.title)
  if (title) out.push(`${at('title')}: ${title}`)
  out.push(...textProblems(at('title'), t.title, world, false))
  out.push(...textProblems(at('summary'), t.summary, world, false))
  for (const w of t.without ?? []) out.push(...textProblems(at('without'), w.summary, world, false))
  t.steps.forEach((step, i) => {
    for (const s of everyWording(step)) {
      const where = at(`step ${i + 1}`)
      const st = sentenceCaseProblem(s.title)
      if (st) out.push(`${where} title: ${st}`)
      out.push(...textProblems(`${where} title`, s.title, world, false))
      out.push(...textProblems(`${where} body`, s.body, world, false))
      if (s.target) {
        const name = nameOf(s.target)
        if (!name) out.push(`${where}: target ${s.target} is not [data-tour="..."]`)
        else if (!targetInSource(name, source)) out.push(`${where}: no element "${name}" in the source`)
        else if (!s.view && !EVERYWHERE_TARGETS.includes(name)) out.push(`${where}: "${name}" needs a page`)
      }
      if (s.view) {
        const why = routeProblem(s.view, s.tab, world)
        if (why) out.push(`${where}: ${why}`)
      }
    }
  })
  return out
}
