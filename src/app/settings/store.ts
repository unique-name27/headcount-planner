/**
 * Whether the Settings sheet is open, and where (the template app kept this in its data store; the
 * data store here holds only data, so the shell keeps the sheet's state). `openSettings(section)`
 * opens it at a section, and `openSettings(section, focus)` on one control in it; `nonce` changes on
 * every request, so asking for the same section twice still scrolls to it. Memory only.
 */
import { create } from 'zustand'
import type { SettingsSection } from '@/data/settings'

export interface SettingsOpen {
  open: boolean
  section: SettingsSection | null
  /** A control in the section (`data-settings-focus`). */
  focus: string | null
  nonce: number
}

export const useSettingsSheet = create<SettingsOpen>(() => ({
  open: false,
  section: null,
  focus: null,
  nonce: 0,
}))

/** Open Settings, at a section and a control when given. */
export function openSettings(section?: SettingsSection, focus?: string): void {
  useSettingsSheet.setState((s) => ({
    open: true,
    section: section ?? null,
    focus: focus ?? null,
    nonce: s.nonce + 1,
  }))
}

export function closeSettings(): void {
  if (useSettingsSheet.getState().open) useSettingsSheet.setState({ open: false })
}
