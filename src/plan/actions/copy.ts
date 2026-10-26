/**
 * The write path's words (docs/PLAN.md 14.3): every refusal and notice an action returns that is not
 * the policy's own `how`, the engines' (requests.ts, cycle.ts, trade.ts, whatif.ts, freeze.ts), the
 * workspace reader's (validate.ts, merge.ts) or 7.4's (src/cost/edits.ts). Where the plan gives the
 * text it is the plan's, word for word; the rest is plain, sentence case, with no "!", no em dash and
 * never an amount (7.2 rule 6: a notice is a toast). Names and IDs are fine; amounts never are.
 *
 * Written in full in the M3 freeze (data, frozen like a signature: docs/CONTRACTS-M3.md). Builders
 * may add texts, never reword these; a test may compare with them.
 */
import { READ_ONLY_NOTE } from '../store/types'

export {
  ACCEPTED_OFFER_TEXT,
  AMOUNT_COMMENT_NOTE,
  BELOW_THE_CUT_LINE,
  NOT_YOUR_STEP_TEXT,
  REMOVE_AMOUNT_TEXT,
} from '../engine/requests'
export { FILLED_NOT_TRADED_TEXT } from '../engine/trade'
export { FREEZE_LEVER_NOTE } from '../engine/whatif'
export { READ_ONLY_NOTE }

/* ───────────── refusals ───────────── */

/** An action named by no input the store knows: the request, version, cycle or freeze is gone. */
export const NOT_FOUND_TEXT = 'This record is no longer in the plan. Reload and try again.'

/** A request the viewer may not see is never acted on (8.4 rule 3); the words say nothing about it. */
export const NOT_SHOWN_TEXT = 'There is no such request in your view.'

/** Limited request.draft, request.submit, freeze.exception (Manager, Leader): "Inside your team or org." */
export const OUTSIDE_SCOPE_TEXT = 'This seat is outside your team or org.'

/** Limited position.edit, recon.review, assumptions.edit-operational, cycle.advance (HRBP). */
export const OUTSIDE_UNIT_TEXT = 'This is outside your unit.'

/** position.edit on a seat that is not Open (with no accepted offer) or Planned (10.1). */
export const SEAT_NOT_EDITABLE_TEXT =
  'Only Open and Planned seats are edited in Working. Changes to a Filled seat go through a request.'

/** position.edit, assumptions.edit-operational, target edits on a version that is not a Working. */
export const WORKING_ONLY_TEXT = 'Changes are made in Working. Locked and retired versions are read only.'

/** A reason the plan requires (seat edits, approve with changes, send back, reject, freeze exceptions). */
export const REASON_REQUIRED_TEXT = 'Give a reason for this change.'

/** An edit of a request that is not the requester's Draft or Sent back request. */
export const NOT_EDITABLE_REQUEST_TEXT = 'Only your own draft, or a request sent back to you, can be edited.'

/** createRequest with a type that has its own action (Transfer, Trade, Start recruiting, Start date). */
export const USE_TYPE_ACTION_TEXT = 'Start this request from its own form.'

/** assumptions.edit-operational on a table other than time to fill, fill rate, backfill rate and lag (R18). */
export const OPERATIONAL_ONLY_TEXT =
  'Your unit’s time to fill, fill rate and backfill settings can be edited in Working.'

/** target.split or target.move past the parent's envelope without `target.exception` (8.3). */
export const PAST_ENVELOPE_TEXT = 'A move past a sub-org’s envelope needs Finance.'

/** A target edit with heads below 0 or a cost below 0. */
export const TARGET_RANGE_TEXT = 'A target is 0 or more heads, and 0 or more cost.'

/** A freeze whose end comes before its start. */
export const FREEZE_DATES_TEXT = 'A freeze ends on or after the day it starts.'

/** close.month for a month that is closed already or that comes after the first open month. */
export const CLOSE_ORDER_TEXT = 'Months close one at a time, in order, from the first open month.'

/** version.create for a fiscal year that has a Working already (R25: one Working per year). */
export const workingExistsText = (fy: string): string => `${fy} has a Working version already.`

/** Import with no file read. */
export const NO_FILE_TEXT = 'Pick a file first.'

/* ───────────── refusals the core builder added (M3) ───────────── */

/** A hidden action whose policy gives no reason (the policy always gives one; defensive). */
export const NOT_IN_MODE_TEXT = 'This change is not made in this mode.'

/** A Draft or Sent back request idle for the idle days (10.1, R6): it reads Expired and is not acted on. */
export const expiredText = (days: number | string): string =>
  `This request expired after ${days} idle days. Start a new one.`

