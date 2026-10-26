/**
 * The address writer and the stores together (the template app's addressSync test): what another
 * open tab's changes do to this tab's history, and that the data standard and the version and
 * comparison pickers a link or Back and Forward show stay in this tab. The browser is a stub:
 * storage events are dispatched by hand, as the browser does in every other tab of the origin.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AddressIntent } from '@/data/address'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

const storage = new MemoryStorage()
const win = Object.assign(new EventTarget(), { scrollTo: () => undefined })
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', win)
vi.stubGlobal('BroadcastChannel', undefined)

/** What the browser does in this tab when another tab writes `key`. */
function otherTabWrote(key: string, value: string | null): void {
  if (value == null) storage.removeItem(key)
  else storage.setItem(key, value)
  win.dispatchEvent(Object.assign(new Event('storage'), { key }))
}

type Mods = {
  store: typeof import('@/data/store')
  address: typeof import('./address')
}
let m: Mods
const writes: (AddressIntent | null)[] = []
let stop: () => void = () => undefined

beforeAll(async () => {
  m = {
    store: await import('@/data/store'),
    address: await import('./address'),
  }
  await m.store.useStore.getState().init()
  stop = m.address.followStores((intent) => writes.push(intent))
}, 60_000)

afterAll(() => {
  stop()
  vi.unstubAllGlobals()
})

const take = () => writes.splice(0)
const saved = () => JSON.parse(storage.getItem('hcp:settings') ?? '{}') as Record<string, unknown>

describe('another tab never adds to this tab’s history', () => {
  it('settings saved elsewhere leave no hint behind for this tab’s next filter change', () => {
    const st = m.store.useStore
    st.getState().setMotion('system')
    take()
    otherTabWrote('hcp:settings', JSON.stringify({ ...saved(), motion: 'reduce' }))
    expect(st.getState().motion).toBe('reduce')
    // Nothing the address holds changed, so nothing was written…
    expect(take()).toEqual([])
    // …and this tab's next filter change is its own entry, not a replacement of the current one.
    st.getState().setFilters({ location: ['Hsinchu'] })
    expect(take()).toEqual([null])
    st.getState().resetFilters()
    take()
  })

  it('another tab changing your saved data standard is followed in place; other settings leave this tab’s standard', () => {
    const st = m.store.useStore
    otherTabWrote('hcp:settings', JSON.stringify({ ...saved(), dataStandard: 'gold' }))
    expect(st.getState().dataStandard).toBe('gold')
    expect(take()).toEqual(['replace'])
    // A link shows silver in this tab; another tab's theme change does not undo it.
    st.getState().setScopeStandard('silver')
    take()
    otherTabWrote('hcp:settings', JSON.stringify({ ...saved(), theme: 'dark' }))
    expect(st.getState().dataStandard).toBe('silver')
    expect(st.getState().theme).toBe('dark')
    expect(take()).toEqual([])
  })
})

describe('the scope in the address belongs to this tab', () => {
  it('a data standard shown from the address is not saved, and a later settings save keeps yours', () => {
    const st = m.store.useStore
    st.getState().setDataStandard('bronze')
    take()
    st.getState().setScopeStandard('gold')
    expect(st.getState().dataStandard).toBe('gold')
    expect(take()).toEqual([null])
    expect(saved().dataStandard).toBe('bronze')
    expect(m.store.savedDataStandard()).toBe('bronze')
    // Saving another setting saves your standard, never the one this tab shows.
    st.getState().setTheme('light')
    expect(saved().dataStandard).toBe('bronze')
    expect(st.getState().dataStandard).toBe('gold')
    // The control saves it.
    st.getState().setDataStandard('gold')
    expect(saved().dataStandard).toBe('gold')
    take()
  })

  it('the version and comparison pickers are written to the address, never stored', () => {
    const st = m.store.useStore
    const before = storage.keys().map((k) => [k, storage.getItem(k)])
    st.getState().setPicks({ version: 'fy27-budget', compare: 'target' })
    expect(st.getState().version).toBe('fy27-budget')
    expect(take()).toEqual([null])
    expect(m.address.currentScope()).toMatchObject({ version: 'fy27-budget', compare: 'target' })
    expect(m.address.addressFor({ view: 'plan', tab: 'overview' })).toContain('ver=fy27-budget&vs=target')
    // The same picks again change nothing, so nothing is written.
    st.getState().setPicks({ version: 'fy27-budget', compare: 'target' })
    expect(take()).toEqual([])
    st.getState().setPicks({ version: null, compare: null }, { history: 'push' })
    expect(take()).toEqual(['push'])
    expect(storage.keys().map((k) => [k, storage.getItem(k)])).toEqual(before)
  })
})
