/**
 * App state (Zustand): every dataset with a version record each (mapping, import counts,
 * certification) and the last three before it, where each came from, the settings, the global
 * filters with the version and comparison pickers, the route, and whether this tab may write.
 *
 * Persistence never leaves the browser (docs/PLAN.md 5.4) and goes through src/data/idb.ts only:
 * uploaded rows at `hcp:dataset:<k>`, version records at `hcp:versions:<k>` and original sheets at
 * `hcp:raw:<k>:<versionId>` in IndexedDB (src/data/quality/storage.ts), settings at `hcp:settings`
 * (src/data/settings.ts) and the filters last used at `hcp:filters` in localStorage. The sample is
 * regenerated on every load and never stored: the shell registers it (`setSampleSource`, and the
 * messy raw extracts with `setSampleSeed`). Start-up races IndexedDB against 1,500 ms and runs on
 * the sample with `storageUnavailable` (STORAGE_UNAVAILABLE_NOTICE) when storage loses or refuses.
 * "Show pay amounts" is memory only.
 *
 * One tab writes (src/data/tabSync.ts): `readOnly` is true in a reader tab, where every dataset
 * write (`replaceDataset`, `resetDataset`, `resetAllToSample`, `confirmMapping`, `certify`,
 * `revokeCertification`, `clearDevice`) rejects with READ_ONLY_NOTE. It follows the lock both ways
 * (`onWriterChange`): false when a reader is promoted, and true again when a heartbeat writer steps
 * aside for the back-forward cache or loses a tie to a lower tab id. After a write the writer posts
 * `{ kind: 'datasets' }` and readers re-read IndexedDB. Settings, filters and saved views are this
 * browser's preferences, kept in step by the storage event, and work in every tab.
 *
 * Nothing here decides what a mode may see: modes register guards (`setFilterGuard`,
 * `setRouteGuard`, `setStandardGuard`) and the analytics context applies scopes.
 */
import { create } from 'zustand'
import { todayISO } from '@/lib/dates'
import { READ_ONLY_NOTE } from '@/plan/store/types'
import { type AddressIntent, hintAddress, isHistoryMark } from './address'
import { idbDel, idbGet, idbSet } from './idb'
import type { ApplyOptions, ImportIssue, Mapping, ParsedSheet } from './import/types'
import {
  buildSampleState,
  mergeStoredSample,
  type SampleSeed,
  type SampleSeedLoader,
  sampleVersion,
} from './quality/seed'
import {
  clearDeviceStorage,
  DATASET_KEY,
  deleteRaw,
  loadRaw,
  loadVersions,
  rememberRaw,
  type StoredVersions,
  saveRaw,
  saveVersions,
} from './quality/storage'
import type { DataStandard } from './quality/tier'
import type { DatasetVersion, RawRecord, VersionMapping } from './quality/types'
import {
  type CertifyInput,
  confirmVersion,
  droppedVersions,
  makeCertification,
  makeVersion,
  newVersionId,
  pushHistory,
  sampleVersionId,
} from './quality/versions'
import { loadViews, VIEWS_KEY, viewsFileSection } from './savedViews'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  emptyDatasets,
  type ISODate,
  isRouteView,
  PAGE_KEYS,
  type RouteView,
  VIEW_KEYS,
  withAllDatasets,
} from './schema'
import { DEFAULT_FILTERS, type Filters, normalizeFilters, resolveAsOf } from './scope'
import {
  type ImportSettingsResult,
  loadSettings,
  type MotionPref,
  parseSettingsFile,
  pickSettings,
  SETTINGS_KEY,
  type Settings,
  saveSettings,
  settingsBlob,
  type TextSize,
  type ThemePref,
} from './settings'
import {
  acquireWriter,
  listenToTabs,
  onWriterChange,
  postToTabs,
  type TabMessage,
  type WriterRole,
} from './tabSync'
import { isPickId, readScope, splitHash, type UrlScope } from './urlScope'
import { useSavedViews } from './viewsStore'

export type { SampleSeed, SampleSeedEntry, SampleSeedLoader } from './quality/seed'
export type { RouteView } from './schema'
export type { ThemePref } from './settings'
export { READ_ONLY_NOTE }

/* ───────────── routes ───────────── */

/** A folder tab or a masthead page, and its tab ('' for the default). */
export interface Route {
  view: RouteView
  tab: string
}
/** Every route, folder tabs first (docs/PLAN.md 9.1). */
export const ROUTE_VIEWS: readonly RouteView[] = [...VIEW_KEYS, ...PAGE_KEYS]
/** Pages reached from the masthead rather than a folder tab. */
export const PAGE_VIEWS: readonly RouteView[] = PAGE_KEYS
/** The page the app opens on when no mode says otherwise: the default mode's (HR admin's Data room). */
export const HOME_VIEW: RouteView = 'data'

