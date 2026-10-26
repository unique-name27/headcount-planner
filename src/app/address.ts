/**
 * The one writer of the address (the template app's address.ts; docs/PLAN.md 9.1 and 9.2). It
 * follows the store (route, filters, the version and comparison pickers, data standard) and the
 * quality lens and writes `#view.tab?scope` with the history policy of `AddressWriter`; it follows
 * Back, Forward and typed or pasted addresses the other way, restoring the route and the scope
 * together without pushing.
 *
 * On load (`useAddress`, once the data is loaded): a link's scope applies exactly, minus values the
 * data doesn't have and pickers this workspace can't show (a toast says which); without one, the
 * saved view marked to open with applies, else your last filters; either way the address is then
 * written with `replaceState`.
 *
 * The data standard, the lens and the version and comparison in the address are this tab's scope:
 * a link, Back and Forward or a saved view show them here without saving them, so other open tabs
 * never follow. The version and comparison are pickers, never filters: they are not clamped, and an
 * unknown or cross-year value resets to the default (`checkPicks`).
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { currentScope, routePath } from '@/components/navigation'
import { toast } from '@/components/toast'
import {
  type AddressIntent,
  addressBatching,
  batchAddress,
  currentEntry,
  type HistoryMark,
  isHistoryMark,
  lensOn,
  onAddressFlush,
  setLensOn,
  takeAddressHint,
} from '@/data/address'
import { type AnalyticsContext, pickCatalog } from '@/data/context'
import { normalizeFilters, sameFilters } from '@/data/scope'
import {
  homeView,
  lastFilters,
  parseHash,
  type Route,
  savedDataStandard,
  takeInitialScope,
  useStore,
} from '@/data/store'
import {
  checkPicks,
  checkScope,
  hashWithScope,
  type LeftOut,
  leftOutMessage,
  type PeriodProblem,
  type PickProblem,
  periodMessage,
  picksMessage,
  readScope,
  type ScopeVocabulary,
  splitHash,
  type UrlScope,
  vocabularyOf,
} from '@/data/urlScope'
import { useSavedViews } from '@/data/viewsStore'
import { AddressWriter } from './addressWriter'

const browserHistory = {
  hash: () => (typeof location === 'undefined' ? '' : location.hash),
  state: () => {
    try {
      return typeof history === 'undefined' ? null : history.state
    } catch {
      return null
    }
  },
  push: (hash: string, mark: HistoryMark) => {
    try {
      history.pushState(mark, '', hash)
    } catch {
      // Some browsers refuse history entries for file:// pages; a plain hash change still works.
      location.hash = hash
    }
  },
  replace: (hash: string, mark: HistoryMark) => {
    try {
      history.replaceState(mark, '', hash)
    } catch {
      /* file:// pages in some browsers: the route still works without the hash */
    }
  },
}

export const addressWriter = new AddressWriter(browserHistory, {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
})

/** Keep one history entry for every change while a filter menu is open; call the result on close. */
export const holdHistory = (): (() => void) => addressWriter.hold()

/** The scope on screen and a route's path, as navigation reads them (one definition, for links too). */
export { currentScope, routePath }

/** The address for the route and scope on screen. */
export function addressFor(route: Route, scope: UrlScope = currentScope()): string {
  return hashWithScope(routePath(route.view, route.tab), scope)
}

let applying = false

/**
 * The saved view applied on each history entry the app wrote (this page load only), so Back and
 * Forward show the view that entry was in, never "edited" over a scope it was not applied to.
 */
const appliedAt = new Map<number, string | null>()

/** Remember the saved view applied on the entry on screen. */
function noteEntry(): void {
  const id = currentEntry()
  if (id != null) appliedAt.set(id, useSavedViews.getState().appliedId)
}

/** Write the address for the current state with this intent (or the default for what changed). */
function writeNow(intent: AddressIntent | null): void {
  if (applying || typeof location === 'undefined') return
  const want = addressFor(useStore.getState().route)
  const routeChanged = splitHash(want).route !== splitHash(location.hash).route
  addressWriter.write(want, intent ?? (routeChanged ? 'push' : 'coalesce'))
  noteEntry()
}

/**
 * Put a scope on screen: filters, pickers, data standard and lens (no address write of its own).
 * `save` stores the filters even when they are already on screen (the scope a page opened with
 * becomes your last filters). The data standard, the lens and the pickers are this tab's: never
 * saved from here.
 */
