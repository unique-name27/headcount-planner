/**
 * The mode this browser is in and every mode's Acting as pick (docs/PLAN.md 8.1 and 8.2), kept at
 * `hcp:mode` as version 1:
 *
 *   { "v": 1, "mode": "hrbp", "actingAs": { "manager": null,
 *     "hrbp": { "personId": "E10077", "name": "Ana Ruiz", "unit": "Silicon Engineering" }, … } }
 *
 * A missing, unreadable or unknown value, or an unknown mode, reads as HR admin with no picks
 * (`DEFAULT_STORED_MODE`); a malformed pick is dropped. Every pick is kept when the mode changes. A
 * mode that needs a pick it does not have opens its picker and keeps the current mode. Read once when
 * the store is created and written on every change, every storage access in try/catch. Not in the
 * address and not in the settings file. Another open tab that changes it is followed through the
 * browser's storage event (`e.key === MODE_KEY || e.key === null`; the access builder adds the
 * listener with `reload`).
 *
 * "Show pay amounts" is not here: it is session memory in src/data/store.ts (`showPay`), and every
 * mode change turns it off (src/access/connect.ts).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled `parseStoredMode`,
 * `samplePicks`, every action and the storage listener. A pick the sample fills (`fillPicks`) is a
 * default: it is written with the next change the person makes, never on its own.
 */
import { create } from 'zustand'
import type { Persona } from '@/data/sample'
import {
  type ActingAs,
  DEFAULT_MODE,
  hasPick,
  isMode,
  MODES,
  type Mode,
  type ModePicks,
  NO_PICKS,
  PICK_BLOCKS_READS,
} from './modes'

export const MODE_KEY = 'hcp:mode'

/** What `hcp:mode` holds. */
export interface StoredMode {
  v: 1
  mode: Mode
  actingAs: ModePicks
}

/** HR admin with no picks: what anything missing, corrupt or unknown reads as. */
export const DEFAULT_STORED_MODE: StoredMode = Object.freeze({ v: 1, mode: DEFAULT_MODE, actingAs: NO_PICKS })

/** The stored value, checked field by field (copy known keys only), or `DEFAULT_STORED_MODE`. */
export function parseStoredMode(raw: string | null | undefined): StoredMode {
  if (!raw) return DEFAULT_STORED_MODE
  try {
    const v = JSON.parse(raw) as unknown
    if (!isObj(v) || v.v !== 1 || !isMode(v.mode)) return DEFAULT_STORED_MODE
    const given = isObj(v.actingAs) ? v.actingAs : {}
    const actingAs = {} as Record<Mode, ActingAs | null>
    for (const m of MODES) actingAs[m] = pickOf(m, Object.hasOwn(given, m) ? given[m] : null)
    return { v: 1, mode: v.mode, actingAs }
  } catch {
    return DEFAULT_STORED_MODE
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** One stored pick, field by field (known keys only), or null when it is malformed. */
function pickOf(mode: Mode, v: unknown): ActingAs | null {
  if (!isObj(v)) return null
  const personId = text(v.personId)
  const name = text(v.name)
  if (!personId || !name) return null
  const unit = text(v.unit)
  if (mode === 'hrbp') return unit ? { personId, name, unit } : null
  return { personId, name }
}

/**
 * Every mode's pick on the sample: its default persona (docs/PLAN.md 13.3, `Persona.isDefault`), so
 * no first screen is blank. With uploaded data no pick is made for the user.
 */
export function samplePicks(personas: readonly Persona[]): ModePicks {
  const out = { ...NO_PICKS } as Record<Mode, ActingAs | null>
  for (const m of MODES) {
    const p = personas.find((x) => x.mode === m && x.isDefault) ?? personas.find((x) => x.mode === m)
    if (!p) continue
    out[m] =
      m === 'hrbp'
        ? { personId: p.employeeId, name: p.name, unit: supportedUnit(p) }
        : { personId: p.employeeId, name: p.name }
  }
  return out
}

/**
 * The unit an HRBP persona supports. The persona's own seat sits in Corporate > People, so the unit
 * is read from its label ("Silicon Engineering HRBP"), else its seat's unit.
 */
function supportedUnit(p: Persona): string {
  const m = /^(.+) HRBP$/.exec(p.label)
  return m ? m[1] : p.businessUnit
}

export interface ModeState {
  mode: Mode
  /** Every mode's pick; each is kept when the mode changes. */
  actingAs: ModePicks
  /** Which mode's Acting as picker is open, if any. */
  picking: Mode | null
  /** A line at the top of the picker ("Dana Ito is not in the loaded data. Pick again."). */
  pickNote: string | null
  /** The masthead's Mode menu is open (a redirect toast's "Change mode" opens it). */
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  /** Switch modes. A mode that needs a pick it does not have opens its picker and keeps the current mode. */
  setMode: (mode: Mode) => void
  /** Make (or change) a mode's pick and enter that mode. */
  choose: (mode: Mode, pick: ActingAs) => void
  /** Open a mode's picker ("Change who you act as…"), with an optional note. */
  openPicker: (mode: Mode, note?: string | null) => void
  /** Close the picker; the mode stays as it was. */
  cancelPick: () => void
  /** Fill the picks a mode has not made with these (the sample's personas), keeping every pick made. */
  fillPicks: (picks: ModePicks) => void
  /** Re-read the stored mode (another tab changed it). */
  reload: () => void
}

/** The stored mode, or the default when storage is missing, throws or holds anything unreadable. */
function readStored(): StoredMode {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_STORED_MODE
    return parseStoredMode(localStorage.getItem(MODE_KEY))
  } catch {
    return DEFAULT_STORED_MODE
  }
}

function writeStored(s: StoredMode): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MODE_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: the mode lasts for this page */
  }
}

