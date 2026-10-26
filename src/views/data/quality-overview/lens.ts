/**
 * The quality lens (the template app's lens.ts): the "Show data quality" switch. While it is on,
 * every KPI tile, figure footer and finding says its tier and the field limiting it. Off by default
 * so the plan stays clean for meetings. Kept in memory for the page (no storage key: docs/PLAN.md 5.4
 * lists none for it); the shell connects it to the address (`connectLens`, src/data/address.ts) so a
 * link and a saved view carry it. No React components here, so the shared UI can import it cheaply.
 */
import { create } from 'zustand'

interface LensState {
  on: boolean
  /** Show or hide the lens in this tab. */
  setOn: (on: boolean) => void
}

export const useQualityLens = create<LensState>((set) => ({
  on: false,
  setOn(on) {
    set({ on })
  },
}))

/** Whether the quality lens is on (a hook; components re-render when it changes). */
export const useLensOn = (): boolean => useQualityLens((s) => s.on)

/** The lens as `connectLens` reads it (src/data/address.ts). */
export const lensSource = {
  get: (): boolean => useQualityLens.getState().on,
  set: (on: boolean): void => useQualityLens.getState().setOn(on),
}