/**
 * The route an address names (`#view.tab`), or null. The scope after a `?` is left for `readScope`
 * (src/data/urlScope.ts). The tab is everything after the first ".", so a sub-address that holds
 * one survives a reload.
 */
export function parseHash(hash: string): Route | null {
  const route = splitHash(hash).route
  const dot = route.indexOf('.')
  const view = dot < 0 ? route : route.slice(0, dot)
  if (!isRouteView(view)) return null
  return { view, tab: dot < 0 ? '' : route.slice(dot + 1) }
}

/* ───────────── guards the modes register ───────────── */

/** The filters to keep instead of `next` (a mode's scope lock); the same object when they are fine. */
export type FilterGuard = (next: Filters) => Filters
/** Where a route goes in the current mode, and what to say when it moved. */
export interface RouteGuard {
  check: (route: Route) => { route: Route; notice?: () => void } | null
  /** The mode's home page. */
  home: () => RouteView
}
/** The data standard to show when a link or saved view names one. */
export type StandardGuard = (asked: DataStandard) => DataStandard

let filterGuard: FilterGuard | null = null
let routeGuard: RouteGuard | null = null
let standardGuard: StandardGuard | null = null

/** Every filter change (the row, links, Back, saved views, Filter to) goes through this. */
export function setFilterGuard(fn: FilterGuard | null): void {
  filterGuard = fn
}
/** Every route change (`navigate`, so the address too) goes through this. */
export function setRouteGuard(g: RouteGuard | null): void {
  routeGuard = g
}
export function setStandardGuard(fn: StandardGuard | null): void {
  standardGuard = fn
}
/** The filters as the guard keeps them (unchanged without one). */
export const guardFilters = (f: Filters): Filters => (filterGuard ? filterGuard(f) : f)
/** The page the app opens on: the mode's home, the Data room when no mode is connected. */
export const homeView = (): RouteView => routeGuard?.home() ?? HOME_VIEW

/* ───────────── sources ───────────── */

export interface SourceMeta {
  kind: 'sample' | 'upload'
  rowCount: number
  fileName?: string
  sheetName?: string
  importedAt?: string
  /** Rows that imported with a warning (defaulted or unparsed values). */
  warnings?: number
  /** Header fingerprint of the mapping profile used, so the Data room can offer to edit it. */
  profileFingerprint?: string
}

/** What an upload knows beyond its rows: the sheet it came from, the mapping and the import log. */
export interface ReplaceExtra {
  /** The original sheet, kept per version so it can be re-mapped without uploading again. */
  raw?: ParsedSheet | null
  mapping?: Mapping | VersionMapping | null
  options?: ApplyOptions | null
  issues?: readonly ImportIssue[]
  /** Rows in the file, including skipped ones (the importer's `stats.rowsIn`). */
  rowsIn?: number
}

/** Every dataset is the sample (none uploaded). */
export const onSample = (sources: Record<DatasetKey, SourceMeta>): boolean =>
  Object.values(sources).every((s) => s.kind === 'sample')

/* ───────────── the sample ───────────── */

/**
 * The generated sample: its datasets (built on demand, the same every time) and its own as-of date
 * (30 Sep 2026). The shell registers it, so this module never imports the generator; without one,
 * every dataset starts empty.
 */
export interface SampleSource {
  data: () => Partial<Datasets>
  asOf: ISODate
}

let sampleSource: SampleSource | null = null
let sampleCache: Datasets | null = null

/** Register the sample (null: none, every dataset starts empty). Takes effect at the next `init`. */
export function setSampleSource(source: SampleSource | null): void {
  sampleSource = source
  sampleCache = null
}

/** The generated sample's datasets, every key present, built once. */
function plain(): Datasets {
  if (!sampleCache) {
    let data: Partial<Datasets> = {}
    try {
      data = sampleSource?.data() ?? {}
    } catch {
      data = {}
    }
    sampleCache = withAllDatasets(data)
  }
  return sampleCache
}

/** The sample's as-of date (certifications in a seed are worked out at it). */
const sampleAsOf = (): ISODate => sampleSource?.asOf ?? todayISO()

let seedLoader: SampleSeedLoader | null = null
let loadedSeed: SampleSeed | null = null

/**
 * Register the messy-sample seed (raw extracts through the importer, src/data/quality/seed.ts).
 * `init` awaits it; a loader that fails leaves the plain sample. Null goes back to the plain sample.
 */
export function setSampleSeed(loader: SampleSeedLoader | null): void {
  seedLoader = loader
  loadedSeed = null
}

async function loadSeed(): Promise<SampleSeed | null> {
  if (loadedSeed || !seedLoader) return loadedSeed
  try {
    loadedSeed = await seedLoader()
  } catch {
    loadedSeed = null
  }
  return loadedSeed
}

/** One dataset's sample rows: the seed's (as imported from its raw extract) or the generated ones. */
const sampleRows = (key: DatasetKey): unknown[] => (loadedSeed?.[key]?.rows ?? plain()[key]) as unknown[]

