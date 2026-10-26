/**
 * Help in each mode (docs/PLAN.md 14.2; the template app's help/access.ts): which articles and tours
 * a mode shows, the steps a tour keeps (a step whose page, tab, control or figure the mode hides is
 * skipped), which links in an article stay links (a link to a hidden target reads as plain text),
 * and the glossary of shown metrics. Pure: the help UI asks it with `ctx.access`; the leak crawl
 * reads what it returns.
 *
 * Built in the M4 freeze (docs/CONTRACTS-M4.md), a port with HCP's renames: the first tour is
 * "Getting started" in HR admin (its home is the Data room) and "Getting started with your home"
 * everywhere else; a step's wording may move the step to the mode's own home (`StepWording.view`);
 * the rule entries (`privacy.*`, `cost.guard.*`) go with their articles in the glossary.
 */
import type { AccessContext } from '@/access/context'
import { HOME_OF, type Mode } from '@/access/modes'
import { routeShown } from '@/access/policy'
import type { RouteView } from '@/data/store'
import { GLOSSARY_WORDING, type GlossaryEntry, isCostRule, isRuleMetric, PAGE_LABEL } from './glossary'
import { articleForMetric } from './learnMore'
import { parseRouteTarget } from './links'
import type { HelpLink } from './markup'
import { namesHidden } from './names'
import type { Block, Condition, HelpArticle, Tour, TourStep, Without } from './types'

/** What help reads of a mode: its decisions, and the scope it holds (absent: held). */
export type HelpAccess = Pick<AccessContext, 'mode' | 'can'> & { scope?: AccessContext['scope'] }

/** Whether the mode holds a scope (a team, a unit, an org); Leader mode acting as the CEO holds none. */
const scopeHeld = (access: HelpAccess): boolean => access.scope !== null

export const articleShown = (access: HelpAccess, id: string): boolean => access.can(`help:article:${id}`)
export const tourShown = (access: HelpAccess, id: string): boolean => access.can(`help:tour:${id}`)

/**
 * "Learn more" (`help:learn-more`): the id of the article that covers a metric, where the mode shows
 * it; else null (no article covers it, or the mode hides it). Light: no article content.
 */
export function learnMoreIn(access: HelpAccess, metricId: string | null | undefined): string | null {
  const id = articleForMetric(metricId)
  return id && access.can('help:learn-more') && articleShown(access, id) ? id : null
}

/** The first tour of each mode's own home ("Take the tour" and the welcome line). */
export function homeTourOf(mode: Mode): string {
  return HOME_OF[mode] === 'data' ? 'getting-started' : 'home-start'
}

const listOf = (s: string | readonly string[] | undefined): readonly string[] =>
  s === undefined ? [] : typeof s === 'string' ? [s] : s

/**
 * Whether a block, step or wording applies in a mode: every `surface` shown, not every `unless`
 * shown, every `hidden` hidden, and `scoped`, when given, matching whether the mode holds a scope.
 */
export function holds(access: HelpAccess, c: Condition): boolean {
  if (c.scoped !== undefined && c.scoped !== scopeHeld(access)) return false
  const unless = listOf(c.unless)
  return (
    listOf(c.surface).every((s) => access.can(s)) &&
    !(unless.length && unless.every((s) => access.can(s))) &&
    listOf(c.hidden).every((s) => !access.can(s))
  )
}

/** The figure a step points at (`[data-tour="figure-<id>"]`), or null. */
const stepFigure = (step: TourStep): string | null =>
  step.target?.match(/^\[data-tour="figure-([^"]+)"\]$/)?.[1] ?? null

/** Whether a mode keeps a tour step: its condition holds, and its page, tab and figure are shown. */
export function stepShown(access: HelpAccess, step: TourStep): boolean {
  if (step.view && !routeShown(access.mode, step.view, step.tab ?? '')) return false
  if (!holds(access, step)) return false
  const figure = stepFigure(step)
  if (figure && step.view && !access.can(`figure:${figure}`, { view: step.view, tab: step.tab ?? '' }))
    return false
  return true
}