/** A seat edit that changes nothing. */
export const NO_SEAT_CHANGE_TEXT = 'Change at least one field before saving.'

/** A comment on a request the viewer sees only in part (8.4 rule 2): only the people on it comment. */
export const LIMITED_REQUEST_TEXT = 'Only the people on this request can comment on it.'

/** A transfer whose person does not hold the seat it moves from on the as-of date. */
export const NOT_IN_SEAT_TEXT = 'The person who moves must hold the seat they move from.'

/** An internal move into a seat that is not Open, or that has an accepted offer (10.5). */
export const RECEIVING_SEAT_TEXT = 'An internal move fills an Open seat with no accepted offer.'

/** A ranked ask raised in a cycle that is not open for asks (10.3). */
export const CYCLE_NOT_OPEN_TEXT = 'This planning cycle is not open for asks.'

/** Finance's edit of a table HR admin sets by import (7.4, C14): the plan's words. */
export const SET_BY_IMPORT_TEXT = 'Set by import.'

/** A split or move naming an org that is not a direct sub-org of the parent (`env.subOrgsOf`). */
export const NOT_A_SUB_ORG_TEXT = 'Pick sub-orgs that report straight to this org.'

/** A split or move on an org that has no target yet. */
export const NO_PARENT_TARGET_TEXT = 'This org has no target to split yet. Finance sets it first.'

/** A move of heads that is not a whole number above 0. */
export const MOVE_HEADS_TEXT = 'Move a whole number of heads, 1 or more.'

/** Replace or Merge with a file that is not a Full file. */
export const NOT_FULL_FILE_TEXT = 'Replace takes a Full file, made in HR admin with Show pay amounts on.'

/** A reason code the request type does not take (REASON_CODES_OF). */
export const REASON_CODE_TEXT = 'Pick one of the reasons this request type takes.'

/** A new role's FTE outside (0, 1]. */
export const FTE_RANGE_TEXT = 'FTE is above 0 and at most 1.'

/** Approve with changes, or an edit of a draft, that changes nothing. */
export const NO_REQUEST_CHANGE_TEXT = 'Pick at least one change.'

/** Mark reviewed on exceptions all reviewed already. */
export const ALREADY_REVIEWED_TEXT = 'These exceptions are marked reviewed already.'

/** An assumption edit with no value. */
export const NO_VALUE_TEXT = 'Give at least one value.'

/** setFx with no rate. */
export const NO_RATE_TEXT = 'Give at least one rate.'

/** An FX rate that is not a currency code, a rate set, a month and a value above 0. */
export const FX_RATE_TEXT = 'A rate needs a currency code, a rate set, a month and a value above 0.'

/* ───────────── notices ───────────── */

export const draftSavedNotice = (requestId: string): string => `Draft ${requestId} saved.`
export const draftUpdatedNotice = (requestId: string): string => `Draft ${requestId} updated.`
export const submittedNotice = (requestId: string): string => `Request ${requestId} submitted.`
export const submittedForNotice = (requestId: string, name: string): string =>
  `Request ${requestId} submitted for ${name}.`
export const withdrawnNotice = (requestId: string): string => `Request ${requestId} withdrawn.`
/** A step decided with more to come, or the last step: the request is approved. */
export const approvedNotice = (requestId: string, done: boolean): string =>
  done
    ? `Request ${requestId} approved.`
    : `Your step on ${requestId} is approved. It moves to the next step.`
export const approvedWithChangesNotice = (requestId: string): string =>
  `Request ${requestId} approved with changes. The requester sees each change with your reason.`
export const sentBackNotice = (requestId: string): string =>
  `Request ${requestId} sent back to the requester.`
export const rejectedNotice = (requestId: string): string => `Request ${requestId} rejected.`
export const COMMENT_NOTICE = 'Comment added.'
export const freezeExceptionNotice = (requestId: string): string =>
  `Freeze exception added to ${requestId}. It adds a Finance step.`
export const seatChangedNotice = (positionId: string): string => `Seat ${positionId} changed in Working.`
export const transferDraftNotice = (requestId: string): string => `Transfer ${requestId} saved as a draft.`
export const tradeDraftNotice = (requestId: string): string => `Trade ${requestId} saved as a draft.`
export const freezeSavedNotice = (freezeId: string): string => `Hiring freeze ${freezeId} saved.`
export const versionCreatedNotice = (name: string, fy: string): string => `${name} is the ${fy} Working.`
export const versionLockedNotice = (name: string): string => `${name} is locked. Working stays editable.`
export const reopenedNotice = (name: string, retired: string): string =>
  `${name} is the Working version now. ${retired} is read only.`
