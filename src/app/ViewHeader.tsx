/**
 * The head of a view (the template app's ViewHeader.tsx; docs/PLAN.md 9.1 and 9.2): its name (the
 * Home view names the role's home, "Unit plan"), the scope, window and as-of line with where the
 * data came from, the view's own controls, the version picker (`ver`) and the comparison picker
 * (`vs`), Export, and underline sub-tabs. On phones the view's own controls fold into one "More"
 * button; the pickers and Export stay out. Each part follows its decision (`header:<view>`,
 * `header:scope`, `filter:version`, `filter:compare`, and the export decisions in ExportMenu).
 * "About this view" (`header:about`, M4) trails the scope line and opens the view's help article; a
 * masthead page's header carries "About this page", and the Data room's (HR admin's home) its
 * first-visit welcome line.
 */
import { type KeyboardEvent, useEffect, useRef } from 'react'
import { IconPin } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Button, cx, Popover, Tag, Tip } from '@/components/ui'
import { useNarrow } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import type { RouteView } from '@/data/schema'
import { ABOUT_THIS_PAGE } from '@/help/copy'
import { AboutViewLink } from '@/help/ui/AboutViewLink'
import { WelcomeCard } from '@/help/ui/WelcomeCard'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import type { ViewDef, ViewTab } from '@/views/types'
import { DOM_IDS } from './brand'
import { ExportMenu } from './ExportMenu'
import { datasetNote } from './exportMeta'
import { rovingIndex } from './keyboard'
import { ComparisonPicker, VersionPicker } from './Pickers'

export const VIEW_BODY_ID = DOM_IDS.viewBody

function Provenance({ view }: { view: Pick<ViewDef, 'datasets'> }) {
  const ctx = useAnalytics()
  const note = datasetNote(view.datasets, ctx.sources)
  return (
    <Tip
      side="bottom"
      content={
        <ul className="space-y-0.5">
          {note.datasets.map((d) => (
            <li key={d.key} className="flex gap-3">
              <span className="flex-1">{d.label}</span>
              <span className="text-muted">
                {d.kind === 'upload' ? (d.fileName ?? 'Uploaded') : 'Sample'} · {plural(d.rowCount, 'row')}
              </span>
            </li>
          ))}
        </ul>
      }
    >
      <button type="button" aria-label={`${note.text}. Data sources for this view`} className="rounded-chip">
        <Tag tone={note.allSample ? 'neutral' : 'outline'}>{note.text}</Tag>
      </button>
    </Tip>
  )
}

/** What the sub-tabs read of a view or a page. */
interface Tabbed {
  key: RouteView
  label: string
  tabs: readonly ViewTab[]
}

function SubTabs({ view, active }: { view: Tabbed; active: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const at = view.tabs.findIndex((t) => t.key === active)
  // On a narrow screen the strip scrolls sideways: arriving at a later tab (a link, a KPI tile, an
  // address) brings the selected tab into view. Only the strip scrolls, never the page.
  useEffect(() => {
    const el = refs.current[at]
    const strip = el?.parentElement
    if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return
    const box = strip.getBoundingClientRect()
    const tab = el.getBoundingClientRect()
    const pad = 16
    if (tab.left < box.left + pad) strip.scrollLeft -= box.left + pad - tab.left
    else if (tab.right > box.right - pad) strip.scrollLeft += tab.right - (box.right - pad)
  }, [at])
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = rovingIndex(e.key, i, view.tabs.length)
    if (next == null) return
    e.preventDefault()
    refs.current[next]?.focus()
    goTo(view.key, view.tabs[next].key)
  }
  return (
    <div
      role="tablist"
      aria-label={`${view.label} sections`}
      data-tour="view-tabs"
      className="-mx-(--gutter) flex gap-6 overflow-x-auto px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {view.tabs.map((t, i) => {
        const selected = t.key === active
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`subtab-${view.key}-${t.key}`}
            aria-selected={selected}
            aria-controls={VIEW_BODY_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => goTo(view.key, t.key)}
            onKeyDown={onKeyDown(i)}
            className={cx(
              'relative h-10 shrink-0 text-small whitespace-nowrap transition-colors focus-visible:-outline-offset-2',
              selected
                ? 'font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink'
                : 'font-medium text-ink-2 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function ViewHeader({ view, tab }: { view: ViewDef; tab: string }) {
  const ctx = useAnalytics()
  const { access } = ctx
  const Actions = access.can(`header:${view.key}`) ? view.HeaderActions : undefined
  // A view with no figures here (Home in a mode with no role home) has no figures to export.
  const figureless = view.figureless?.(ctx) ?? false
  const readsData = view.datasets.length > 0
  const pickers = readsData && !figureless
  const narrow = useNarrow()
  return (
    <div className="pt-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[420px]">
          <h1 className="cut-head text-page-title leading-[1.1] font-[650] tracking-[-0.01em]">
            {view.title?.(ctx) ?? view.label}
          </h1>
          {readsData && access.can('header:scope') && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-ink-2">
              {/* A scoped mode's line starts with the pin: the team, org or unit it keeps. */}
              {access.scope && <IconPin className="size-3.5 shrink-0 text-muted" />}
              <span>{ctx.scopeLabel}</span>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <span>{ctx.window.label}</span>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <span>as of {formatDate(ctx.asOf)}</span>
              <span className="ml-1.5">
                <Provenance view={view} />
              </span>
              {/* A quiet trailing link: this view's help article. */}
              <span className="ml-3 inline-flex items-center">
                <AboutViewLink view={view.key} tab={tab} />
              </span>
            </div>
          )}
          {!(readsData && access.can('header:scope')) && (
            <p className="mt-1.5">
              <AboutViewLink view={view.key} tab={tab} />
            </p>
          )}
        </div>
        <div data-tour="view-controls" className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
          {Actions &&
            (narrow ? (
              <Popover
                title="More"
                align="start"
                width={300}
                trigger={
                  <Button variant="secondary" caret aria-label={`More for ${view.label}`}>
                    More
                  </Button>
                }
              >
                <div className="flex flex-col items-start gap-3">
                  <Actions />
                </div>
              </Popover>
            ) : (
              <Actions />
            ))}
          {pickers && access.can('filter:version') && <VersionPicker />}
          {pickers && access.can('filter:compare') && <ComparisonPicker />}
          <ExportMenu view={view} tab={tab} linkOnly={figureless} />
        </div>
      </div>
      <div className={cx('mt-4 border-b border-rule', view.tabs.length < 2 && 'mt-5')}>
        {view.tabs.length > 1 && <SubTabs view={view} active={tab} />}
      </div>
    </div>
  )
}

/** A masthead page's head: its name and the scope line, with the same sub-tabs when it has any. */
export function PageHeader({ page, tab }: { page: Tabbed; tab: string }) {
  return (
    <div className="pt-5">
      <h1 className="cut-head text-page-title leading-[1.1] font-[650] tracking-[-0.01em]">{page.label}</h1>
      <p className="mt-1.5">
        <AboutViewLink view={page.key} tab={tab} label={ABOUT_THIS_PAGE} />
      </p>
      <div className={cx('mt-4 border-b border-rule', page.tabs.length < 2 && 'mt-5')}>
        {page.tabs.length > 1 && <SubTabs view={page} active={tab} />}
      </div>
      {/* HR admin's home is the Data room: its first-visit line sits under the page's tabs. */}
      {page.key === 'data' && <WelcomeCard variant="admin" className="mt-4" />}
    </div>
  )
}