/** A sample version rebuilt from the seed for these rows; its raw sheet is kept for the session. */
function freshSample(key: DatasetKey, data: Datasets): DatasetVersion {
  const raws: RawRecord[] = []
  const v = sampleVersion(key, data, loadedSeed?.[key] ?? null, sampleAsOf(), raws)
  for (const r of raws) rememberRaw(r)
  return v
}

/**
 * A sample version rebuilt from a later seed keeps the decisions already made on the same version:
 * its confirmation (per field too), its certification, or the revocation of it.
 */
function keepSampleDecisions(fresh: DatasetVersion, current: DatasetVersion | undefined): DatasetVersion {
  if (!current || current.versionId !== fresh.versionId || current.source !== 'sample') return fresh
  const confirmedAll = !!current.mappingConfirmedAt
  const mapping: VersionMapping = {}
  for (const [field, e] of Object.entries(fresh.mapping))
    mapping[field] = { ...e, confirmed: current.mapping[field]?.confirmed ?? confirmedAll }
  return {
    ...fresh,
    mapping,
    mappingConfirmedAt: current.mappingConfirmedAt ?? null,
    mappingConfirmedBy: current.mappingConfirmedBy ?? null,
    certification: current.certification ?? null,
  }
}

/* ───────────── the write lock and start-up ───────────── */

/**
 * How the store takes the write lock; tests inject a role. It resolves this tab's first role, runs
 * `onPromote` when this tab, a reader, becomes the writer, and `onChange` with every later change
 * of role both ways (a promotion, or a heartbeat writer stepping aside or losing a tie).
 */
export type WriterSource = (
  onPromote: () => void,
  onChange: (role: WriterRole) => void,
) => Promise<WriterRole>

/** The default source's subscription to the page's lock: one at a time, replaced by the next `init`. */
let stopFollowing: (() => void) | null = null
const defaultWriter: WriterSource = (onPromote, onChange) => {
  stopFollowing?.()
  stopFollowing = onWriterChange(onChange)
  return acquireWriter({ onPromote })
}
let writerSource: WriterSource = defaultWriter

/** Replace how the store takes the write lock (tests); null puts `acquireWriter` back. */
export function setWriterSource(fn: WriterSource | null): void {
  writerSource = fn ?? defaultWriter
}

/** How long start-up waits for IndexedDB (and the write lock) before it runs on the sample. */
export const STARTUP_TIMEOUT_MS = 1_500

/** What the shell says when storage lost the start-up race. */
export const STORAGE_UNAVAILABLE_NOTICE = {
  title: 'Showing sample data',
  description:
    'This browser did not open its local storage in time, so files added earlier are not loaded. Reload to try again.',
} as const

/** Resolves to the value, or null if it takes longer than ms or fails. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      },
    )
  })
}

/* ───────────── storage helpers ───────────── */

interface SavedDataset {
  rows: unknown[]
  meta: SourceMeta
  versionId?: string
}

function isSavedDataset(v: unknown): v is SavedDataset {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<SavedDataset>
  return Array.isArray(r.rows) && !!r.meta && typeof r.meta === 'object'
}

const LS = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key)
      return v == null ? fallback : (JSON.parse(v) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, v: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* storage unavailable: preferences just won't persist */
    }
  },
}

const perKey = <T>(make: (k: DatasetKey) => T): Record<DatasetKey, T> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, make(k)])) as Record<DatasetKey, T>

const sampleMeta = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  perKey((k) => ({ kind: 'sample', rowCount: data[k].length }))

interface Restored {
  rows: unknown[]
  source: SourceMeta
  version: DatasetVersion
  history: DatasetVersion[]
}

/** One dataset as stored (an upload), else as the sample, with its version records. */
function restoreDataset(
  key: DatasetKey,
  saved: unknown,
  stored: StoredVersions | null,
  sample: { data: Datasets; versions: Record<DatasetKey, DatasetVersion> },
): Restored {
  const history = stored?.history ?? []
  if (isSavedDataset(saved)) {
    const rows = saved.rows
    const vid =
      typeof saved.versionId === 'string'
        ? saved.versionId
        : `legacy-${key}-${saved.meta.importedAt ?? 'upload'}`
    const version =
      stored?.current && stored.current.versionId === vid
        ? stored.current
        : makeVersion({
            dataset: key,
            source: 'upload',
            rows: rows as object[],
            versionId: vid,
            fileName: saved.meta.fileName ?? null,
            sheetName: saved.meta.sheetName ?? null,
            importedAt: saved.meta.importedAt ?? null,
          })
    return { rows, source: { ...saved.meta, kind: 'upload', rowCount: rows.length }, version, history }
  }
  const rows = sample.data[key] as unknown[]
  return {
    rows,
    source: { kind: 'sample', rowCount: rows.length },
    version: mergeStoredSample(sample.versions[key], stored?.current ?? null),
    history,
  }
}