/**
 * A step as a mode reads it: the first `wording` whose condition holds replaces its title, body,
 * target, placement and page, and the wordings are dropped. A step without any is returned as it is.
 */
export function stepWording(access: HelpAccess, step: TourStep): TourStep {
  if (!step.wording) return step
  const { wording, ...rest } = step
  const w = wording.find((x) => holds(access, x))
  if (!w) return rest
  return {
    ...rest,
    title: w.title ?? step.title,
    body: w.body,
    ...(w.target ? { target: w.target } : {}),
    ...(w.placement ? { placement: w.placement } : {}),
    ...(w.view ? { view: w.view, tab: w.tab ?? '' } : {}),
  }
}

/** The summary a mode reads: the first `without` that applies (its surface hidden, or its `when` holds). */
const summaryIn = (access: HelpAccess, summary: string, without: readonly Without[] | undefined): string =>
  without?.find(
    (w) => (w.surface !== undefined && !access.can(w.surface)) || (w.when && holds(access, w.when)),
  )?.summary ?? summary

/**
 * The tour as a mode runs it: each step in the mode's wording, steps on what the mode hides skipped;
 * null when the mode hides the tour or no step is left.
 */
export function tourInMode(access: HelpAccess, tour: Tour | null): Tour | null {
  if (!tour || !tourShown(access, tour.id)) return null
  const worded = tour.steps.map((s) => stepWording(access, s))
  const steps = worded.filter((s) => stepShown(access, s))
  if (!steps.length) return null
  const summary = summaryIn(access, tour.summary, tour.without)
  const same = steps.length === tour.steps.length && steps.every((s, i) => s === tour.steps[i])
  return same && summary === tour.summary ? tour : { ...tour, steps, summary }
}

/** Two lists in a row (one block per item that differs by mode) read as one list. */
function mergeLists(blocks: readonly Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const last = out.at(-1)
    if (last && 'ul' in b && 'ul' in last) out[out.length - 1] = { ul: [...last.ul, ...b.ul] }
    else if (last && 'ol' in b && 'ol' in last) out[out.length - 1] = { ol: [...last.ol, ...b.ol] }
    else out.push(b)
  }
  return out
}

/**
 * An article's body as a mode shows it: a block whose condition the mode does not meet is skipped,
 * and such a heading takes its section (every block up to the next heading) with it. Lists left next
 * to each other read as one.
 */
export function blocksInMode(access: HelpAccess, body: readonly Block[]): Block[] {
  const out: Block[] = []
  let skipping = false
  for (const b of body) {
    if ('h' in b) skipping = false
    if (skipping) continue
    if (!holds(access, b)) {
      if ('h' in b) skipping = true
      continue
    }
    out.push(b)
  }
  return mergeLists(out)
}

/**
 * An article as a mode shows and searches it: hidden sections left out, the summary for what the
 * mode shows, and the search words about shown things only. The same object when nothing changes.
 */
export function articleInMode(access: HelpAccess, a: HelpArticle): HelpArticle {
  const body = blocksInMode(access, a.body)
  const summary = summaryIn(access, a.summary, a.without)
  const extra = (a.keywordsWhere ?? []).filter((k) => access.can(k.surface)).flatMap((k) => k.words)
  if (body.length === a.body.length && summary === a.summary && !a.keywordsWhere) return a
  return { ...a, body, summary, keywords: [...(a.keywords ?? []), ...extra] }
}

/** Whether a link in an article stays a link in this mode (else it reads as plain text). */
export function linkShown(access: HelpAccess, link: HelpLink): boolean {
  switch (link.kind) {
    case 'route': {
      const { view, tab } = parseRouteTarget(link.target)
      return routeShown(access.mode, view as RouteView, tab)
    }
    case 'metric':
      // A metric link opens its entry in Metric definitions, in the Data room.
      return access.can('page:data') && access.can(`metric:${link.target}`)
    case 'article':
      return articleShown(access, link.target)
    case 'tour':
      return tourShown(access, link.target)
    case 'settings':
      return access.can(`settings:${link.target}`)
  }
}