function putScope(scope: UrlScope, save = false): void {
  const st = useStore.getState()
  if (save || !sameFilters(scope.filters, st.filters)) st.setFilters(normalizeFilters(scope.filters))
  st.setPicks({ version: scope.version, compare: scope.compare })
  st.setScopeStandard(scope.standard)
  if (lensOn() !== scope.lens) setLensOn(scope.lens)
}

/** "The link's period "x" could not be read, so the default was used." */
const unreadableMessage = (unreadable: readonly string[]): string =>
  `The link's ${unreadable.join(' and ')} could not be read, so the ${unreadable.length === 1 ? 'default was' : 'defaults were'} used.`

/** What a link changed on the way in, in one toast: values left out, unreadable parts, the period, the pickers. */
export function leftOutLines(
  leftOut: readonly LeftOut[],
  unreadable: readonly string[],
  period: PeriodProblem | null = null,
  picks: readonly PickProblem[] = [],
): string[] {
  const parts: string[] = []
  if (leftOut.length) parts.push(leftOutMessage(leftOut))
  if (unreadable.length) parts.push(unreadableMessage(unreadable))
  if (period) parts.push(periodMessage(period))
  if (picks.length) parts.push(picksMessage(picks))
  return parts
}

function toastLeftOut(
  leftOut: readonly LeftOut[],
  unreadable: readonly string[],
  period: PeriodProblem | null = null,
  picks: readonly PickProblem[] = [],
): void {
  const parts = leftOutLines(leftOut, unreadable, period, picks)
  if (!parts.length) return
  toast(parts[0], { ...(parts.length > 1 ? { description: parts.slice(1).join(' ') } : {}), timeout: 9000 })
}

/** What a scope is checked against: the data's values and the versions the pickers can offer. */
type ScopeCheck = Pick<AnalyticsContext, 'all' | 'asOf' | 'versions'>

/** The scope as this workspace can show it: values in the data, a period it accepts, pickers it has. */
function checkAll(
  scope: UrlScope,
  vocab: ScopeVocabulary,
  ctx: ScopeCheck,
): { scope: UrlScope; leftOut: LeftOut[]; period: PeriodProblem | null; picks: PickProblem[] } {
  const checked = checkScope(scope, vocab)
  const picked = checkPicks(checked.scope, pickCatalog(ctx.versions, ctx.asOf))
  return { scope: picked.scope, leftOut: checked.leftOut, period: checked.period, picks: picked.reset }
}

/** Follow the address: Back, Forward, or an address typed, pasted or clicked. Never pushes. */
function followAddress(ctx: ScopeCheck): void {
  const st = useStore.getState()
  const route = parseHash(location.hash)
  const read = readScope(splitHash(location.hash).query)
  // An entry the app wrote is complete: no scope there means the defaults. A bare "#plan" typed or
  // clicked keeps the scope on screen.
  const marked = isHistoryMark(history.state)
  const exact = read.present || marked
  let checked: ReturnType<typeof checkAll> | null = null
  addressWriter.endBurst()
  applying = true
  try {
    batchAddress('replace', () => {
      if (exact) {
        checked = checkAll(read.scope, vocabularyOf(ctx), ctx)
        putScope(checked.scope)
        // The saved view this entry was in (none for an entry from before this page load).
        const entry = currentEntry()
        useSavedViews.getState().setApplied(entry == null ? null : (appliedAt.get(entry) ?? null))
      }
      if (route && (route.view !== st.route.view || route.tab !== st.route.tab))
        st.navigate(route.view, route.tab, { history: 'replace', scroll: route.view !== st.route.view })
    })
  } finally {
    applying = false
  }
  // Write the canonical address for this entry (an unknown hash gets the route on screen).
  takeAddressHint()
  addressWriter.write(addressFor(useStore.getState().route), 'replace')
  noteEntry()
  const c = checked as ReturnType<typeof checkAll> | null
  if (exact && c) toastLeftOut(c.leftOut, read.unreadable, c.period, c.picks)
}

/**
 * True when the saved view set to open with can't be used: an example while your own data is
 * loaded (examples are not listed then, so it could be neither seen nor unset). That setting is
 * forgotten, and the app opens with your last filters as when no view is set.
 */
