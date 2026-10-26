/**
 * One help article in the Help sheet (the template app's ArticleView.tsx): its title, summary, "Take
 * the tour" and "Open the page" where the mode shows them, its body as the mode shows it (the sheet
 * hands it `articleInMode`), links that read as text where their target is hidden (`linkShown`),
 * the definitions it explains (from the metric dictionary, with your wording), and the generated
 * glossary (`glossaryInMode`) or release notes.
 */
import type { ReactNode, Ref } from 'react'
import { DATA_TABS } from '@/access/ids'
import { Button, cx } from '@/components/ui'
import { useAnalytics, useAnalyticsIfAny } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { METRICS } from '@/metrics/catalog'
import { parseDataTab } from '@/views/data/engine/links'
import { metricHref, openMetricDefinition } from '@/views/data/metrics/open'
import { glossaryEntryInMode, glossaryInMode, linkShown, tourInMode } from '../access'
import { TAKE_THE_TOUR, TAKE_THE_TOUR_AGAIN } from '../copy'
import { buildGlossary, PAGE_LABEL } from '../glossary'
import { followLink, linkHref } from '../links'
import { type HelpLink, parseInline } from '../markup'
import { articlePage } from '../sheet'
import { closeHelp, startTour, useHelp } from '../store'
import { tourById } from '../tours'
import type { Block, HelpArticle } from '../types'
import { releaseNotesIn } from '../whatsNew'

export const LINK_CLASS =
  'rounded-mark font-medium text-link underline decoration-1 underline-offset-2 hover:decoration-2'

