/**
 * Settings: one home for every preference. Pure types, defaults, validation, persistence and the
 * settings file format. The store (src/data/store.ts) holds the live values and the actions; this
 * module never imports it.
 *
 * Everything persists in this browser under `hcp:settings`, except "Show pay amounts", which lasts
 * for the session only and is never written anywhere (it lives in the store, not here). The metric
 * dictionary (`hcp:metrics`), official lists (`hcp:lists`) and saved views (`hcp:views`) keep their
 * own keys and travel in the settings file as sections, which their owners write and read.
 */
import { APP_NAME, FILE_PREFIX } from '@/app/brand'
import { todayISO } from '@/lib/dates'
import { type DataStandard, DEFAULT_STANDARD, isDataStandard } from './quality/tier'
import type { ViewsFileSection } from './savedViews'
import type { ISODate } from './schema'

export type ThemePref = 'system' | 'light' | 'dark'
export type TextSize = 'sm' | 'md' | 'lg' | 'xl'
export type MotionPref = 'system' | 'reduce'

export const TEXT_SIZES: readonly TextSize[] = ['sm', 'md', 'lg', 'xl']
export const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  sm: 'Small',
  md: 'Standard',
  lg: 'Large',
  xl: 'Extra large',
}
/** Root font scale for each text size (the whole app is sized in rem from 14 px body). */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { sm: 0.9286, md: 1, lg: 1.1429, xl: 1.2857 }
export const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' }
export const MOTION_LABEL: Record<MotionPref, string> = { system: 'Follow system', reduce: 'Reduce motion' }

/* ───────────── all settings ───────────── */

export interface Settings {
  theme: ThemePref
  textSize: TextSize
  motion: MotionPref
  dataStandard: DataStandard
  /**
   * The as-of date override; null uses the latest date in the data (the sample's own date on the
   * sample). Set by HR admin only (`settings:data`, docs/PLAN.md 8.3).
   */
  asOfOverride: ISODate | null
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  textSize: 'md',
  motion: 'system',
  dataStandard: DEFAULT_STANDARD,
  asOfOverride: null,
}

/** The Settings sheet's sections, in order. */
export type SettingsSection = 'mode' | 'display' | 'data' | 'formulas' | 'lists' | 'privacy' | 'device'
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'mode',
  'display',
  'data',
  'formulas',
  'lists',
  'privacy',
  'device',
]
export const SECTION_LABEL: Record<SettingsSection, string> = {
  mode: 'Mode',
  display: 'Display',
  data: 'Data',
  formulas: 'Formulas',
  lists: 'Official lists',
  privacy: 'Privacy',
  device: 'This device',
}

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark']
const MOTIONS: readonly MotionPref[] = ['system', 'reduce']

/** Earliest as-of date accepted, so a year typed digit by digit (0002, 0020 …) is never applied. */
export const EARLIEST_REPORTING_DATE: ISODate = '1990-01-01'

/** A real calendar date in `YYYY-MM-DD` form (30 Feb is refused). */
function isIsoDate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** An as-of date the Settings sheet would accept: a real date from 1 Jan 1990 to today. */
export function isReportingDate(v: unknown, today: ISODate = todayISO()): v is ISODate {
  return isIsoDate(v) && v >= EARLIEST_REPORTING_DATE && v <= today
}

/** Settings from untrusted input; every invalid field falls back to its default. */
export function sanitizeSettings(raw: unknown, today: ISODate = todayISO()): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    theme: THEMES.includes(r.theme as ThemePref) ? (r.theme as ThemePref) : DEFAULT_SETTINGS.theme,
    textSize: TEXT_SIZES.includes(r.textSize as TextSize)
      ? (r.textSize as TextSize)
      : DEFAULT_SETTINGS.textSize,
    motion: MOTIONS.includes(r.motion as MotionPref) ? (r.motion as MotionPref) : DEFAULT_SETTINGS.motion,
    dataStandard: isDataStandard(r.dataStandard) ? r.dataStandard : DEFAULT_SETTINGS.dataStandard,
    asOfOverride: isReportingDate(r.asOfOverride, today) ? r.asOfOverride : null,
  }
}

/* ───────────── persistence ───────────── */

export const SETTINGS_KEY = 'hcp:settings'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const storageOrNull = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The saved settings, or the defaults (storage blocked, nothing saved, or not readable). */
export function loadSettings(storage: StorageLike | null = storageOrNull()): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS }
  try {
    const v = storage.getItem(SETTINGS_KEY)
    if (v == null) return { ...DEFAULT_SETTINGS }
    return sanitizeSettings(JSON.parse(v))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Save every setting (never "Show pay amounts", which is not a setting). */
export function saveSettings(s: Settings, storage: StorageLike | null = storageOrNull()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(pickSettings(s)))
  } catch {
    /* storage unavailable: settings apply for this session only */
  }
}

