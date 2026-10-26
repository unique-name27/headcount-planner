/**
 * Connects the modes to the app (docs/PLAN.md 8.1 to 8.3; the template app's connect.ts): registers
 * the data store's filter guard (every way filters change goes through the one clamp), route guard
 * (a hidden route opens the mode's home or the view's first shown tab, replacing the history entry; a
 * scoped mode waiting for its pick shows only its home) and standard guard; checks the opening route;
 * and carries out a mode or pick change:
 *
 * - not a history entry; "Show pay amounts" turns off (src/data/store.ts `setShowPay(false)`);
 * - the filter values the previous scope pinned are released (the unit an HRBP pick pinned, the
 *   tree's root seat), so a scope never follows into the next mode (the M2 review, B2); then the
 *   clamp runs with history `replace`, dropping any list filter that would empty the new scope; the
 *   route guard moves a hidden route home; the records panel closes (`onModeChange`);
 * - a toast with the Mode button's text and `NOT_SECURITY_SHORT`.
 *
 * With the sample, every mode's unmade pick is filled with its persona (`samplePicks`). Called once
 * by the shell. No React: the shell passes `notify` to show toasts, and `setAccessLists` hands it the
 * saved official lists (the scopes read the HRBP column and the leader seats from them).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled it. The template app's standard
 * guard is kept: Manager and Finance mode show the saved data standard.
 */
import { batchAddress } from '@/data/address'
import { positionIndexOf } from '@/data/context'
import type { ListsState } from '@/data/lists/types'
import { cachedSample } from '@/data/sample'
import { type Datasets, type Mode, withAllDatasets } from '@/data/schema'
import { type Filters, isExcluded, withMode } from '@/data/scope'
import {
  contextAsOf,
  initialRouteNamed,
  onSample,
  savedDataStandard,
  setFilterGuard,
  setRouteGuard,
  setStandardGuard,
  useStore,
} from '@/data/store'
import type { AccessContext } from './context'
import { CHANGE_MODE, FINANCE_FILTERS_NOTE, modeToastTitle, NOT_SECURITY_SHORT, PICKER_COPY } from './copy'
import { listsInForce } from './lists'
import { homeOf, homeViewOf, type ModePicks, modeButtonLabel, PICK_BLOCKS_READS, SCOPE_OF } from './modes'
import { routeDecision } from './policy'
import { atomsOn } from './scopes/atoms'
import { clampFilters, treePin } from './scopes/clamp'
import { type ActingAsOption, actingAsOptions, type ScopeResult, scopeFor } from './scopes/index'
import type { ScopeLock } from './scopes/types'
import { openModeMenu, samplePicks, useMode } from './store'

/** A toast the shell shows for the modes. */
export interface AccessNotice {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  timeout?: number
}

export interface ConnectDeps {
  notify: (n: AccessNotice) => void
  /** A mode or pick changed: close what shows records from before (the records panel). */
  onModeChange?: () => void
}

let deps: ConnectDeps = { notify: () => undefined }
let savedLists: () => ListsState | null = () => null

/**
 * Hand the modes the saved official lists (Settings > Official lists): the shell registers its lists
 * store's state here. Without it the lists are the built-in ones (on the sample, the sample's).
 */
export function setAccessLists(get: (() => ListsState | null) | null): void {
  savedLists = get ?? (() => null)
}

const datasets = new WeakMap<object, Datasets>()
function allOf(data: Partial<Datasets>): Datasets {
  let hit = datasets.get(data)
  if (!hit) {
    hit = withAllDatasets(data)
    datasets.set(data, hit)
  }
  return hit
}

/** The scope a mode's picks hold over the data loaded now. */
function liveHeld(
  mode: Mode = useMode.getState().mode,
  picks: ModePicks = useMode.getState().actingAs,
): ScopeResult {
  if (!SCOPE_OF[mode]) return { scope: null, unset: false }
  const st = useStore.getState()
  const all = allOf(st.data)
  const asOf = contextAsOf({ data: all, sources: st.sources, asOfOverride: st.asOfOverride })
  const positionIndex = positionIndexOf(all.positions, asOf)
  return scopeFor(mode, picks, {
    positionIndex,
    asOf,
    all,
    lists: listsInForce(savedLists(), all, st.sources),
    atoms: atomsOn(all.positions, asOf),
  })
}

