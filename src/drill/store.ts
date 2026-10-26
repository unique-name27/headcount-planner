/**
 * The drill stack (docs/PLAN.md 9.5): a number opens a record list or, for a modeled number, its
 * calculation card; a row opens a position card; a count inside the panel opens its records on
 * top ("Show the n records" on a card too); Back walks out again. Every sheet is a `DrillEntry`
 * (./types.ts), so Back and focus return work the same for records, positions and cards.
 */
import { create } from 'zustand'
import type { CalcSpec } from './calc'
import type { DrillEntry, DrillSpec } from './types'

export type { DrillEntry } from './types'

interface DrillState {
  stack: DrillEntry[]
  /** Open a fresh drill (replaces whatever was open). */
  open: (spec: DrillSpec) => void
  /** Open records on top of what the panel shows (a number inside the panel); Back returns. */
  push: (spec: DrillSpec) => void
  /** Open a position's card directly, or on top of the current list. */
  openPosition: (positionId: string) => void
  /** Open a calculation card fresh (replaces whatever was open). */
  openCalc: (spec: CalcSpec) => void
  /** Open a calculation card on top of what the panel shows; Back returns. */
  pushCalc: (spec: CalcSpec) => void
  back: () => void
  close: () => void
}

export const useDrillStore = create<DrillState>((set) => ({
  stack: [],
  open: (spec) => set({ stack: [{ type: 'records', spec }] }),
  push: (spec) => set((s) => ({ stack: [...s.stack, { type: 'records', spec }] })),
  openPosition: (positionId) => set((s) => ({ stack: [...s.stack, { type: 'position', positionId }] })),
  openCalc: (spec) => set({ stack: [{ type: 'calc', spec }] }),
  pushCalc: (spec) => set((s) => ({ stack: [...s.stack, { type: 'calc', spec }] })),
  back: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  close: () => set({ stack: [] }),
}))

/** Imperative helpers for event handlers (no hook needed). */
export const openDrill = (spec: DrillSpec) => useDrillStore.getState().open(spec)
export const pushDrill = (spec: DrillSpec) => useDrillStore.getState().push(spec)
export const openPosition = (positionId: string) => useDrillStore.getState().openPosition(positionId)
export const openCalc = (spec: CalcSpec) => useDrillStore.getState().openCalc(spec)
export const pushCalc = (spec: CalcSpec) => useDrillStore.getState().pushCalc(spec)
