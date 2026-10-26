/**
 * The Headcount Planner shell (the template app's App.tsx; docs/PLAN.md 3, 8 and 9): the band
 * (masthead and folder tabs), then for a view the filter row, the view header and the view body; or
 * one of the masthead's pages (the Data room, the Action center, Audit). It owns theme, routing, the
 * modes' guards (`connectAccess`), the loading gate, tooltips and toasts.
 *
 * The Help button (in the masthead) mounts the Help sheet and the tour layer; the mode's home view
 * carries its first-visit welcome line (M4, src/help).
 *
 * Views render through the registry and their frozen `ViewDef` only (`view.View`, `view.headline`),
 * each inside an error boundary: a view still being built, or one that fails on odd data, says so in
 * its body and leaves the rest of the app working. A view shows only the tabs the mode shows
 * (`withAccessTabs`); a hidden route never renders (the route guard in `navigate` sends it home).
 */
import { useEffect } from 'react'
import { type AccessNotice, connectAccess, setAccessLists } from '@/access/connect'
import { FigureRegistryProvider } from '@/charts/registry'
import { CurrentViewProvider } from '@/components/currentView'
import { IconLock } from '@/components/icons'
import { Toaster, toast } from '@/components/toast'
import { TooltipProvider } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample/base'
import { isPageKey, type ViewKey } from '@/data/schema'
import { onSample, STORAGE_UNAVAILABLE_NOTICE, useStore } from '@/data/store'
import { DrillPanel } from '@/drill'
import { useDrillStore } from '@/drill/store'
import { WelcomeCard } from '@/help/ui/WelcomeCard'
import { VIEWS, viewByKey } from '@/views/registry'
import { type ViewDef, withAccessTabs } from '@/views/types'
import { ActingAsPicker } from './ActingAsPicker'
import { appPlanStore, samplePlan } from './boot'
import { DOM_IDS } from './brand'
import { FOOTER_LOCAL, footerSample } from './copy'
import { useOfficialLists } from './dictionary'
import { ViewErrorBoundary } from './ErrorBoundary'
import { resolveTab } from './exportMeta'
import { FilterBar } from './FilterBar'
import { FolderTabs, VIEW_PANEL_ID } from './FolderTabs'
import { LoadingShell } from './Loading'
import { Masthead } from './Masthead'
import { PAGES, type PageDef } from './pages'
import { SAMPLE_CHANGED_NOTICE, setAsideOf, startPlan, usePlan } from './planState'
import { ShellProviders } from './providers'
import { SettingsSheet } from './settings/SettingsSheet'
import { useDisplaySettings, useHashRouting } from './useShell'
import { VIEW_BODY_ID, ViewHeader } from './ViewHeader'
import { viewTabOf } from './viewTab'

const PAGE = 'mx-auto w-full max-w-[1440px] px-(--gutter)'

/** A notice from the modes (a redirect, a mode change) as a toast. */
export function showAccessNotice(n: AccessNotice): void {
  toast(n.title, {
    ...(n.description ? { description: n.description } : {}),
    ...(n.action ? { action: n.action } : {}),
    timeout: n.timeout ?? 8000,
  })
}

function ViewPage({ view: registered, requestedTab }: { view: ViewDef; requestedTab: string }) {
  const filters = useStore((s) => s.filters)
  const resetFilters = useStore((s) => s.resetFilters)
  // The tabs the mode shows (Manager mode's Plan has no Overview).
  const { access } = useAnalytics()
  const view = withAccessTabs(registered, access)
  // A part of a tab picked in the address ("assumptions:trade-rates") belongs to its tab: the
  // shell works with the tab, and only a tab with parts gets the whole address (`viewTabOf`). A tab
  // the mode hides, or "<tab>:<anything>" on a tab without parts, rewrites the address to the tab
  // shown.
  const { tab, viewTab, rewrite } = viewTabOf(view.tabs, registered.tabs, requestedTab)
  const hasSubTabs = view.tabs.length > 1
  const welcome = view.key === 'team' ? 'team' : view.key === 'home' ? 'home' : null
  const navigate = useStore((s) => s.navigate)
  useEffect(() => {
    if (rewrite) navigate(view.key, tab, { scroll: false })
  }, [rewrite, navigate, view.key, tab])
  return (
    <div id={VIEW_PANEL_ID} role="tabpanel" aria-labelledby={`tab-${view.key}`}>
      {view.datasets.length > 0 && <FilterBar />}
      <FigureRegistryProvider key={view.key}>
        <CurrentViewProvider
          value={{ key: view.key, label: view.label, tabs: view.tabs, tab, datasets: view.datasets }}
        >
          <ViewHeader view={view} tab={tab} />
          <div
            id={VIEW_BODY_ID}
            {...(hasSubTabs && { role: 'tabpanel', 'aria-labelledby': `subtab-${view.key}-${tab}` })}
            className="pt-5"
          >
            {/* The mode's home carries its first-visit line (My team in Manager mode, Home in the role modes). */}
            {welcome && <WelcomeCard variant={welcome} className="mb-4" />}
            <ViewErrorBoundary
              resetKey={`${view.key}.${tab}.${JSON.stringify(filters)}`}
              onResetFilters={resetFilters}
              label={view.label}
            >
              {/* The view fades in as it opens (CSS, held still under reduced motion). */}
              <div key={`${view.key}.${tab}`} className="view-enter">
                <view.View tab={viewTab} />
              </div>
            </ViewErrorBoundary>
          </div>
        </CurrentViewProvider>
      </FigureRegistryProvider>
    </div>
  )
}