/** The mode, its scope and whether its pick is to be made, right now (from the stores, for event handlers). */
export function liveAccess(): Pick<AccessContext, 'mode' | 'scope' | 'unset' | 'actingAs'> {
  const { mode, actingAs } = useMode.getState()
  const held = liveHeld(mode, actingAs)
  return { mode, scope: held.scope, unset: held.unset, actingAs: actingAs[mode] }
}

/** The scope the current mode holds right now; null in the modes without one. */
export function liveScope(): ScopeLock | null {
  return liveHeld().scope
}

/**
 * The Acting as picker's rows for a mode over the data loaded now: the sample's persona first while
 * the sample is loaded, then the largest scope first (src/access/scopes `actingAsOptions`).
 */
export function liveActingAsOptions(mode: Mode): readonly ActingAsOption[] {
  const st = useStore.getState()
  const all = allOf(st.data)
  const asOf = contextAsOf({ data: all, sources: st.sources, asOfOverride: st.asOfOverride })
  return actingAsOptions(mode, {
    positionIndex: positionIndexOf(all.positions, asOf),
    asOf,
    all,
    lists: listsInForce(savedLists(), all, st.sources),
    personas: onSample(st.sources) ? cachedSample().personas : null,
  })
}

/** Whether a scoped mode is still waiting for its Acting as pick (its home's empty state shows). */
export function waitingForPick(mode: Mode = useMode.getState().mode): boolean {
  return !!useStore.getState().ready && PICK_BLOCKS_READS[mode] && liveHeld(mode).unset
}

const changeMode = { label: CHANGE_MODE, onClick: openModeMenu }

/** Send a hidden route to where the mode shows it, silently (a mode change says so itself). */
function routeIntoMode(mode: Mode): void {
  const st = useStore.getState()
  const d = routeDecision(mode, st.route)
  if (d.redirected)
    st.navigate(d.route.view, d.route.tab, { history: 'replace', scroll: d.route.view !== st.route.view })
}

/** The note the picker opens with when the remembered pick is gone; null when nothing was picked. */
function goneNote(mode: Mode, picks: ModePicks): string | null {
  const p = picks[mode]
  if (!p) return null
  return PICKER_COPY[mode].gone(mode === 'hrbp' && p.unit ? `${p.name} (${p.unit})` : p.name)
}

/** On the sample, every mode's unmade pick is its persona (13.3), so no first screen is blank. */
function fillSamplePicks(): void {
  const st = useStore.getState()
  if (!onSample(st.sources)) return
  useMode.getState().fillPicks(samplePicks(cachedSample().personas))
}

/**
 * A scoped mode on loaded data: is the pick still usable? If not, open its picker with a note and
 * show the home's empty state; either way keep the filters inside the scope (and Finance's filters
 * to its dimensions).
 */
function checkScope(): void {
  const { mode, picking, actingAs } = useMode.getState()
  const st = useStore.getState()
  if (!st.ready) return
  const held = liveHeld(mode, actingAs)
  if (held.unset && PICK_BLOCKS_READS[mode]) {
    if (!picking) useMode.getState().openPicker(mode, goneNote(mode, actingAs))
    const home = homeOf(mode)
    if (st.route.view !== home.view) st.navigate(home.view, home.tab, { history: 'replace', scroll: false })
  }
  const clamped = clampFilters(st.filters, held.scope, mode)
  if (clamped !== st.filters) st.setFilters(clamped, { history: 'replace' })
}

/**
 * The filters with what a scope pinned released: the tree's root seat (or the value an empty tree
 * pins) as the leader filter, the unit (or the value an empty unit pins) from the business unit
 * filter. Filters a reader set inside the scope stay; the next clamp drops any that would empty the
 * next mode's scope. The same object when the scope pinned nothing that is still there.
 */
export function releasePinned(f: Filters, scope: ScopeLock): Filters {
  if (scope.kind === 'tree') {
    const leader = f.leaderId
    if (!leader || isExcluded(f, 'leaderId')) return f
    if (leader !== treePin(scope) && !scope.rootPositionIds.has(leader)) return f
    return { ...f, leaderId: null, modes: withMode(f.modes, 'leaderId', 'include') }
  }
  if (isExcluded(f, 'businessUnit') || !f.businessUnit.includes(scope.unit)) return f
  const businessUnit = f.businessUnit.filter((u) => u !== scope.unit)
  return {
    ...f,
    businessUnit,
    modes: businessUnit.length ? f.modes : withMode(f.modes, 'businessUnit', 'include'),
  }
}