/** A plain left click (a modified one opens the page in a new tab as usual). */
const plainClick = (e: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

function HelpLinkView({ link }: { link: HelpLink }) {
  const access = useAnalyticsIfAny()?.access
  // A link to something the mode hides reads as plain text; so does every link outside a mode.
  if (!access || !linkShown(access, link)) return <span>{link.label}</span>
  const href = linkHref(link)
  if (href)
    return (
      <a
        href={href}
        className={LINK_CLASS}
        onClick={(e) => {
          if (!plainClick(e)) return
          e.preventDefault()
          followLink(link)
        }}
      >
        {link.label}
      </a>
    )
  return (
    <button type="button" className={cx(LINK_CLASS, 'text-left')} onClick={() => followLink(link)}>
      {link.label}
    </button>
  )
}

/** Text with its inline links. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) =>
        'text' in p ? <span key={i}>{p.text}</span> : <HelpLinkView key={i} link={p.link} />,
      )}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  if ('h' in block)
    return (
      <h3 className="cut-head mt-5 text-title leading-snug font-semibold text-ink">
        <RichText text={block.h} />
      </h3>
    )
  if ('p' in block)
    return (
      <p className="mt-2 text-small leading-[1.55] text-ink-2">
        <RichText text={block.p} />
      </p>
    )
  if ('note' in block)
    return (
      <p className="mt-3 rounded-control bg-sheet-2 px-3 py-2 text-meta leading-snug text-ink-2">
        <RichText text={block.note} />
      </p>
    )
  const List = 'ul' in block ? 'ul' : 'ol'
  const items = 'ul' in block ? block.ul : block.ol
  return (
    <List
      className={cx(
        'mt-2 flex flex-col gap-1.5 pl-5 text-small leading-[1.5] text-ink-2 marker:text-muted',
        List === 'ul' ? 'list-disc' : 'list-decimal',
      )}
    >
      {items.map((t, i) => (
        <li key={i}>
          <RichText text={t} />
        </li>
      ))}
    </List>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-rule pt-4">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  )
}

/** A metric's name as a link to its entry in Metric definitions, or as text where the Data room is hidden. */
function MetricName({ id, name, linked }: { id: string; name: string; linked: boolean }) {
  if (!linked) return <span className="text-small font-medium text-ink">{name}</span>
  return (
    <a
      href={metricHref(id)}
      onClick={(e) => {
        if (!plainClick(e)) return
        e.preventDefault()
        closeHelp()
        openMetricDefinition(id)
      }}
      className={cx(LINK_CLASS, 'text-small')}
    >
      {name}
    </a>
  )
}

/**
 * A metric's name and definition as they are in force, as the mode reads them (the glossary's own
 * wording, `glossaryEntryInMode`), where the mode shows the metric.
 */
function DefinitionItem({ id }: { id: string }) {
  const { metrics, access } = useAnalytics()
  const def = metrics.def(id)
  const entry = def ? glossaryEntryInMode(access, buildGlossary([def])[0]) : null
  if (!entry) return null
  return (
    <li className="py-2">
      <MetricName id={id} name={entry.term} linked={access.can('page:data')} />
      <p className="mt-0.5 text-meta leading-snug text-ink-2">{entry.definition}</p>
    </li>
  )
}

/** The glossary of the metrics the mode shows, built from the definitions in force. */
function Glossary() {
  const { metrics, access } = useAnalytics()
  const entries = glossaryInMode(access, buildGlossary(METRICS.map((m) => metrics.def(m.id) ?? m)))
  const linked = access.can('page:data')
  return (
    <Section title={`${entries.length} terms`}>
      <dl className="mt-1 divide-y divide-rule">
        {entries.map((e) => (
          <div key={e.id} className="py-2.5">
            <dt className="flex flex-wrap items-baseline gap-x-2">
              <MetricName id={e.id} name={e.term} linked={linked} />
              <span className="text-meta text-muted">{e.where}</span>
            </dt>
            <dd className="mt-0.5 text-meta leading-snug text-ink-2">{e.definition}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

/** The release notes, each with the items the mode reads (`releaseNotesIn`). */
function WhatsNew() {
  const access = useAnalyticsIfAny()?.access
  return (
    <div className="mt-2 flex flex-col gap-5">
      {releaseNotesIn(access).map((r, i) => (
        <section key={`${r.date}-${i}`}>
          <p className="text-meta text-muted">{formatDate(r.date)}</p>
          <h3 className="cut-head text-title leading-snug font-semibold text-ink">{r.title}</h3>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-small leading-[1.5] text-ink-2 marker:text-muted">
            {r.items.map((t, j) => (
              <li key={j}>{t}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** "Plan", or a Data room tab by its own name ("Data quality", "Metric definitions"). */
export function pageName(view: string, tab?: string): string {
  if (view === 'data' && tab) {
    const t = parseDataTab(tab).tab
    if (t !== 'datasets') return DATA_TABS.find((d) => d.key === t)?.label ?? PAGE_LABEL.data
  }
  return (PAGE_LABEL as Readonly<Record<string, string>>)[view] ?? view
}

export function ArticleView({
  article,
  titleRef,
}: {
  article: HelpArticle
  titleRef: Ref<HTMLHeadingElement>
}) {
  // The tour and page the mode shows.
  const { access, metrics } = useAnalytics()
  const tour = tourInMode(access, tourById(article.tour))
  const route = articlePage(access, article)
  const completed = useHelp((s) => s.prefs.completed)
  const definitions = (article.metrics ?? []).filter((id) => {
    const def = metrics.def(id)
    return !!def && !!glossaryEntryInMode(access, buildGlossary([def])[0])
  })
  return (
    <article className="px-5 pt-2 pb-8">
      <h2
        ref={titleRef}
        tabIndex={-1}
        className="cut-head rounded-mark text-section leading-tight font-semibold outline-none focus-visible:outline-2 focus-visible:outline-focus"
      >
        {article.title}
      </h2>
      {article.summary && <p className="mt-1 text-small leading-snug text-muted">{article.summary}</p>}
      {(tour || route) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tour && (
            <Button size="sm" variant="primary" onClick={() => startTour(tour.id)}>
              {completed.includes(tour.id) ? TAKE_THE_TOUR_AGAIN : TAKE_THE_TOUR}
              {tour.length && <span className="font-normal opacity-80">· {tour.length}</span>}
            </Button>
          )}
          {route && (
            <Button
              size="sm"
              onClick={() =>
                followLink({
                  kind: 'route',
                  target: route.tab ? `${route.view}.${route.tab}` : route.view,
                  label: '',
                })
              }
            >
              Open {pageName(route.view, route.tab)}
            </Button>
          )}
        </div>
      )}
      <div className="mt-2">
        {article.body.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </div>
      {article.generated === 'whats-new' && <WhatsNew />}
      {definitions.length > 0 && (
        <Section title="Definitions">
          <ul className="divide-y divide-rule">
            {definitions.map((id) => (
              <DefinitionItem key={id} id={id} />
            ))}
          </ul>
        </Section>
      )}
      {article.generated === 'glossary' && <Glossary />}
    </article>
  )
}
