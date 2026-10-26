/**
 * IndexedDB persistence for dataset versions and raw sheets, in the app's own store (`@/data/idb`).
 * Nothing leaves the browser.
 *
 *   hcp:dataset:<key>              uploaded rows and source meta (and the version ID)
 *   hcp:versions:<key>             { current, history } version records
 *   hcp:raw:<key>:<versionId>      the original sheet and its import log
 *
 * Raw sheets are also kept in memory for the session, so they work when storage is blocked and
 * for the sample's raw extracts, which are rebuilt on every load and never stored.
 */
import { idbClear, idbDel, idbGet, idbKeys, idbSet } from '@/data/idb'
import type { DatasetKey } from '../schema'
import type { DatasetVersion, RawRecord } from './types'
import { isVersion } from './versions'

export const DATASET_KEY = (k: DatasetKey): string => `hcp:dataset:${k}`
export const VERSIONS_KEY = (k: DatasetKey): string => `hcp:versions:${k}`
export const RAW_KEY = (k: DatasetKey, versionId: string): string => `hcp:raw:${k}:${versionId}`

/** Every key this app keeps in localStorage starts with this (src/app/storageKeys.ts). */
const PREFIX = 'hcp:'

export interface StoredVersions {
  current: DatasetVersion | null
  history: DatasetVersion[]
}

const memRaw = new Map<string, RawRecord>()

/** Keep a raw sheet for this session only (the sample's raw extracts). */
export function rememberRaw(rec: RawRecord): void {
  memRaw.set(RAW_KEY(rec.dataset, rec.versionId), rec)
}

export async function saveRaw(rec: RawRecord): Promise<void> {
  rememberRaw(rec)
  try {
    await idbSet(RAW_KEY(rec.dataset, rec.versionId), rec)
  } catch {
    /* kept in memory for this session */
  }
}

function isRaw(v: unknown): v is RawRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<RawRecord>
  return (
    typeof r.versionId === 'string' &&
    !!r.sheet &&
    Array.isArray(r.sheet.headers) &&
    Array.isArray(r.sheet.rows) &&
    Array.isArray(r.issues)
  )
}

export async function loadRaw(key: DatasetKey, versionId: string): Promise<RawRecord | null> {
  const k = RAW_KEY(key, versionId)
  const mem = memRaw.get(k)
  if (mem) return mem
  try {
    const v = await idbGet<unknown>(k)
    if (isRaw(v)) {
      memRaw.set(k, v)
      return v
    }
  } catch {
    /* storage blocked */
  }
  return null
}

export async function deleteRaw(key: DatasetKey, versionId: string): Promise<void> {
  memRaw.delete(RAW_KEY(key, versionId))
  try {
    await idbDel(RAW_KEY(key, versionId))
  } catch {
    /* nothing stored */
  }
}

export async function saveVersions(key: DatasetKey, stored: StoredVersions): Promise<void> {
  try {
    await idbSet(VERSIONS_KEY(key), stored)
  } catch {
    /* kept for this session */
  }
}

/** Rejects when storage is unavailable, so the caller can tell "nothing saved" from "blocked". */
export async function loadVersions(key: DatasetKey): Promise<StoredVersions | null> {
  const v = await idbGet<unknown>(VERSIONS_KEY(key))
  if (!v || typeof v !== 'object') return null
  const r = v as { current?: unknown; history?: unknown }
  return {
    current: isVersion(r.current) ? r.current : null,
    history: Array.isArray(r.history) ? r.history.filter(isVersion) : [],
  }
}

/**
 * "Clear this device": empty the app's own IndexedDB store (it holds nothing else) and remove
 * every hcp: key from localStorage and this tab's sessionStorage. Resolves to what could not be
 * removed (empty when everything went), after trying every key. Raw sheets kept in memory go too.
 */
export async function clearDeviceStorage(): Promise<string[]> {
  memRaw.clear()
  const failed: string[] = []
  try {
    await idbClear()
  } catch {
    // No IndexedDB at all means nothing was stored there; otherwise it is blocked and may hold data.
    if (typeof indexedDB !== 'undefined') {
      let left: string[] = []
      try {
        left = await idbKeys()
      } catch {
        failed.push('stored uploads, versions and plan state')
      }
      for (const k of left) {
        try {
          await idbDel(k)
        } catch {
          failed.push(k)
        }
      }
    }
  }
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    let ks: string[] = []
    let store: Storage | null = null
    try {
      store = typeof globalThis[area] === 'undefined' ? null : globalThis[area]
      if (store)
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i)
          if (k?.startsWith(PREFIX)) ks.push(k)
        }
    } catch {
      ks = [] // blocked: nothing was saved there
    }
    for (const k of ks) {
      try {
        store?.removeItem(k)
      } catch {
        failed.push(k)
      }
    }
  }
  return failed
}