export const monthClosedNotice = (monthLabel: string): string => `${monthLabel} is closed.`
export const FX_SAVED_NOTICE = 'FX rates saved in Working.'
export const ASSUMPTIONS_SAVED_NOTICE = 'Assumptions saved in Working.'
export const TARGET_SAVED_NOTICE = 'Target saved.'
export const SPLIT_SAVED_NOTICE = 'Sub-org targets saved.'
export const TARGET_MOVED_NOTICE = 'Target moved.'
export const cycleOpenedNotice = (fy: string): string => `The ${fy} planning cycle is open for asks.`
export const CYCLE_DATES_NOTICE = 'Cycle dates saved.'
export const hrbpReviewDoneNotice = (unit: string): string => `HRBP review is finished for ${unit}.`
export const LEADER_REVIEW_DONE_NOTICE = 'Leader review is finished for your org.'
export const stageMovedNotice = (stage: string): string => `The cycle is at ${stage} now.`
export const RANKING_SAVED_NOTICE = 'Ranking saved.'
export const CUT_LINE_NOTICE = 'Cut line moved.'
export const cycleLockedNotice = (fy: string, approved: number, below: number): string =>
  `The ${fy} cycle is locked: ${approved} ${approved === 1 ? 'ask' : 'asks'} approved, ${below} below the cut line.`
export const cycleReturnedNotice = (stage: string): string => `The cycle went back to ${stage}.`
export const REVIEWED_NOTICE = 'Marked reviewed.'
export const draftsMadeNotice = (n: number): string =>
  `${n} draft ${n === 1 ? 'request' : 'requests'} made for review in Requests > Mine.`
export const WORKSPACE_REPLACED_NOTICE = 'This workspace now holds the file’s data and plan.'
export const WORKSPACE_MERGED_NOTICE = 'The file is merged into this workspace.'

/* ───────────── added in the M3 review fixes (core-platform) ───────────── */

/** B8, R47: a month closes only once the as-of date is on or after its month-end. */
export const closeNotYetText = (monthLabel: string, monthEndLabel: string): string =>
  `${monthLabel} closes once the data is as of ${monthEndLabel} or later.`

/** PV-2: outside HR admin, a closed month's rates are read only (its close holds what it used). */
export const CLOSED_MONTH_RATE_TEXT = 'Rates for a closed month are read only.'

/**
 * PV-3: a Finance set given to `version.create` that 7.4's check cannot price on the new version's
 * months (src/views/finance/engine/edits.ts says the same for an edit it cannot price).
 */
export const CANNOT_PRICE_TEXT = 'This change cannot be priced. Check the rates for the months it reaches.'

/** IN-8: an assumption value outside its table's range, named by the table's label. */
export const assumptionRangeText = (label: string, range: string): string => `${label}: each value ${range}.`

/** Remove override: the row is not an override this version's org row can drop. */
export const NO_OVERRIDE_TEXT = 'There is no override of this value to remove.'

/** Remove override: nothing above the org sets the key, so taking its row back would leave no value. */
export const NO_PARENT_VALUE_TEXT = 'Nothing above this org sets this value, so its own value stays.'

/** Remove override: the org's value is its parent's again. */
export const OVERRIDE_REMOVED_NOTICE = 'Override removed. The value is its parent’s again.'

/** UI-8: a unit's head org takes its unit's target, so a split or move never sets one for it. */
export const UNIT_HEAD_TARGET_TEXT = 'This org heads its unit, so its target is the unit’s. Set it there.'

/** PV-6, UI-3: a file's job title or version name with an amount (managers read both); nothing imported. */
export const FILE_AMOUNT_TEXT =
  'A job title or version name in this file mentions an amount, and managers read them. Nothing was imported.'

/**
 * M4 recheck (B9-a): a Full file with no datasets whose plan state was made on another sample (the
 * "Changes on the earlier sample" file) is never laid over this one by Replace or Merge.
 */
export const EARLIER_SAMPLE_FILE_TEXT =
  'This file was made on an earlier sample, so its changes stay in the file. Nothing was imported.'
/** The same for a file with no datasets made on other data than this workspace holds. */
export const OTHER_DATA_FILE_TEXT =
  'This file was made on other data and carries none of it, so its changes stay in the file. Nothing was imported.'

/* ───────────── added in the M3 recheck fixes (fix:attacks) ───────────── */

/**
 * An FX row keyed to one org: the rate table reads company rows only, so an org's FX row would sit
 * in Working unread (and a close would still price it). Refused in every mode.
 */
export const ORG_FX_TEXT = 'FX rates are set for the whole company, not for one org.'
