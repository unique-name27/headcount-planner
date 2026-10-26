/**
 * Which Workspace dialog is open (M3): the masthead's Workspace menu closes as soon as an item is
 * picked (its popover unmounts its content), so the dialogs it opens are kept here, in memory, and
 * drawn by one host that outlives the menu (./WorkspaceMenu.tsx `WorkspaceHost`). Never stored.
 */
import { useSyncExternalStore } from 'react'

export type WorkspaceDialogKind = 'for-manager' | 'full' | 'open-shared' | 'import-requests' | 'import'

let current: WorkspaceDialogKind | null = null
const listeners = new Set<() => void>()

/** Opens one dialog (closing any other), or closes it with null. */
export function setWorkspaceDialog(kind: WorkspaceDialogKind | null): void {
  if (current === kind) return
  current = kind
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The dialog open now, or null. */
export function useWorkspaceDialog(): WorkspaceDialogKind | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
}