/** A masthead page: the filter row where it has one, its own registry, error boundary and context. */
function PagePage({ page, requestedTab }: { page: PageDef; requestedTab: string }) {
  const filters = useStore((s) => s.filters)
  const resetFilters = useStore((s) => s.resetFilters)
  const tab = resolveTab(page.tabs, requestedTab.split(/[-:/]/)[0] ?? '')
  const Body = page.Page
  return (
    <div id={VIEW_PANEL_ID} role="tabpanel" aria-label={page.label}>
      {page.filters && <FilterBar />}
      <FigureRegistryProvider key={page.key}>
        <CurrentViewProvider
          value={{ key: page.key, label: page.label, tabs: [...page.tabs], tab, datasets: page.datasets }}
        >
          <ViewErrorBoundary
            what="This page"
            label={page.label}
            resetKey={`${page.key}.${requestedTab}.${JSON.stringify(filters)}`}
            onResetFilters={page.filters ? resetFilters : undefined}
          >
            <Body tab={requestedTab} />
          </ViewErrorBoundary>
        </CurrentViewProvider>
      </FigureRegistryProvider>
    </div>
  )
}

function Footer() {
  const { isSample } = useAnalytics()
  // The Data room says where files are kept; don't repeat it under the page.
  const onDataRoom = useStore((s) => s.route.view === 'data')
  if (onDataRoom && !isSample) return null
  return (
    <footer className="border-t border-rule">
      <div className={`${PAGE} flex flex-wrap items-center gap-x-6 gap-y-1 py-4 text-meta text-muted`}>
        {!onDataRoom && (
          <span className="flex items-center gap-1.5">
            <IconLock className="size-3.5 shrink-0" />
            {FOOTER_LOCAL}
          </span>
        )}
        {isSample && <span className="sm:ml-auto">{footerSample(SAMPLE_COMPANY)}</span>}
      </div>
    </footer>
  )
}

function Shell() {
  useHashRouting()
  const route = useStore((s) => s.route)
  const page = isPageKey(route.view) ? PAGES[route.view] : null
  const view = page ? null : (viewByKey.get(route.view as ViewKey) ?? VIEWS[0])
  return (
    <div className="flex min-h-dvh flex-col">
      {/* A skip link stays a link; it moves focus itself because the address holds the route and
          scope, and "#hcp-main" would add a history entry. */}
      <a
        href={`#${DOM_IDS.main}`}
        onClick={(e) => {
          e.preventDefault()
          document.getElementById(DOM_IDS.main)?.focus()
        }}
        className="sr-only z-50 rounded-control bg-ink px-3 py-1.5 text-small text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="band">
        <div className={PAGE}>
          <Masthead />
          <FolderTabs />
        </div>
      </header>
      <main id={DOM_IDS.main} tabIndex={-1} className="flex-1 outline-none">
        <div className={`${PAGE} pb-16`}>
          {view ? (
            <ViewPage view={view} requestedTab={route.tab} />
          ) : page ? (
            <PagePage page={page} requestedTab={route.tab} />
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  )
}

export function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const planReady = usePlan((s) => s.ready)
  useDisplaySettings()
  // The modes' guards go in before the data loads and the address connects, so the first scope and
  // route the app shows are already the mode's; a mode change closes the records panel.
  useEffect(() => {
    // The scopes read the HRBP column and the leader seats from the saved official lists.
    setAccessLists(() => useOfficialLists.getState().state)
    const stop = connectAccess({
      notify: showAccessNotice,
      onModeChange: () => useDrillStore.getState().close(),
    })
    return () => {
      stop()
      setAccessLists(null)
    }
  }, [])
  useEffect(() => {
    const data = init().then(() => {
      if (useStore.getState().storageUnavailable)
        toast(STORAGE_UNAVAILABLE_NOTICE.title, {
          description: STORAGE_UNAVAILABLE_NOTICE.description,
          timeout: 10_000,
        })
    })
    const plan = startPlan(appPlanStore())
    // A plan state stored against an earlier build of the sample is set aside, never mixed in (B9).
    void Promise.all([data, plan]).then(() => {
      const p = usePlan.getState()
      const sample = onSample(useStore.getState().sources) ? samplePlan() : null
      if (setAsideOf(p.stored, p.audit, sample))
        toast(SAMPLE_CHANGED_NOTICE.title, {
          description: SAMPLE_CHANGED_NOTICE.description,
          timeout: 15_000,
        })
    })
  }, [init])
  return (
    <TooltipProvider>
      {ready && planReady ? (
        <ShellProviders page>
          <Shell />
          {/* Inside the provider: the panels read the analytics context (names, as-of, tiers, pay setting). */}
          <DrillPanel />
          <SettingsSheet />
          <ActingAsPicker />
        </ShellProviders>
      ) : (
        <LoadingShell />
      )}
      <Toaster />
    </TooltipProvider>
  )
}
