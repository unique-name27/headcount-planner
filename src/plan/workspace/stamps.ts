/**
 * Times in workspace files (docs/PLAN.md 5.5, 10.1; M3 review IN-12). A request's `updatedAt`,
 * `submittedAt`, step and comment times are ISO dates or date-times: "2026-09-23",
 * "2026-09-23T14:05" (the sample's manager files), "2026-09-30T09:01:00.000Z" (what the app writes),
 * or one with an offset. validate.ts refuses any other text, and merge.ts compares them as times
 * (`stampMs`), never as text. A stamp with no zone reads as UTC, so a merge never depends on the
 * machine's time zone. Pure.
 */

/** An ISO date, or a date-time to the minute, second or fraction, with 'Z', an offset or no zone. */
const ISO_STAMP =
  /^(\d{4})-(\d{2})-(\d{2})(T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,9})?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?)?$/

/** A stamp with no zone ("2026-09-23T14:05", "2026-09-23"). */
const NO_ZONE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/

/** Whether text is an ISO date or date-time this app reads, on a real calendar day. */
export function isIsoStamp(text: string): boolean {
  const m = ISO_STAMP.exec(text)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const day = new Date(Date.UTC(y, mo - 1, d))
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d
}

/**
 * A stamp as milliseconds since 1970: an offset or 'Z' as written, a stamp with no zone as UTC (never
 * the machine's zone), and '' or anything unreadable as the earliest time, so it loses every tie.
 */
export function stampMs(stamp: string | null | undefined): number {
  if (!stamp) return Number.NEGATIVE_INFINITY
  const text = NO_ZONE.test(stamp) ? (stamp.length === 10 ? `${stamp}T00:00Z` : `${stamp}Z`) : stamp
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}
