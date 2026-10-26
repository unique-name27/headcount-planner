/**
 * Help state (the template app's help/store.ts): the Help sheet (open, article, search), the running
 * tour, and what this browser remembers (`hcp:help`: tours finished, each mode's welcome line
 * dismissed). Light on purpose: no article or tour content, so the shared components can import it.
 *
 * A tour remembers the page and the filters it started from and puts both back when it ends. It
 * never adds to the browser history: its moves replace the entry on screen (here, and in
 * tour/open.ts). The records panel and Settings close before a tour starts, since a panel that holds
 * focus would sit over it.
 *
 * HCP's change: one welcome line per mode, each on its own home (My team, Home or the Data room), so
 * `WelcomeLine` is the mode and `HelpPrefs.welcomeDismissed` lists the modes whose line is gone.
 * Finishing a mode's own first tour (`homeTourOf`) in that mode ends that mode's line, no other.
 */
import { create } from 'zustand'
import { isMode, type Mode } from '@/access/modes'
import { useMode } from '@/access/store'
import { closeSettings } from '@/app/settings/store'
import type { Filters } from '@/data/scope'
import { type Route, useStore } from '@/data/store'
import { useDrillStore } from '@/drill/store'
import { homeTourOf } from './access'

export const HELP_STORAGE_KEY = 'hcp:help'

export interface HelpPrefs {
  /** Tours finished to the last step, by id. */
  completed: readonly string[]
  /** The modes whose welcome line was dismissed, or whose home tour was finished in that mode. */
  welcomeDismissed: readonly Mode[]
}

/** Whose welcome line: each mode's own, on its own home. */
export type WelcomeLine = Mode

export const DEFAULT_PREFS: HelpPrefs = Object.freeze({ completed: [], welcomeDismissed: [] })

/** Read the remembered prefs; anything unreadable falls back to the defaults. */
export function parsePrefs(raw: string | null): HelpPrefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return DEFAULT_PREFS
    const o = v as Record<string, unknown>
    const strings = (x: unknown): string[] =>
      Array.isArray(x) ? [...new Set(x.filter((y): y is string => typeof y === 'string'))] : []
    return { completed: strings(o.completed), welcomeDismissed: strings(o.welcomeDismissed).filter(isMode) }
  } catch {
    return DEFAULT_PREFS
  }
}

