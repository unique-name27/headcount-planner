/**
 * The current view as "Open a shared file" reads it (docs/PLAN.md 5.5, 8.4, C30; review RM-3): the
 * scope identity of the context (src/plan/workspace/shared.ts `scopeKeyOf`: the mode, the Acting as
 * person, the HRBP's unit and the scope's seats), which every Shareable this view exports carries in
 * its header and every opened file is compared with. The opener itself (./workspace.ts
 * `openSharedFile`, from the Workspace menu and the Data room's Workspace tab) reads a file's
 * requests, comments and audit rows through `requestView`,
 * `commentVisible` and `auditView` for this context and shows the file's figures only when
 * `sharedFiguresShown` says so. Pure.
 */
import { MODE_LABEL } from '@/access/modes'
import type { AnalyticsContext } from '@/data/context'
import {
  type ScopeIdentity,
  type SharedHeader,
  scopeKeyOf,
  sharedFiguresShown,
  sharedFileNote,
} from '@/plan/workspace/shared'

/** The context's scope identity: who is acting, in which mode, over which seats. */
export function scopeIdentityOf(ctx: AnalyticsContext): ScopeIdentity {
  const s = ctx.access.scope
  return {
    mode: ctx.access.mode,
    // A pick to be made holds nobody, so it has no identity and matches no file.
    personId: ctx.access.unset ? null : (ctx.access.actingAs?.personId ?? null),
    unit: s?.kind === 'unit' ? s.unit : (ctx.access.actingAs?.unit ?? null),
    rootPositionIds: s?.kind === 'tree' ? s.rootPositionIds : null,
    positionIds: s ? s.positionIds : null,
  }
}

/** The scope key a Shareable made in this context carries, and an opened file is compared with. */
export const viewScopeKey = (ctx: AnalyticsContext): string | null => scopeKeyOf(scopeIdentityOf(ctx))

/** What an opened file may show in this context: its figures or not, and the note it carries. */
export function openedFileView(
  header: SharedHeader,
  ctx: AnalyticsContext,
): { figuresShown: boolean; note: string | null } {
  const viewer = { mode: ctx.access.mode, scopeKey: viewScopeKey(ctx) }
  return {
    figuresShown: sharedFiguresShown(header, viewer),
    note: sharedFileNote(header, viewer, (m) => MODE_LABEL[m] ?? m),
  }
}
