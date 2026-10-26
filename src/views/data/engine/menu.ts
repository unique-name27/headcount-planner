/**
 * The Workspace menu's model (docs/PLAN.md 5.5 "Who", 8.3; M3): the files this mode saves and opens,
 * each item by its own action's decision (`action:export.shareable`, `action:export.requests`,
 * `action:export.for-manager`, `action:export.full`, `action:workspace.open-shared`,
 * `action:request.import`, `action:workspace.import`), in the order the masthead's menu and the Data
 * room's Workspace tab list them. A hidden item is not listed; a limited one carries the policy's
 * sentence; the Full file needs Show pay amounts on. Whether a reader tab may write is the write
 * hook's (`usePlanWrite().blocked`), so the menu disables the imports there. Pure.
 *
 * Who (5.5): Save a Shareable file and Export requests in every mode; Export for a manager in HRBP,
 * Leader (managers in their org) and HR admin; the Full file and Import (Replace or Merge) in HR admin;
 * Import requests in HRBP, Leader (their org), Finance and HR admin; Open a shared file in every mode.
 */
import type { AnalyticsContext } from '@/data/context'
import { FULL_NEEDS_PAY_TEXT } from './workspace'

/** The Shareable item's hint in HR admin with Show pay amounts on (D-PAYFILES). */
export const SHAREABLE_PAY_OFF_HINT =
  'What this view shows with Show pay amounts off, through the cost guard: no individual pay.'

export type WorkspaceItemKey =
  | 'shareable'
  | 'requests'
  | 'for-manager'
  | 'full'
  | 'open-shared'
  | 'import-requests'
  | 'import'

export interface WorkspaceMenuItem {
  key: WorkspaceItemKey
  label: string
  /** One line under the label: what the file holds or what the item does. */
  hint: string
  /** The action id the item follows (`action:<id>`). */
  actionId: string
  /** The item writes plan state (an import): disabled in a reader tab. */
  writes: boolean
  /** The item opens a dialog first (a picker, a confirm, a file to read). */
  dialog: boolean
  /** The policy's sentence for a limited item ("Managers in your org."); null when shown. */
  limited: string | null
  /** Why the item cannot be used now (the Full file with Show pay amounts off); null when it can. */
  disabled: string | null
}

export interface WorkspaceMenuModel {
  /** The masthead control's sentence where it is limited ("Lists only the files this mode saves and opens."). */
  note: string | null
  /** Files this mode saves, then files it brings in. */
  save: readonly WorkspaceMenuItem[]
  bring: readonly WorkspaceMenuItem[]
}

interface ItemDef {
  key: WorkspaceItemKey
  label: string
  hint: string
  actionId: string
  writes: boolean
  dialog: boolean
}

const SAVE: readonly ItemDef[] = [
  {
    key: 'shareable',
    label: 'Save a Shareable file',
    hint: 'What this view shows, through the cost guard, to keep or send.',
    actionId: 'export.shareable',
    writes: false,
    dialog: false,
  },
  {
    key: 'requests',
    label: 'Export requests',
    hint: 'The requests you see in full, with their steps and comments, for merging.',
    actionId: 'export.requests',
    writes: false,
    dialog: false,
  },
  {
    key: 'for-manager',
    label: 'Export for a manager',
    hint: 'A file for one manager, made as Manager mode shows their team: no amounts at all.',
    actionId: 'export.for-manager',
    writes: false,
    dialog: true,
  },
  {
    key: 'full',
    label: 'Save a Full file',
    hint: 'Everything in this workspace, individual pay included.',
    actionId: 'export.full',
    writes: false,
    dialog: true,
  },
]

const BRING: readonly ItemDef[] = [
  {
    key: 'open-shared',
    label: 'Open a shared file',
    hint: 'Read a file as this mode and person may see it. Nothing merges.',
    actionId: 'workspace.open-shared',
    writes: false,
    dialog: true,
  },
  {
    key: 'import-requests',
    label: 'Import requests',
    hint: 'Merge the requests of Export requests or Shareable files, by request ID.',
    actionId: 'request.import',
    writes: true,
    dialog: true,
  },
  {
    key: 'import',
    label: 'Import a workspace file',
    hint: 'Replace or merge this workspace with a Full file, after you see what changes.',
    actionId: 'workspace.import',
    writes: true,
    dialog: true,
  },
]

function itemOf(ctx: AnalyticsContext, def: ItemDef): WorkspaceMenuItem | null {
  const d = ctx.access.decide(`action:${def.actionId}`)
  if (d.access === 'hidden') return null
  const limited = d.access === 'limited' ? (d.how ?? null) : null
  // The Full file is limited in HR admin to Show pay amounts on: off, it is listed but cannot be used.
  const disabled = def.key === 'full' && !ctx.showPay ? FULL_NEEDS_PAY_TEXT : null
  // With the switch on, a Shareable is still written as the switch off shows it (D-PAYFILES).
  const hint = def.key === 'shareable' && ctx.showPay ? SHAREABLE_PAY_OFF_HINT : def.hint
  return { ...def, hint, limited: def.key === 'full' ? null : limited, disabled }
}

const memo = new WeakMap<AnalyticsContext, WorkspaceMenuModel>()

/** The menu for a context (see the module comment). */
export function workspaceMenuOf(ctx: AnalyticsContext): WorkspaceMenuModel {
  const hit = memo.get(ctx)
  if (hit) return hit
  const control = ctx.access.decide('masthead:workspace')
  const pick = (defs: readonly ItemDef[]) =>
    defs.map((d) => itemOf(ctx, d)).filter((x): x is WorkspaceMenuItem => !!x)
  const out: WorkspaceMenuModel = {
    note: control.access === 'limited' ? (control.how ?? null) : null,
    save: pick(SAVE),
    bring: pick(BRING),
  }
  memo.set(ctx, out)
  return out
}
