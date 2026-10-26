/**
 * Hiring freezes (docs/PLAN.md 5.2 `freezes`, 10.4, story 4): one freeze on Corporate from
 * 1 Aug 2026, open-ended, with no backfills. It holds Corporate's 3 Open seats in Interviewing and
 * honors the 1 accepted offer (positions.ts plants them). Finance announced it on 24 Jul 2026. Pure.
 */
import type { FreezeRow, ISODate } from '../schema'
import { CORP } from './departments'

export const CORPORATE_FREEZE_ID = 'FRZ-001'
export const CORPORATE_FREEZE_START: ISODate = '2026-08-01'
const ANNOUNCED: ISODate = '2026-07-24'

export function sampleFreezes(): { rows: FreezeRow[]; known: ISODate[] } {
  return {
    rows: [
      {
        freezeId: CORPORATE_FREEZE_ID,
        businessUnit: CORP,
        department: null,
        costCenter: null,
        leaderPositionId: null,
        startDate: CORPORATE_FREEZE_START,
        endDate: null,
        allowBackfill: false,
        reason: 'Corporate cost review while the FY28 plan is set',
      },
    ],
    known: [ANNOUNCED],
  }
}