interface Was {
  mode: Mode
  picks: ModePicks
}

/** What changes when the mode or its pick changes (8.1). Not a history entry. */
function switched(prev: Was, next: Was): void {
  const st = useStore.getState()
  const before = liveHeld(prev.mode, prev.picks)
  const after = liveHeld(next.mode, next.picks)
  batchAddress('replace', () => {
    // One rule, whatever the modes: pay amounts go off.
    st.setShowPay(false)
    const now = useStore.getState().filters
    // What the previous scope pinned goes with it, so it never narrows the next mode.
    const released = before.scope ? releasePinned(now, before.scope) : now
    const clamped = clampFilters(released, after.scope, next.mode)
    if (clamped !== now) st.setFilters(clamped, { history: 'replace' })
    routeIntoMode(next.mode)
  })
  deps.onModeChange?.()
  const pick = next.picks[next.mode]
  const title =
    SCOPE_OF[next.mode] && pick && !after.unset ? modeButtonLabel(next.mode, pick) : modeToastTitle(next.mode)
  if (next.mode === 'finance')
    deps.notify({ title, description: `${FINANCE_FILTERS_NOTE} ${NOT_SECURITY_SHORT}` })
  else deps.notify({ title, description: NOT_SECURITY_SHORT })
  if (SCOPE_OF[next.mode]) checkScope()
}

/** The page this load opened on: an unnamed one goes to the mode's home; a hidden one is redirected with a notice. */
function checkOpeningRoute(): void {
  const st = useStore.getState()
  const mode = useMode.getState().mode
  if (!initialRouteNamed) {
    const home = homeOf(mode)
    if (st.route.view !== home.view) st.navigate(home.view, home.tab, { history: 'replace', scroll: false })
    return
  }
  // The route guard redirects and says why.
  if (routeDecision(mode, st.route).redirected)
    st.navigate(st.route.view, st.route.tab, { history: 'replace', scroll: false })
}

const samePick = (a: ModePicks[Mode], b: ModePicks[Mode]): boolean =>
  a === b || (!!a && !!b && a.personId === b.personId && (a.unit ?? null) === (b.unit ?? null))

let connected: (() => void) | null = null

/** Register the guards and follow the mode. Call once, before the address connects. Returns the stop (tests). */
export function connectAccess(d: ConnectDeps): () => void {
  connected?.()
  deps = d
  setFilterGuard((f) => {
    const mode = useMode.getState().mode
    const scope = SCOPE_OF[mode] ? liveScope() : null
    return clampFilters(f, scope, mode)
  })
  setRouteGuard({
    check(route) {
      const mode = useMode.getState().mode
      // No pick yet: the home's empty state is the only page (the picker is open).
      if (waitingForPick(mode) && route.view !== homeViewOf(mode)) return { route: homeOf(mode) }
      const r = routeDecision(mode, route)
      if (!r.redirected || !r.reason) return null
      const reason = r.reason
      return {
        route: r.route,
        notice: () =>
          deps.notify({ title: reason.title, description: reason.description, action: changeMode }),
      }
    },
    home: () => homeViewOf(useMode.getState().mode),
  })
  setStandardGuard((asked) => {
    const mode = useMode.getState().mode
    return mode === 'manager' || mode === 'finance' ? savedDataStandard() : asked
  })
  fillSamplePicks()
  checkOpeningRoute()
  checkScope()
  const unMode = useMode.subscribe((s, prev) => {
    if (s.mode !== prev.mode || !samePick(s.actingAs[s.mode], prev.actingAs[s.mode]))
      switched({ mode: prev.mode, picks: prev.actingAs }, { mode: s.mode, picks: s.actingAs })
  })
  const unData = useStore.subscribe((s, prev) => {
    if (
      s.ready !== prev.ready ||
      s.data !== prev.data ||
      s.sources !== prev.sources ||
      s.asOfOverride !== prev.asOfOverride
    ) {
      fillSamplePicks()
      checkScope()
    }
  })
  const stop = () => {
    unMode()
    unData()
    setFilterGuard(null)
    setRouteGuard(null)
    setStandardGuard(null)
    deps = { notify: () => undefined }
    connected = null
  }
  connected = stop
  return stop
}