function loadPrefs(): HelpPrefs {
  try {
    return parsePrefs(localStorage.getItem(HELP_STORAGE_KEY))
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(p: HelpPrefs): void {
  try {
    localStorage.setItem(HELP_STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable: the line shows again next time, nothing else changes */
  }
}

export interface TourRun {
  id: string
  index: number
  /** Where the tour started, to return there at the end. */
  from: Route
  /** The filters when it started, put back at the end. */
  filters: Filters
  /** What had focus when the tour started; focus returns there. */
  opener: HTMLElement | null
  /** The live mode when the tour started: finishing the mode's home tour ends that mode's welcome line. */
  mode?: Mode
}

export type TourEnd = 'done' | 'skip'

export interface HelpState {
  open: boolean
  /** The article shown in the sheet; null for the sheet's home. */
  articleId: string | null
  query: string
  /** Changes on every open request, so asking again lands on the requested article. */
  nonce: number
  /** A line at the top of the sheet's list ("That article is not shown in this mode."). */
  notice: string | null
  tour: TourRun | null
  prefs: HelpPrefs
  /** Where focus goes when the tour ends and its opener is gone. */
  lastEnded: { id: string; how: TourEnd; nonce: number } | null

  openHelp: (articleId?: string | null, notice?: string | null) => void
  closeHelp: () => void
  showArticle: (id: string | null) => void
  setQuery: (q: string) => void
  startTour: (id: string) => void
  goToStep: (index: number) => void
  endTour: (how: TourEnd) => void
  /** Dismiss a mode's welcome line. */
  dismissWelcome: (which: WelcomeLine) => void
  /** Re-read the remembered prefs (another tab changed them). */
  reloadPrefs: () => void
}

/** What had focus, when it is an element other than the page itself (none outside a browser). */
function focused(): HTMLElement | null {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') return null
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body ? active : null
}

export const useHelp = create<HelpState>((set, get) => ({
  open: false,
  articleId: null,
  query: '',
  nonce: 0,
  notice: null,
  tour: null,
  prefs: loadPrefs(),
  lastEnded: null,

  openHelp(articleId = null, notice = null) {
    // Every open starts from a clean search: an old query would hide the home links (tours,
    // Report a problem, What's new) and give "Back to results" for an unrelated search.
    set((s) => ({ open: true, articleId, query: '', nonce: s.nonce + 1, notice }))
  },
  closeHelp() {
    set({ open: false })
  },
  showArticle(id) {
    set({ articleId: id })
  },
  setQuery(query) {
    set({ query, articleId: null })
  },
  startTour(id) {
    const { route, filters } = useStore.getState()
    const opener = focused()
    // Panels that hold focus would sit over the tour: close them first.
    useDrillStore.getState().close()
    closeSettings()
    set({
      open: false,
      tour: {
        id,
        index: 0,
        from: { ...route },
        filters: { ...filters },
        opener,
        mode: useMode.getState().mode,
      },
    })
  },
  goToStep(index) {
    const t = get().tour
    if (t) set({ tour: { ...t, index } })
  },
  endTour(how) {
    const t = get().tour
    if (!t) return
    const app = useStore.getState()
    // Put the filters and the page back, replacing the entry on screen (no history entry).
    if (JSON.stringify(app.filters) !== JSON.stringify(t.filters))
      app.setFilters(t.filters, { history: 'replace' })
    const r = useStore.getState().route
    if (r.view !== t.from.view || r.tab !== t.from.tab)
      app.navigate(t.from.view, t.from.tab, { history: 'replace', scroll: r.view !== t.from.view })
    const prefs = how === 'done' ? withTourDone(get().prefs, t.id, t.mode) : get().prefs
    if (prefs !== get().prefs) savePrefs(prefs)
    set((s) => ({
      tour: null,
      prefs,
      lastEnded: { id: t.id, how, nonce: (s.lastEnded?.nonce ?? 0) + 1 },
    }))
  },
  dismissWelcome(which) {
    const prefs = withDismissed(get().prefs, which)
    if (prefs === get().prefs) return
    savePrefs(prefs)
    set({ prefs })
  },
  reloadPrefs() {
    set({ prefs: loadPrefs() })
  },
}))

/** The prefs with a mode's welcome line dismissed (the same object when it already was). */
export function withDismissed(p: HelpPrefs, which: WelcomeLine): HelpPrefs {
  return p.welcomeDismissed.includes(which) ? p : { ...p, welcomeDismissed: [...p.welcomeDismissed, which] }
}

/** Whether a mode's welcome line is gone: dismissed, or its home tour finished in that mode. */
export function welcomeDismissed(p: HelpPrefs, which: WelcomeLine): boolean {
  return p.welcomeDismissed.includes(which)
}

/**
 * The prefs with a tour finished in a mode: marked finished, and the mode's home tour
 * (`homeTourOf(mode)`) also ends the welcome line of the mode it was taken in, and no other mode's.
 */
export function withTourDone(p: HelpPrefs, id: string, mode?: Mode): HelpPrefs {
  const done = withCompleted(p, id)
  return mode && id === homeTourOf(mode) ? withDismissed(done, mode) : done
}

/** The prefs with a tour marked finished (the same object when it already was). */
export function withCompleted(p: HelpPrefs, id: string): HelpPrefs {
  return p.completed.includes(id) ? p : { ...p, completed: [...p.completed, id] }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
  window.addEventListener('storage', (e) => {
    if (e.key === HELP_STORAGE_KEY || e.key === null) useHelp.getState().reloadPrefs()
  })

/** Imperative helpers for event handlers. */
export const openHelp = (articleId?: string | null, notice?: string | null): void =>
  useHelp.getState().openHelp(articleId, notice)
export const closeHelp = (): void => useHelp.getState().closeHelp()
export const startTour = (id: string): void => useHelp.getState().startTour(id)