function dropExampleStartup(ctx: Pick<AnalyticsContext, 'isSample'>, viewId: string | undefined): boolean {
  const views = useSavedViews.getState()
  const view = views.views.find((v) => v.id === viewId)
  if (!view?.example || ctx.isSample) return false
  views.setStartup(null)
  return true
}

/** The first address of this page load: finish applying the scope the app opened with. */
export function loadAddress(ctx: ScopeCheck & Pick<AnalyticsContext, 'isSample'>): void {
  const init = takeInitialScope()
  if (!init) return
  takeAddressHint()
  applying = true
  let checked: ReturnType<typeof checkAll> | null = null
  let title: string | undefined
  try {
    if (init.source === 'startup' && dropExampleStartup(ctx, init.viewId)) {
      putScope(
        {
          filters: lastFilters(),
          standard: savedDataStandard(),
          lens: lensOn(),
          version: null,
          compare: null,
        },
        true,
      )
      if (init.page) {
        const named = parseHash(location.hash)
        useStore
          .getState()
          .navigate(named?.view ?? homeView(), named?.tab ?? '', { history: 'replace', scroll: false })
      }
    } else if (init.scope) {
      checked = checkAll(init.scope, vocabularyOf(ctx), ctx)
      putScope(checked.scope, true)
      if (init.source === 'startup') {
        useSavedViews.getState().setApplied(init.viewId ?? null)
        const name = useSavedViews.getState().views.find((v) => v.id === init.viewId)?.name
        if ((checked.leftOut.length || checked.period || checked.picks.length) && name)
          title = `Opened "${name}" without part of its scope`
      }
    }
  } finally {
    applying = false
  }
  takeAddressHint()
  addressWriter.write(addressFor(useStore.getState().route), 'replace')
  noteEntry()
  const c = checked as ReturnType<typeof checkAll> | null
  if (title && c)
    toast(title, {
      description: [
        c.leftOut.length ? leftOutMessage(c.leftOut, "The saved view's") : '',
        c.period ? periodMessage(c.period, "The saved view's") : '',
        c.picks.length ? picksMessage(c.picks, "The saved view's") : '',
      ]
        .filter(Boolean)
        .join(' '),
      timeout: 9000,
    })
  else if (c) toastLeftOut(c.leftOut, init.source === 'link' ? init.unreadable : [], c.period, c.picks)
  else if (init.source === 'link') toastLeftOut([], init.unreadable)
}

/**
 * Follow the stores and write the address when the route, the filters, the pickers or the data
 * standard change. Every change takes its hint (`hintAddress`), also one that changes nothing the
 * address holds, so a hint never lingers to a later change. Returns the unsubscribe.
 */
export function followStores(write: (intent: AddressIntent | null) => void): () => void {
  const unsubs = [
    useStore.subscribe((s, prev) => {
      const intent = takeAddressHint()
      if (
        s.route === prev.route &&
        s.filters === prev.filters &&
        s.dataStandard === prev.dataStandard &&
        s.version === prev.version &&
        s.compare === prev.compare
      )
        return
      if (addressBatching()) return
      write(intent)
    }),
    // A saved view applied (or let go) belongs to the entry on screen.
    useSavedViews.subscribe((s, prev) => {
      if (s.appliedId !== prev.appliedId) noteEntry()
    }),
  ]
  return () => {
    for (const u of unsubs) u()
  }
}

/**
 * Keep the address and the stores in step both ways after load: the stores write the address, and
 * Back, Forward and typed addresses set the stores. `getCtx` gives the live analytics context.
 * Returns the stop.
 */
export function connectAddress(getCtx: () => ScopeCheck): () => void {
  const unfollow = followStores(writeNow)
  onAddressFlush((intent) => writeNow(intent))
  const follow = () => followAddress(getCtx())
  window.addEventListener('popstate', follow)
  window.addEventListener('hashchange', follow)
  return () => {
    unfollow()
    onAddressFlush(null)
    window.removeEventListener('popstate', follow)
    window.removeEventListener('hashchange', follow)
  }
}

/**
 * The shell's address sync. Call once inside the analytics provider: it applies the opening scope,
 * then keeps the address and the store in step both ways.
 */
export function useAddress(ctx: AnalyticsContext): void {
  const latest = useRef(ctx)
  useLayoutEffect(() => {
    latest.current = ctx
  })
  // Before paint, so the first screen already shows the opening scope.
  useLayoutEffect(() => {
    loadAddress(latest.current)
  }, [])
  useEffect(() => connectAddress(() => latest.current), [])
}
