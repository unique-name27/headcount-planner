/**
 * Every key Headcount Planner keeps in this browser (docs/PLAN.md 5.4): where it lives and what it
 * holds. src/ship/storageKeys.test.ts scans the source for `hcp:` literals and fails when one is
 * neither listed here nor named in NOT_STORAGE_NAMES (a User Timing measure, the Web Lock, the
 * prefix itself). A new key goes here in the same change that first writes it.
 *
 * IndexedDB keys live in the app's own database (`createStore('headcount-planner', 'kv')`, opened
 * only by src/data/idb.ts). Nothing is kept in sessionStorage. The pay switch ("Show pay amounts")
 * is memory only and never stored. The sample is regenerated on every load and never stored; plan
 * state made on it is kept at `hcp:plan` as an overlay against the sample's baseline. Pure.
 */

export type StorageArea = 'localStorage' | 'sessionStorage' | 'IndexedDB'

export interface StorageKeyDef {
  /** The key, or its prefix when `prefix` is true ("hcp:dataset:" for "hcp:dataset:positions"). */
  key: string
  prefix?: boolean
  where: readonly StorageArea[]
  /** What it holds, one plain phrase. */
  holds: string
  /** In the settings file (Settings > This device > Save settings to a file). */
  inSettingsFile?: boolean
}

export const STORAGE_KEYS: readonly StorageKeyDef[] = [
  // IndexedDB (src/data/idb.ts)
  {
    key: 'hcp:dataset:',
    prefix: true,
    where: ['IndexedDB'],
    holds: 'An imported dataset: its rows, source, version, tier and mapping (hcp:dataset:<dataset>)',
  },
  {
    key: 'hcp:versions:',
    prefix: true,
    where: ['IndexedDB'],
    holds: 'A dataset’s version records, the last 3 (hcp:versions:<dataset>)',
  },
  {
    key: 'hcp:raw:',
    prefix: true,
    where: ['IndexedDB'],
    holds: 'The original sheet of a dataset version and its import log (hcp:raw:<dataset>:<versionId>)',
  },
  {
    key: 'hcp:profile:',
    prefix: true,
    where: ['IndexedDB'],
    holds: 'Saved column choices for a file layout (hcp:profile:<dataset>:<fingerprint>)',
  },
  {
    key: 'hcp:plan',
    where: ['IndexedDB'],
    holds:
      'Plan state: versions and their locked lines, month closes, Working edits, requests, cycles, trades and comments (on the sample, an overlay against its baseline)',
  },
  {
    key: 'hcp:plan-aside:',
    prefix: true,
    where: ['IndexedDB'],
    holds:
      'Plan state and its audit log made on an earlier build of the sample, one key per earlier sample, set aside when the sample changed, to save as a Full file',
  },
  {
    key: 'hcp:audit:',
    prefix: true,
    where: ['IndexedDB'],
    holds: 'The audit log in chunks of 500 entries, each entry chained to the one before by its hash',
  },
  // localStorage
  {
    key: 'hcp:settings',
    where: ['localStorage'],
    holds: 'Settings: display, data standard and the other Settings choices',
    inSettingsFile: true,
  },
  { key: 'hcp:filters', where: ['localStorage'], holds: 'The filters last used, restored on the next visit' },
  { key: 'hcp:views', where: ['localStorage'], holds: 'Saved views and the one set to open first' },
  {
    key: 'hcp:lists',
    where: ['localStorage'],
    holds: 'Official lists, such as each location’s region and the Director+ marks',
    inSettingsFile: true,
  },
  {
    key: 'hcp:metrics',
    where: ['localStorage'],
    holds:
      'Your metric definition changes and their change log: wording and settings such as the waiting days',
    inSettingsFile: true,
  },
  {
    key: 'hcp:mode',
    where: ['localStorage'],
    holds: 'The mode (one of five) and the Acting as pick each mode remembers',
  },
  { key: 'hcp:help', where: ['localStorage'], holds: 'Help: welcome card dismissed, tours finished' },
  {
    key: 'hcp:actions',
    where: ['localStorage'],
    holds: 'Action center marks (handled or snoozed, with each item’s fingerprint)',
  },
]

/**
 * `hcp:` names in the source that are not storage keys. The source scan accepts these.
 */
export const NOT_STORAGE_NAMES: readonly { name: string; what: string }[] = [
  { name: 'hcp:', what: 'The prefix every key starts with' },
  { name: 'hcp:writer', what: 'The Web Lock held by the one tab that may write (src/data/tabSync.ts)' },
  { name: 'hcp:context', what: 'User Timing: the analytics context' },
  { name: 'hcp:quality', what: 'User Timing: the quality index' },
  { name: 'hcp:headline', what: 'User Timing: folder-tab headlines (hcp:headline:<view>)' },
  { name: 'hcp:home', what: 'User Timing: each role home (hcp:home:<home>)' },
  { name: 'hcp:actions', what: 'User Timing: Action center items (also a storage key)' },
  { name: 'hcp:drill', what: 'User Timing: drill tables and calculation cards (hcp:drill:<kind>)' },
  { name: 'hcp:export', what: 'User Timing: whole-view exports (hcp:export:<view>)' },
]

/** The definition that describes a key, or null for a key the app does not know. */
export function describeKey(key: string): StorageKeyDef | null {
  const exact = STORAGE_KEYS.find((d) => !d.prefix && d.key === key)
  if (exact) return exact
  // The longest matching prefix wins.
  const prefixed = STORAGE_KEYS.filter((d) => d.prefix && key.startsWith(d.key)).sort(
    (a, b) => b.key.length - a.key.length,
  )
  return prefixed[0] ?? null
}

/**
 * Whether a name written in the source is accounted for: it, or the family it starts with, is a
 * listed key or a listed non-storage name ("hcp:dataset:" is the IndexedDB prefix, "hcp:headline:plan"
 * one of the "hcp:headline" measures).
 */
export function isKnownName(name: string): boolean {
  const exactly = (n: string) =>
    !!describeKey(n) || NOT_STORAGE_NAMES.some((x) => x.name === n) || STORAGE_KEYS.some((d) => d.key === n)
  const parts = name.split(':')
  for (let i = parts.length; i >= 2; i--) {
    const head = parts.slice(0, i).join(':')
    if (exactly(head) || exactly(`${head}:`)) return true
  }
  return false
}
