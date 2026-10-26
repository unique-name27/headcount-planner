/**
 * "Open this dataset in the Data room" (the template app's datasetFocus test): selects the dataset,
 * opens the panel, writes `#data.<dataset>-<panel>`, and closes the records panel and Settings first.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const goTo = vi.fn()
vi.mock('@/components/navigation', () => ({ goTo: (...args: unknown[]) => goTo(...args) }))
vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

const { clearDatasetFocus, openDatasetQuality, useDatasetFocus } = await import('./datasetFocus')
const { useDrillStore } = await import('@/drill/store')
const { openSettings, useSettingsSheet } = await import('./settings/store')

describe('openDatasetQuality', () => {
  beforeEach(() => goTo.mockClear())

  it('selects the dataset, opens Quality and goes to its address in the Data room', () => {
    openDatasetQuality('reqs')
    expect(useDatasetFocus.getState()).toMatchObject({ key: 'reqs', panel: 'quality' })
    expect(goTo).toHaveBeenCalledWith('data', 'reqs-quality')
    openDatasetQuality('positions', 'certify')
    expect(goTo).toHaveBeenLastCalledWith('data', 'positions-certify')
  })

  it('changes the nonce on every request, even for the same dataset', () => {
    const before = useDatasetFocus.getState().nonce
    openDatasetQuality('reqs')
    openDatasetQuality('reqs', 'mapping')
    expect(useDatasetFocus.getState().nonce).toBe(before + 2)
    expect(useDatasetFocus.getState().panel).toBe('mapping')
  })

  it('closes the records panel and Settings first', () => {
    useDrillStore.setState({ stack: [{ type: 'records' } as never] })
    openSettings('data')
    expect(useSettingsSheet.getState().open).toBe(true)
    openDatasetQuality('workers')
    expect(useDrillStore.getState().stack).toEqual([])
    expect(useSettingsSheet.getState().open).toBe(false)
  })

  it('clears the request once the Data room has acted on it', () => {
    openDatasetQuality('targets')
    clearDatasetFocus()
    expect(useDatasetFocus.getState().key).toBeNull()
  })
})