/** Read every listed dataset and its versions; rejects when storage refuses. */
const readStored = (keys: readonly DatasetKey[]) =>
  Promise.all([
    Promise.all(keys.map((k) => idbGet<unknown>(DATASET_KEY(k)))),
    Promise.all(keys.map(loadVersions)),
  ])

/* ───────────── the opening scope ───────────── */

/**
 * Where the scope the app opened with came from: the address (`link`, applied exactly; also an
 * entry the app wrote itself, whose address is complete), the saved view marked to open with
 * (`startup`), or your last filters in this browser (`last`). The shell checks a link's values
 * against the data (`checkScope`, `checkPicks`) once the data is loaded.
 */
export interface InitialScope {
  source: 'link' | 'startup' | 'last'
  scope: UrlScope | null
  /** The startup view's id. */
  viewId?: string
  /** The startup view's page, when the address named none. */
  page?: Route
  /** Parts of the link that could not be read. */
  unreadable: string[]
}

export function initialScopeOf(args: {
  hash: string
  historyState: unknown
  views: ReturnType<typeof loadViews>
}): InitialScope {
  const { query } = splitHash(args.hash)
  const read = readScope(query)
  if (read.present || isHistoryMark(args.historyState))
    return { source: 'link', scope: read.scope, unreadable: read.unreadable }
  const start = args.views.views.find((v) => v.id === args.views.startupId)
  if (start) {
    const page =
      !parseHash(args.hash) && start.page && isRouteView(start.page.view)
        ? { view: start.page.view, tab: start.page.tab }
        : undefined
    return {
      source: 'startup',
      scope: {
        filters: start.filters,
        standard: start.standard,
        lens: start.lens,
        version: start.version,
        compare: start.compare,
      },
      viewId: start.id,
      ...(page ? { page } : {}),
      unreadable: [],
    }
  }
  return { source: 'last', scope: null, unreadable: [] }
}

function readInitialScope(): InitialScope {
  try {
    if (typeof location === 'undefined') return { source: 'last', scope: null, unreadable: [] }
    return initialScopeOf({
      hash: location.hash,
      historyState: typeof history === 'undefined' ? null : history.state,
      views: loadViews(isRouteView),
    })
  } catch {
    return { source: 'last', scope: null, unreadable: [] }
  }
}

/** The scope this page load started with (read once, when the store is created). */
export const initialScope: InitialScope = readInitialScope()
/** The page this load opened on came from the address or the startup view (false: the app picked its home). */
export const initialRouteNamed: boolean =
  !!initialScope.page || !!parseHash(typeof location === 'undefined' ? '' : location.hash)
let initialTaken = false
/** The opening scope, once: the shell applies it after the data loads (null after that). */
export function takeInitialScope(): InitialScope | null {
  if (initialTaken) return null
  initialTaken = true
  return initialScope
}

/**
 * The as-of date the analytics context uses: the sample's own date while every dataset is the
 * sample, otherwise the override or the latest date in the data (capped at today).
 */
export function contextAsOf(args: {
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  asOfOverride: ISODate | null
  today?: ISODate
}): ISODate {
  const today = args.today ?? todayISO()
  if (onSample(args.sources) && !args.asOfOverride) return sampleSource?.asOf ?? today
  return resolveAsOf(args.data, today, args.asOfOverride)
}

/* ───────────── the store ───────────── */

/** Other stores that keep something in this browser reset themselves when the device is cleared. */
const clearListeners = new Set<() => void>()
/** Run `fn` after "Clear this device" (the lists and metrics stores reset their state). */
export function onDeviceCleared(fn: () => void): () => void {
  clearListeners.add(fn)
  return () => clearListeners.delete(fn)
}

export type ImportSettingsOutcome = ImportSettingsResult & {
  /** What the saved views in the file did, in a phrase ("2 saved views"). */
  viewsSummary?: string
  /** Why the saved views in the file could not be read; nothing in them was applied. */
  viewsError?: string
}

export interface HcpState extends Settings {
  ready: boolean
  /** Browser storage did not answer (or refused) at start-up; uploads from earlier sessions are not loaded. */
  storageUnavailable: boolean
  /**
   * Another tab writes (the write lock, src/data/tabSync.ts): dataset changes reject here, and the
   * masthead says READ_ONLY_NOTE. Follows the lock both ways: false when that tab closes and this
   * one takes the lock, true again whenever this tab stops writing.
   */
  readOnly: boolean
  /** Loaded datasets as imported (the analytics context scopes them). */
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  /** The current version of each dataset. */
  versions: Record<DatasetKey, DatasetVersion>
  /** Earlier versions per dataset, newest first, at most three. */
  history: Record<DatasetKey, DatasetVersion[]>
  filters: Filters
  /** The version shown (`ver`); null is the fiscal year's Working. Not stored: it belongs to the tab's address. */
  version: string | null
  /** The comparison (`vs`): a locked version's ID or 'target'; null is the mode's default. */
  compare: string | null
  route: Route
  /** Pay amounts are shown and exported (HR admin). In memory only: off on every load, never stored. */
  showPay: boolean

