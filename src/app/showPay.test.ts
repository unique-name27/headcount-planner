/**
 * "Show pay amounts" is a session decision (docs/PLAN.md 7.1 and 7.5; the template app's showPay
 * test): off on every load, never written to this browser's storage, not in the settings file, and
 * off again after a reload whatever was on before. Headcount Planner never stored it, so there is no
 * old key to clear; the test also fails if any key the app writes mentions it.
 */
import { describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

const storage = new MemoryStorage()
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('BroadcastChannel', undefined)
// Display settings saved earlier load as usual.
storage.setItem('hcp:settings', JSON.stringify({ theme: 'dark' }))
const { useStore } = await import('@/data/store')

/** Every stored value, as text, for a search. */
const everything = () => {
  const out: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k) out.push(k, storage.getItem(k) ?? '')
  }
  return out.join('\n')
}

describe('pay amounts are a session decision', () => {
  it('start hidden on every load and keep other preferences', async () => {
    expect(useStore.getState().showPay).toBe(false)
    expect(useStore.getState().theme).toBe('dark')
    await useStore.getState().init()
    expect(useStore.getState().showPay).toBe(false)
  })

  it('switching on lasts for the session only: nothing is stored', () => {
    const before = everything()
    useStore.getState().setShowPay(true)
    expect(useStore.getState().showPay).toBe(true)
    // Saving another setting while the switch is on stores no trace of it.
    useStore.getState().setTextSize('lg')
    expect(everything()).not.toMatch(/showPay|pay amounts/i)
    expect(everything()).not.toBe(before)
    useStore.getState().setShowPay(false)
    expect(useStore.getState().showPay).toBe(false)
  })

  it('is not in the settings file', async () => {
    useStore.getState().setShowPay(true)
    const text = await useStore.getState().exportSettings().text()
    expect(text).not.toMatch(/showPay/i)
    useStore.getState().setShowPay(false)
  })
})
