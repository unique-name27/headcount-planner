/**
 * The mode store (docs/PLAN.md 8.1, 8.2 and 16.2; the template app's store.test): `hcp:mode`
 * version 1 round trips every mode and every Acting as pick; a corrupt, unknown, other-version or
 * missing value reads as HR admin with no picks; a malformed pick is dropped (an HRBP pick needs its
 * unit); storage that throws still gives a working store; picks are kept across mode changes; a
 * scoped mode without a pick opens its picker and keeps the current mode, while Finance and HR admin
 * read without one; the sample's personas fill only the picks not made, and are written only with
 * the next change; another tab's change is followed; the mode is not in the settings file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSampleBase } from '@/data/sample'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { type ActingAs, DEFAULT_MODE, MODES, type ModePicks, NO_PICKS } from './modes'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

/** A fresh copy of the store module, reading `hcp:mode` from `storage` as it is created. */
async function freshStore(storage: Storage) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  return import('./store')
}

const stored = (storage: MemoryStorage) => JSON.parse(storage.getItem('hcp:mode') ?? 'null')

const ADMIN = { v: 1, mode: 'hr-admin', actingAs: NO_PICKS }
const ANA: ActingAs = { personId: 'E10077', name: 'Ana Ruiz', unit: 'Silicon Engineering' }
const PRIYA: ActingAs = { personId: 'E10421', name: 'Priya Raman' }
const ALL: ModePicks = {
  manager: PRIYA,
  hrbp: ANA,
  leader: { personId: 'E10002', name: 'Dana Ito' },
  finance: { personId: 'E10010', name: 'Ola Berg' },
  'hr-admin': { personId: 'E10011', name: 'Kim Lee' },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hcp:mode version 1', () => {
  it('reads anything missing, corrupt, unknown or of another version as HR admin with no picks', async () => {
    const { parseStoredMode, DEFAULT_STORED_MODE } = await freshStore(new MemoryStorage())
    expect(DEFAULT_STORED_MODE).toEqual(ADMIN)
    expect(DEFAULT_MODE).toBe('hr-admin')
    for (const raw of [
      null,
      undefined,
      '',
      '{not json',
      '"manager"',
      'null',
      '[]',
      JSON.stringify({ v: 1, mode: 'admin' }),
      JSON.stringify({ v: 2, mode: 'finance' }),
      JSON.stringify({ mode: 'finance' }),
      JSON.stringify({ v: 1, mode: 'hr' }),
    ])
      expect(parseStoredMode(raw), String(raw)).toEqual(ADMIN)
  })

  it('reads every mode and every pick', async () => {
    const { parseStoredMode } = await freshStore(new MemoryStorage())
    for (const mode of MODES)
      expect(parseStoredMode(JSON.stringify({ v: 1, mode, actingAs: ALL })), mode).toEqual({
        v: 1,
        mode,
        actingAs: ALL,
      })
    // No picks at all, or picks missing: null.
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'finance' }))).toEqual({ ...ADMIN, mode: 'finance' })
  })

  it('drops a malformed pick, keeps known keys only and trims text', async () => {
    const { parseStoredMode } = await freshStore(new MemoryStorage())
    const raw = {
      v: 1,
      mode: 'hrbp',
      actingAs: {
        manager: { personId: '  E1 ', name: ' A ', extra: 'x', unit: 'kept off' },
        hrbp: { personId: 'E2', name: 'B' },
        leader: { personId: 42, name: 'C' },
        finance: 'E3',
        'hr-admin': { name: 'D' },
        __proto__: { polluted: true },
        developer: { personId: 'E9', name: 'Dev' },
      },
    }
    const out = parseStoredMode(JSON.stringify(raw))
    expect(out).toEqual({
      v: 1,
      mode: 'hrbp',
      actingAs: {
        manager: { personId: 'E1', name: 'A' },
        hrbp: null,
        leader: null,
        finance: null,
        'hr-admin': null,
      },
    })
    expect(Object.keys(out.actingAs)).toEqual([...MODES])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('writes version 1 on every change and reads it back on the next page', async () => {
    const storage = new MemoryStorage()
    const a = await freshStore(storage)
    expect(a.useMode.getState().mode).toBe('hr-admin')
    a.useMode.getState().choose('hrbp', ANA)
    expect(stored(storage)).toEqual({ v: 1, mode: 'hrbp', actingAs: { ...NO_PICKS, hrbp: ANA } })
    a.useMode.getState().choose('manager', PRIYA)
    a.useMode.getState().setMode('hr-admin')
    expect(stored(storage)).toEqual({
      v: 1,
      mode: 'hr-admin',
      actingAs: { ...NO_PICKS, hrbp: ANA, manager: PRIYA },
    })
    const b = await freshStore(storage)
    expect(b.useMode.getState().mode).toBe('hr-admin')
    expect(b.useMode.getState().actingAs).toEqual({ ...NO_PICKS, hrbp: ANA, manager: PRIYA })
  })

  it('works when storage throws, for this page only', async () => {
    const storage = new MemoryStorage()
    storage.failure = new Error('blocked')
    const s = await freshStore(storage)
    expect(s.useMode.getState().mode).toBe('hr-admin')
    s.useMode.getState().choose('manager', PRIYA)
    expect(s.useMode.getState().mode).toBe('manager')
    expect(s.useMode.getState().actingAs.manager).toEqual(PRIYA)
  })

  it('works with no localStorage at all', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', undefined)
    const s = await import('./store')
    expect(s.useMode.getState().mode).toBe('hr-admin')
  })
})