  init: () => Promise<void>
  /**
   * Change the filters. The address follows: by default rapid changes collapse into one history
   * entry; `history: 'push'` makes this change its own entry (applying a saved view, "Filter to").
   */
  setFilters: (patch: Partial<Filters>, opts?: { history?: AddressIntent }) => void
  resetFilters: () => void
  /** Pick the version shown and the comparison (undefined keeps one, null resets it to the default). */
  setPicks: (
    picks: { version?: string | null; compare?: string | null },
    opts?: { history?: AddressIntent },
  ) => void
  /** Show a view and tab; `history: 'push'` adds a history entry, the default replaces the current one. */
  navigate: (view: RouteView, tab?: string, opts?: { scroll?: boolean; history?: AddressIntent }) => void
  setShowPay: (on: boolean) => void

  /* settings */
  setTheme: (t: ThemePref) => void
  setTextSize: (s: TextSize) => void
  setMotion: (m: MotionPref) => void
  /** The data standard control and Settings: show it and save it (other open tabs follow). */
  setDataStandard: (s: DataStandard) => void
  /** Show a data standard in this tab without saving it (a link, Back and Forward, a saved view). */
  setScopeStandard: (s: DataStandard) => void
  setAsOfOverride: (d: ISODate | null) => void
  updateSettings: (patch: Partial<Settings>) => void
  /** The settings as a JSON file, with the sections other stores give (never pay amounts). */
  exportSettings: (sections?: { metrics?: unknown; lists?: unknown }) => Blob
  /**
   * Apply a settings file's text or parsed JSON: settings field by field and saved views merged
   * here; the metrics and lists sections come back for their stores to apply.
   */
  importSettings: (json: unknown) => ImportSettingsOutcome
  /** Delete everything the app stored on this device and start over on the sample with default settings. */
  clearDevice: () => Promise<void>

  /* datasets */
  replaceDataset: <K extends DatasetKey>(
    key: K,
    rows: Datasets[K],
    meta: Omit<SourceMeta, 'kind' | 'rowCount'>,
    extra?: ReplaceExtra,
  ) => Promise<void>
  resetDataset: (key: DatasetKey) => Promise<void>
  resetAllToSample: () => Promise<void>
  /** Apply a sample seed now, to every dataset that is still the sample. */
  applySampleSeed: (seed: SampleSeed) => void
  /** Record that `by` reviewed the column mapping of the current version. */
  confirmMapping: (key: DatasetKey, by: string) => Promise<void>
  /**
   * Certify the current version; control totals get their actual values at the as-of date, and a
   * total without a tolerance takes `defaultTolerance` (the quality rules' setting).
   */
  certify: (key: DatasetKey, input: CertifyInput, opts?: { defaultTolerance?: number }) => Promise<void>
  revokeCertification: (key: DatasetKey) => Promise<void>
  /** The original sheet and import log of a version (the current one by default), loaded on demand. */
  getRaw: (key: DatasetKey, versionId?: string) => Promise<RawRecord | null>
}

/** Your saved data standard; the one on screen can be a link's or a saved view's, in this tab only. */
let savedStandard: DataStandard = loadSettings().dataStandard

/** Your saved data standard, which a page without a scope in its address opens with. */
export const savedDataStandard = (): DataStandard => savedStandard

/** Your last filters in this browser (what a page without a scope in its address opens with). */
export const lastFilters = (): Filters =>
  normalizeFilters({ ...DEFAULT_FILTERS, ...LS.get<Partial<Filters>>('hcp:filters', {}) })

/** Reject a dataset write in a reader tab. */
function assertWriter(readOnly: boolean): void {
  if (readOnly) throw new Error(READ_ONLY_NOTE)
}

let listening = false