const samePick = (a: ActingAs | null, b: ActingAs | null): boolean =>
  a === b ||
  (!!a && !!b && a.personId === b.personId && a.name === b.name && (a.unit ?? null) === (b.unit ?? null))

const samePicks = (a: ModePicks, b: ModePicks): boolean => MODES.every((m) => samePick(a[m], b[m]))

export const useMode = create<ModeState>((set, get) => {
  const initial = readStored()
  const persist = () => {
    const st = get()
    writeStored({ v: 1, mode: st.mode, actingAs: st.actingAs })
  }
  return {
    mode: initial.mode,
    actingAs: initial.actingAs,
    picking: null,
    pickNote: null,
    menuOpen: false,
    setMenuOpen(menuOpen) {
      set({ menuOpen })
    },
    setMode(mode) {
      // A scoped mode needs its pick to read anything: open its picker and keep the current mode.
      if (PICK_BLOCKS_READS[mode] && !hasPick(mode, get().actingAs)) {
        set({ picking: mode, pickNote: null })
        return
      }
      if (mode === get().mode) return
      set({ mode, picking: null, pickNote: null })
      persist()
    },
    choose(mode, pick) {
      const actingAs = { ...get().actingAs, [mode]: pick } as ModePicks
      set({ mode, actingAs, picking: null, pickNote: null })
      persist()
    },
    openPicker(mode, note = null) {
      set({ picking: mode, pickNote: note })
    },
    cancelPick() {
      set({ picking: null, pickNote: null })
    },
    fillPicks(picks) {
      const cur = get().actingAs
      const next = { ...cur } as Record<Mode, ActingAs | null>
      let changed = false
      for (const m of MODES)
        if (!cur[m] && picks[m]) {
          next[m] = picks[m]
          changed = true
        }
      // Filled picks are defaults: written only with the next change the person makes.
      if (changed) set({ actingAs: next })
    },
    reload() {
      const s = readStored()
      const cur = get()
      if (s.mode !== cur.mode || !samePicks(s.actingAs, cur.actingAs))
        set({ mode: s.mode, actingAs: s.actingAs })
    },
  }
})

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
  window.addEventListener('storage', (e) => {
    // A null key means another tab cleared all of localStorage: back to the default.
    if (e.key === MODE_KEY || e.key === null) useMode.getState().reload()
  })

/** Imperative helpers for event handlers. */
export const setMode = (mode: Mode): void => useMode.getState().setMode(mode)
export const openPicker = (mode: Mode, note?: string | null): void =>
  useMode.getState().openPicker(mode, note)
export const openModeMenu = (): void => useMode.getState().setMenuOpen(true)