describe('modes and picks', () => {
  it('keeps every pick across mode changes', async () => {
    const s = await freshStore(new MemoryStorage())
    const st = () => s.useMode.getState()
    st().choose('manager', PRIYA)
    st().choose('hrbp', ANA)
    st().setMode('manager')
    expect(st().mode).toBe('manager')
    expect(st().actingAs.hrbp).toEqual(ANA)
    expect(st().actingAs.manager).toEqual(PRIYA)
  })

  it('opens the picker for a scoped mode with no pick and keeps the current mode', async () => {
    const s = await freshStore(new MemoryStorage())
    const st = () => s.useMode.getState()
    for (const mode of ['manager', 'hrbp', 'leader'] as const) {
      st().setMode(mode)
      expect(st().mode, mode).toBe('hr-admin')
      expect(st().picking, mode).toBe(mode)
      st().cancelPick()
      expect(st().picking).toBeNull()
    }
    // An HRBP pick needs its unit.
    s.useMode.setState({ actingAs: { ...NO_PICKS, hrbp: { personId: 'E1', name: 'A' } } })
    st().setMode('hrbp')
    expect(st().mode).toBe('hr-admin')
    // Finance and HR admin read without a pick (writes wait for one).
    st().setMode('finance')
    expect(st().mode).toBe('finance')
    expect(st().picking).toBeNull()
  })

  it('opens a picker with a note, the menu, and the imperative helpers', async () => {
    const s = await freshStore(new MemoryStorage())
    s.openPicker('leader', 'Dana Ito is not in the loaded data for this mode. Pick again.')
    expect(s.useMode.getState()).toMatchObject({
      picking: 'leader',
      pickNote: 'Dana Ito is not in the loaded data for this mode. Pick again.',
    })
    s.openModeMenu()
    expect(s.useMode.getState().menuOpen).toBe(true)
    s.useMode.getState().setMenuOpen(false)
    s.useMode.getState().choose('finance', ALL.finance as ActingAs)
    s.setMode('hr-admin')
    expect(s.useMode.getState().mode).toBe('hr-admin')
  })

  it("fills only the picks not made with the sample's personas, and writes them with the next change", async () => {
    const storage = new MemoryStorage()
    const s = await freshStore(storage)
    const base = generateSampleBase()
    const picks = s.samplePicks(base.personas)
    const persona = (key: string) => base.personas.find((p) => p.key === key)!
    expect(picks.manager).toEqual({
      personId: persona('manager-a').employeeId,
      name: persona('manager-a').name,
    })
    expect(picks.hrbp).toEqual({
      personId: persona('hrbp-se').employeeId,
      name: persona('hrbp-se').name,
      unit: 'Silicon Engineering',
    })
    expect(picks.leader?.personId).toBe(persona('leader-svp-se').employeeId)
    expect(picks.finance?.personId).toBe(persona('finance-fpa').employeeId)
    expect(picks['hr-admin']?.personId).toBe(persona('hr-admin').employeeId)
    s.useMode.getState().choose('manager', PRIYA)
    s.useMode.getState().fillPicks(picks)
    expect(s.useMode.getState().actingAs).toEqual({ ...picks, manager: PRIYA })
    // Filled picks are defaults: nothing new was written.
    expect(stored(storage).actingAs).toEqual({ ...NO_PICKS, manager: PRIYA })
    s.useMode.getState().setMode('leader')
    expect(stored(storage)).toEqual({ v: 1, mode: 'leader', actingAs: { ...picks, manager: PRIYA } })
  })

  it("follows another tab's change, and a cleared storage reads as the default", async () => {
    const storage = new MemoryStorage()
    const s = await freshStore(storage)
    storage.setItem('hcp:mode', JSON.stringify({ v: 1, mode: 'finance', actingAs: ALL }))
    s.useMode.getState().reload()
    expect(s.useMode.getState().mode).toBe('finance')
    expect(s.useMode.getState().actingAs).toEqual(ALL)
    storage.clear()
    s.useMode.getState().reload()
    expect(s.useMode.getState().mode).toBe('hr-admin')
    expect(s.useMode.getState().actingAs).toEqual(NO_PICKS)
  })

  it('is not part of the settings file', async () => {
    const storage = new MemoryStorage()
    const s = await freshStore(storage)
    s.useMode.getState().choose('manager', PRIYA)
    const data = await import('@/data/store')
    const text = await data.exportSettings().text()
    expect(text).not.toContain('hcp:mode')
    expect(text).not.toContain('Priya Raman')
    expect(text).not.toContain('actingAs')
  })
})