/** The articles a mode shows, in Help sheet order, as it shows them (`articleInMode`). */
export const articlesInMode = (access: HelpAccess, articles: readonly HelpArticle[]): HelpArticle[] =>
  articles.filter((a) => articleShown(access, a.id)).map((a) => articleInMode(access, a))

/** The tours a mode runs, as it runs them (`tourInMode`), in list order. */
export const toursInMode = (access: HelpAccess, tours: readonly Tour[]): Tour[] =>
  tours.flatMap((t) => {
    const run = tourInMode(access, t)
    return run ? [run] : []
  })

/**
 * Whether a mode lists a rule entry at all (the glossary and Settings > Formulas alike): it goes with
 * its article (Manager mode hides the pay rule, Manager and Finance the leave rule), and the cost
 * guard's rules, about amounts, only where an amount shows. Every other metric: true.
 */
export function ruleEntryShown(access: HelpAccess, id: string): boolean {
  const article = isRuleMetric(id) ? articleForMetric(id) : null
  if (article && !articleShown(access, article)) return false
  return !(isCostRule(id) && !access.can('cost:band'))
}

/**
 * Whether a mode lists a metric in Settings > Formulas (M4 recheck HL-8-a; PLAN 12 treats it like the
 * glossary): one the mode shows, a rule entry where `ruleEntryShown` keeps it, and none whose texts
 * (read in the mode's own words through `ctx.metrics`: name, definition, formula, population, window
 * and its settings' labels) still name a page, tab, control or amount kind the mode hides.
 */
export function formulaRowShown(access: HelpAccess, id: string, texts: readonly (string | null)[]): boolean {
  if (!access.can(`metric:${id}`) || !ruleEntryShown(access, id)) return false
  return !namesHidden(access, `formulas ${id}`, texts.filter(Boolean).join('\n')).length
}

/** An entry's text as the names check reads it: term, definition, formula and where it lives. */
const entryText = (e: GlossaryEntry): string => [e.term, e.definition, e.formula ?? '', e.where].join('\n')

/**
 * One glossary entry as a mode reads it, or null where the mode leaves it out (PLAN 14.2: a mode
 * never reads about something it hides, the glossary included; M4 review HL-8):
 * - a metric the mode hides is out, and a rule entry goes with its article (Manager mode hides the
 *   pay rule, Manager and Finance the leave rule); the cost guard's rules are about amounts, so a
 *   mode with no amounts leaves them out;
 * - a catalog definition that names what the mode hides reads in the mode's `GLOSSARY_WORDING`,
 *   in each part (definition, formula) still the catalog's own;
 * - an entry lives on the first of its views the mode shows, or nowhere named;
 * - an entry that still names a page, tab, control or amount kind the mode hides is left out.
 */
export function glossaryEntryInMode(access: HelpAccess, e: GlossaryEntry): GlossaryEntry | null {
  if (!access.can(`metric:${e.id}`)) return null
  const rule = isRuleMetric(e.id)
  if (!ruleEntryShown(access, e.id)) return null
  let out = e
  const w = GLOSSARY_WORDING[e.id]?.find((x) => holds(access, x))
  const edited = e.edited ?? []
  if (w && !edited.includes('definition')) out = { ...out, definition: w.definition }
  if (w?.formula && !edited.includes('formula')) out = { ...out, formula: w.formula }
  if (!rule && !routeShown(access.mode, out.view, '')) {
    const view = (out.views ?? []).find((v) => routeShown(access.mode, v, ''))
    out = view ? { ...out, view, where: PAGE_LABEL[view] ?? view } : { ...out, where: '' }
  }
  return namesHidden(access, `glossary ${e.id}`, entryText(out)).length ? null : out
}

/** The glossary of the metrics a mode shows, each as the mode reads it (`glossaryEntryInMode`). */
export const glossaryInMode = (access: HelpAccess, entries: readonly GlossaryEntry[]): GlossaryEntry[] =>
  entries.flatMap((e) => {
    const shown = glossaryEntryInMode(access, e)
    return shown ? [shown] : []
  })