/** The settings a store holds, picked out of its state. */
export const pickSettings = (s: Settings): Settings => ({
  theme: s.theme,
  textSize: s.textSize,
  motion: s.motion,
  dataStandard: s.dataStandard,
  asOfOverride: s.asOfOverride,
})

/* ───────────── settings file ───────────── */

export const SETTINGS_FILE_KIND = 'hcp-settings'
export const SETTINGS_FILE_VERSION = 1

export interface SettingsFile {
  kind: typeof SETTINGS_FILE_KIND
  version: number
  exportedAt: string
  settings: Settings
  /** The metric dictionary: your wording and settings, with the change log (src/metrics writes and reads it). */
  metrics?: unknown
  /** The official lists you saved (src/data/lists writes and reads it). */
  lists?: unknown
  /** Your saved views (the Views menu in the filter row). */
  views?: ViewsFileSection
}

/** "headcount-planner-settings-2026-10-04.json", like every other export's name. */
export const settingsFileName = (today: ISODate): string => `${FILE_PREFIX}-settings-${today}.json`

/** The sections a settings file can carry besides the settings. */
export interface SettingsFileSections {
  metrics?: unknown
  lists?: unknown
  views?: ViewsFileSection
}

/** The settings file as an object. Pay amounts are never in it. */
export function settingsFile(s: Settings, now: Date, sections: SettingsFileSections = {}): SettingsFile {
  return {
    kind: SETTINGS_FILE_KIND,
    version: SETTINGS_FILE_VERSION,
    exportedAt: now.toISOString(),
    settings: pickSettings(s),
    ...(sections.metrics ? { metrics: sections.metrics } : {}),
    ...(sections.lists ? { lists: sections.lists } : {}),
    ...(sections.views ? { views: sections.views } : {}),
  }
}

/** The settings (and the sections given) as a downloadable JSON file. */
export function settingsBlob(s: Settings, now = new Date(), sections: SettingsFileSections = {}): Blob {
  return new Blob([JSON.stringify(settingsFile(s, now, sections), null, 2)], { type: 'application/json' })
}

export type ImportSettingsResult =
  | {
      ok: true
      settings: Settings
      /** Settings the file held that were valid. */
      applied: (keyof Settings)[]
      /** The file's metric dictionary section, for the metrics store to apply. */
      metricsSection?: unknown
      /** The file's official lists section, for the lists store to apply. */
      listsSection?: unknown
      /** The file's saved views, for the views store to merge (`useSavedViews().importSection`). */
      viewsSection?: unknown
    }
  | { ok: false; error: string }

const NOT_SETTINGS = `The file is not a ${APP_NAME} settings file.`

/**
 * Read a settings file (its text or parsed JSON). Fields that are missing or invalid keep their
 * current values; the sections are handed back for their owners to apply. A file that is not a
 * settings file, or comes from a newer version, is refused.
 */
export function parseSettingsFile(
  input: unknown,
  current: Settings,
  today: ISODate = todayISO(),
): ImportSettingsResult {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      return { ok: false, error: 'The file is not valid JSON.' }
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: NOT_SETTINGS }
  const d = data as Partial<Record<keyof SettingsFile, unknown>>
  if (d.kind !== SETTINGS_FILE_KIND || !d.settings || typeof d.settings !== 'object')
    return { ok: false, error: NOT_SETTINGS }
  if (typeof d.version !== 'number' || d.version > SETTINGS_FILE_VERSION)
    return { ok: false, error: `The file comes from a newer version of ${APP_NAME}.` }
  const raw = d.settings as Record<string, unknown>
  const clean = sanitizeSettings(raw, today)
  const next: Settings = pickSettings(current)
  const applied: (keyof Settings)[] = []
  const take = <K extends keyof Settings>(k: K, valid: boolean) => {
    if (!Object.hasOwn(raw, k) || !valid) return
    next[k] = clean[k]
    applied.push(k)
  }
  take('theme', clean.theme === raw.theme)
  take('textSize', clean.textSize === raw.textSize)
  take('motion', clean.motion === raw.motion)
  take('dataStandard', clean.dataStandard === raw.dataStandard)
  take('asOfOverride', raw.asOfOverride === null || clean.asOfOverride === raw.asOfOverride)
  const section = (v: unknown) => (v && typeof v === 'object' ? v : undefined)
  const metricsSection = section(d.metrics)
  const listsSection = section(d.lists)
  const viewsSection = section(d.views)
  if (!applied.length && !metricsSection && !listsSection && !viewsSection)
    return { ok: false, error: `The file holds no settings ${APP_NAME} can use.` }
  return {
    ok: true,
    settings: next,
    applied,
    ...(metricsSection ? { metricsSection } : {}),
    ...(listsSection ? { listsSection } : {}),
    ...(viewsSection ? { viewsSection } : {}),
  }
}