export const useStore = create<HcpState>((set, getState) => {
  const initialSettings = loadSettings()
  if (initialScope.scope) initialSettings.dataStandard = initialScope.scope.standard

  /**
   * Apply a settings patch and save every setting. The data standard saved is yours (set by this
   * patch, or as it was), never one a link or saved view shows in this tab only.
   */
  const patchSettings = (patch: Partial<Settings>) => {
    if (patch.dataStandard) savedStandard = patch.dataStandard
    set(patch)
    saveSettings({ ...pickSettings(getState()), dataStandard: savedStandard })
  }

  /** Move a dataset to a new current version, keeping the old one in its history. */
  const advance = (key: DatasetKey, next: DatasetVersion, s: Pick<HcpState, 'versions' | 'history'>) => {
    const prev = s.versions[key] ?? null
    const before = s.history[key] ?? []
    const after = pushHistory(before, prev && prev.versionId !== next.versionId ? prev : null)
    const dropped = droppedVersions(prev ? [prev, ...before] : before, after, next)
    return {
      versions: { ...s.versions, [key]: next },
      history: { ...s.history, [key]: after },
      dropped,
    }
  }

  const persistVersions = (key: DatasetKey) => {
    const s = getState()
    return saveVersions(key, { current: s.versions[key], history: s.history[key] })
  }

  /** Re-read datasets from IndexedDB (another tab wrote them, or this tab became the writer). */
  const reloadDatasets = async (keys: readonly DatasetKey[]) => {
    const read = await withTimeout(readStored(keys), STARTUP_TIMEOUT_MS)
    if (!read) return
    const data = { ...getState().data } as Record<DatasetKey, unknown[]>
    const versions = {} as Record<DatasetKey, DatasetVersion>
    for (const k of keys) {
      data[k] = sampleRows(k)
      versions[k] = freshSample(k, data as unknown as Datasets)
    }
    const sample = { data: data as unknown as Datasets, versions }
    const out = keys.map((k, i) => restoreDataset(k, read[0][i], read[1][i], sample))
    set((s) => {
      const next = {
        data: { ...s.data } as Record<DatasetKey, unknown[]>,
        sources: { ...s.sources },
        versions: { ...s.versions },
        history: { ...s.history },
      }
      keys.forEach((k, i) => {
        next.data[k] = out[i].rows
        next.sources[k] = out[i].source
        next.versions[k] = out[i].version
        next.history[k] = out[i].history
      })
      return { ...next, data: next.data as unknown as Datasets }
    })
  }

  const onTabMessage = (m: TabMessage) => {
    if (m.kind === 'cleared') {
      if (typeof location !== 'undefined') location.reload()
    } else if (m.kind === 'datasets') void reloadDatasets(m.keys)
  }

  const empty = emptyDatasets()
  /** Counts `init` runs: only the latest run's lock callbacks change `readOnly`. */
  let runs = 0

  return {
    ...initialSettings,
    ready: false,
    storageUnavailable: false,
    readOnly: false,
    data: empty,
    sources: sampleMeta(empty),
    versions: perKey((k) =>
      makeVersion({ dataset: k, source: 'sample', rows: [], versionId: sampleVersionId(k) }),
    ),
    history: perKey(() => []),
    filters: initialScope.scope ? normalizeFilters(initialScope.scope.filters) : lastFilters(),
    version: initialScope.scope?.version ?? null,
    compare: initialScope.scope?.compare ?? null,
    route: initialScope.page ??
      parseHash(typeof location === 'undefined' ? '' : location.hash) ?? {
        view: HOME_VIEW,
        tab: '',
      },
    showPay: false,

    async init() {
      // Another tab's settings, datasets or "clear everything" reach this one as they happen.
      if (!listening) {
        listening = true
        listenToTabs(SETTINGS_KEY, {
          settings: () => {
            const next = loadSettings()
            // The standard on screen is this tab's scope: it follows only when your saved one changed.
            const follow = next.dataStandard !== savedStandard
            savedStandard = next.dataStandard
            if (follow) hintAddress('replace')
            set(follow ? next : { ...next, dataStandard: getState().dataStandard })
          },
          message: onTabMessage,
        })
      }
      const run = ++runs
      const latest = () => run === runs
      /** This tab's role as this run knows it: the lock's answer, then every change after it. */
      let role: WriterRole | null = null
      const lock = writerSource(
        () => {
          if (!latest()) return
          role = 'writer'
          set({ readOnly: false })
          // Readers re-read on every message; a promotion is the moment to be sure.
          void reloadDatasets(DATASET_KEYS)
        },
        (next) => {
          if (!latest()) return
          // Both ways: a promotion, or a heartbeat writer that stepped aside or lost a tie to a lower
          // tab id, which writes nothing until it is promoted again.
          role = next
          set({ readOnly: next !== 'writer' })
        },
      )
      const answered = lock.then((first) => {
        role ??= first
        return role
      })
      const seed = await loadSeed()
      const base = buildSampleState(plain(), seed, sampleAsOf())
      for (const r of base.raws) rememberRaw(r)
      // Storage can be unavailable (a private window) or stall (another tab holds an upgrade open).
      // Never let that keep the app on its loading screen: give it a moment, then run on the sample.
      const [saved, known] = await Promise.all([
        withTimeout(readStored(DATASET_KEYS), STARTUP_TIMEOUT_MS),
        withTimeout(answered, STARTUP_TIMEOUT_MS),
      ])
      // A lock that has not answered yet: read only until it does.
      if (known === null)
        void answered.then(
          (r) => {
            if (latest()) set({ readOnly: r !== 'writer' })
          },
          () => undefined,
        )
      const data = {} as Record<DatasetKey, unknown[]>
      const sources = {} as Record<DatasetKey, SourceMeta>
      const versions = {} as Record<DatasetKey, DatasetVersion>
      const history = {} as Record<DatasetKey, DatasetVersion[]>
      DATASET_KEYS.forEach((k, i) => {
        const r = restoreDataset(k, saved?.[0][i], saved?.[1][i] ?? null, base)
        data[k] = r.rows
        sources[k] = r.source
        versions[k] = r.version
        history[k] = r.history
      })
      set({
        data: data as unknown as Datasets,
        sources,
        versions,
        history,
        ready: true,
        storageUnavailable: !saved,
        readOnly: role !== 'writer',
      })
    },

    setFilters(patch, opts = {}) {
      const filters = guardFilters(normalizeFilters({ ...getState().filters, ...patch }))
      LS.set('hcp:filters', filters)
      if (opts.history) hintAddress(opts.history)
      set({ filters })
    },
    resetFilters() {
      const filters = guardFilters({ ...DEFAULT_FILTERS, modes: {} })
      LS.set('hcp:filters', filters)
      set({ filters })
    },
    setPicks(picks, opts = {}) {
      const clean = (v: string | null | undefined, cur: string | null) =>
        v === undefined ? cur : isPickId(v) ? v : null
      const s = getState()
      const version = clean(picks.version, s.version)
      const compare = clean(picks.compare, s.compare)
      if (version === s.version && compare === s.compare) return
      if (opts.history) hintAddress(opts.history)
      set({ version, compare })
    },
    navigate(view, tab = '', opts = {}) {
      // A route the mode hides opens the mode's home (or the view's first shown tab) instead, so
      // the address never holds it and Back never returns to it.
      const checked = routeGuard?.check({ view, tab }) ?? null
      const route = checked?.route ?? { view, tab }
      const moved = route.view !== view || route.tab !== tab
      hintAddress(opts.history ?? 'replace')
      set({ route })
      if (opts.scroll !== false && typeof window !== 'undefined') window.scrollTo?.({ top: 0 })
      if (moved) checked?.notice?.()
    },
    setShowPay(on) {
      set({ showPay: on })
    },

    /* ───────────── settings ───────────── */

    setTheme: (theme) => patchSettings({ theme }),
    setTextSize: (textSize) => patchSettings({ textSize }),
    setMotion: (motion) => patchSettings({ motion }),
    setDataStandard: (dataStandard) => patchSettings({ dataStandard }),
    setScopeStandard(asked) {
      const dataStandard = standardGuard ? standardGuard(asked) : asked
      if (getState().dataStandard !== dataStandard) set({ dataStandard })
    },
    setAsOfOverride: (asOfOverride) => patchSettings({ asOfOverride }),
    updateSettings(patch) {
      // The standard on screen may be this tab's scope only: it is saved when the patch sets it.
      const { dataStandard: _shown, ...cur } = pickSettings(getState())
      patchSettings({ ...cur, ...patch })
    },
    exportSettings: (sections = {}) =>
      settingsBlob({ ...pickSettings(getState()), dataStandard: savedStandard }, new Date(), {
        ...sections,
        // Saved views as stored (`hcp:views`); none until one is saved.
        ...(LS.get<unknown>(VIEWS_KEY, null) == null
          ? {}
          : { views: viewsFileSection(loadViews(isRouteView)) }),
      }),
    importSettings(json) {
      const r = parseSettingsFile(json, { ...pickSettings(getState()), dataStandard: savedStandard })
      if (!r.ok) return r
      patchSettings(r.settings)
      if (r.viewsSection === undefined) return r
      const v = useSavedViews.getState().importSection(r.viewsSection)
      return v.ok ? { ...r, viewsSummary: v.summary } : { ...r, viewsError: v.error }
    },
    async clearDevice() {
      assertWriter(getState().readOnly)
      const failed = await clearDeviceStorage()
      const settings = loadSettings(null)
      savedStandard = settings.dataStandard
      useSavedViews.getState().reset()
      const base = buildSampleState(plain(), loadedSeed, sampleAsOf())
      for (const r of base.raws) rememberRaw(r)
      set({
        ...settings,
        data: base.data,
        sources: sampleMeta(base.data),
        versions: base.versions,
        history: perKey(() => []),
        filters: { ...DEFAULT_FILTERS, modes: {} },
        version: null,
        compare: null,
        showPay: false,
        storageUnavailable: false,
      })
      for (const fn of clearListeners) {
        try {
          fn()
        } catch {
          /* one store's reset never stops the others */
        }
      }
      // Other open tabs start over too, so their next save doesn't bring anything back.
      postToTabs({ kind: 'cleared' })
      if (failed.length) throw new Error(`Could not remove ${failed.join(', ')} from this browser.`)
    },

    /* ───────────── datasets ───────────── */

    async replaceDataset(key, rows, meta, extra) {
      assertWriter(getState().readOnly)
      const now = Date.now()
      const full: SourceMeta = {
        ...meta,
        kind: 'upload',
        rowCount: rows.length,
        importedAt: meta.importedAt ?? new Date(now).toISOString(),
      }
      const versionId = newVersionId(key, now)
      const version = makeVersion({
        dataset: key,
        source: 'upload',
        rows: rows as readonly object[],
        versionId,
        fileName: meta.fileName ?? null,
        sheetName: meta.sheetName ?? null,
        importedAt: full.importedAt,
        mapping: extra?.mapping ?? null,
        applyOptions: extra?.options ?? null,
        issues: extra?.issues,
        rowsIn: extra?.rowsIn,
        hasRaw: !!extra?.raw,
      })
      const next = advance(key, version, getState())
      set((s) => ({
        data: { ...s.data, [key]: rows },
        sources: { ...s.sources, [key]: full },
        versions: next.versions,
        history: next.history,
      }))
      if (extra?.raw) await saveRaw({ dataset: key, versionId, sheet: extra.raw, issues: extra.issues ?? [] })
      for (const id of next.dropped) await deleteRaw(key, id)
      await persistVersions(key)
      try {
        await idbSet(DATASET_KEY(key), { rows, meta: full, versionId } satisfies SavedDataset)
      } catch {
        /* not persisted; still applied for this session */
      }
      postToTabs({ kind: 'datasets', keys: [key] })
    },
    async resetDataset(key) {
      assertWriter(getState().readOnly)
      const data = { ...getState().data, [key]: sampleRows(key) } as Datasets
      const next = advance(key, freshSample(key, data), getState())
      set((s) => ({
        data: { ...s.data, [key]: data[key] },
        sources: { ...s.sources, [key]: { kind: 'sample', rowCount: data[key].length } },
        versions: next.versions,
        history: next.history,
      }))
      for (const id of next.dropped) await deleteRaw(key, id)
      await persistVersions(key)
      try {
        await idbDel(DATASET_KEY(key))
      } catch {
        /* nothing stored */
      }
      postToTabs({ kind: 'datasets', keys: [key] })
    },
    async resetAllToSample() {
      assertWriter(getState().readOnly)
      for (const k of DATASET_KEYS)
        if (getState().sources[k].kind !== 'sample') await getState().resetDataset(k)
      patchSettings({ asOfOverride: null })
    },
    applySampleSeed(seed) {
      loadedSeed = seed
      const s = getState()
      const onSampleKeys = DATASET_KEYS.filter((k) => s.sources[k].kind === 'sample')
      const base = buildSampleState(plain(), seed, sampleAsOf())
      for (const r of base.raws) rememberRaw(r)
      const data = { ...s.data } as Record<DatasetKey, unknown[]>
      const versions = { ...s.versions }
      const sources = { ...s.sources }
      for (const k of onSampleKeys) {
        data[k] = base.data[k] as unknown[]
        versions[k] = keepSampleDecisions(base.versions[k], s.versions[k])
        sources[k] = { kind: 'sample', rowCount: data[k].length }
      }
      // A seed that keeps the rows (only the versions gain their sheets and logs) leaves the data as is.
      const sameRows = onSampleKeys.every((k) => data[k] === (s.data[k] as unknown[]))
      set({ ...(sameRows ? {} : { data: data as unknown as Datasets }), versions, sources })
    },
    async confirmMapping(key, by) {
      assertWriter(getState().readOnly)
      const v = getState().versions[key]
      set((s) => ({ versions: { ...s.versions, [key]: confirmVersion(v, by, new Date().toISOString()) } }))
      await persistVersions(key)
      postToTabs({ kind: 'datasets', keys: [key] })
    },
    async certify(key, input, opts = {}) {
      assertWriter(getState().readOnly)
      const s = getState()
      const v = s.versions[key]
      const certification = makeCertification({
        version: v,
        input,
        data: s.data,
        asOf: contextAsOf(s),
        at: new Date().toISOString(),
        ...(opts.defaultTolerance === undefined ? {} : { defaultTolerance: opts.defaultTolerance }),
      })
      set((st) => ({ versions: { ...st.versions, [key]: { ...v, certification } } }))
      await persistVersions(key)
      postToTabs({ kind: 'datasets', keys: [key] })
    },
    async revokeCertification(key) {
      assertWriter(getState().readOnly)
      const v = getState().versions[key]
      if (!v?.certification) return
      set((s) => ({ versions: { ...s.versions, [key]: { ...v, certification: null } } }))
      await persistVersions(key)
      postToTabs({ kind: 'datasets', keys: [key] })
    },
    getRaw(key, versionId) {
      const id = versionId ?? getState().versions[key]?.versionId
      return id ? loadRaw(key, id) : Promise.resolve(null)
    },
  }
})

/* ───────────── standalone helpers for code outside React ───────────── */

export const exportSettings = (sections?: { metrics?: unknown; lists?: unknown }): Blob =>
  useStore.getState().exportSettings(sections)
export const importSettings = (json: unknown): ImportSettingsOutcome =>
  useStore.getState().importSettings(json)
export const clearDevice = (): Promise<void> => useStore.getState().clearDevice()
