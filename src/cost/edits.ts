/**
 * 7.4's edit rule (docs/PLAN.md 7.4 "Assumption edits are differences too", C14, R35, R37; M3 freeze):
 * a Finance assumption edit, or an assumption set given to `version.create`, is refused with "This
 * change would move cost for fewer than 5 costed people." when the positions whose Working or
 * forecast amount it changes (its contributors, 7.2 rule 5: an amount that differs by more than half
 * a cent) number 1 to 4 in all, or 1 to 4 in any one month within one part of Finance's fold: a
 * shown cost center, or one department × country share of a unit's Other. Each part lies inside one
 * department, country and currency, so no sum or difference of allowed edits moves 1 to 4 people in
 * a shown figure. Pure; the minimum is the locked `cost.guard.minCosted`, never a constant.
 *
 * The lines before and after an edit are computed by src/views/finance/engine/edits.ts
 * `assumptionEditCheck` (Working and the forecast, through the Plan and Forecast engines); this file
 * only counts their movers by part and month.
 *
 * Readings taken here (finance-ui builder, M3):
 *  - A move's `month` names the figure series it moves in, so the caller keeps Working's plan lines
 *    and the forecast apart ('2026-10' and 'forecast 2026-10'): each is its own shown figure, and
 *    4 people moved in a forecast month must not hide behind 5 moved in the plan's month. "In all"
 *    counts distinct positions over every series.
 *  - Ties for the smallest count go to the first part, then the first month, in sorted order, so the
 *    answer never depends on the order of the moves.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the finance-ui builder fills the bodies and owns
 * src/cost/assumptionEdits.slow.test.ts's two `it.todo` cases.
 */
/** 7.4's refusal, with the minimum in force: "This change would move cost for fewer than 5 costed people." */
export const editRefusedText = (min: number): string =>
  `This change would move cost for fewer than ${min} costed people.`

/** One position whose amount an edit moves, in one month, and the part of Finance's fold it sits in. */
export interface EditMove {
  positionId: string
  month: string
  /**
   * The fold part: a shown cost center ('<unit>|center|<costCenter>') or a department × country share
   * of the unit's Other ('<unit>|other|<department>|<country>'), from src/cost/fold.ts `financeFold`.
   */
  part: string
}

/** The contributors an edit moves, counted the ways 7.4 counts them. */
export interface EditMovers {
  /** Distinct positions moved, over every month and part. */
  total: number
  /** The smallest count of 1 or more in one month of one part, with where; null when none moved. */
  smallest: { part: string; month: string; count: number } | null
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The movers of an edit, by part and month (pure counting over `moves`): the distinct positions
 * over every move, and the smallest count of 1 or more in one month of one part (ties go to the
 * first part, then the first month, in sorted order, so the answer never depends on the order of
 * `moves`).
 */
export function editMovers(moves: readonly EditMove[]): EditMovers {
  const all = new Set<string>()
  const cells = new Map<string, { part: string; month: string; ids: Set<string> }>()
  for (const m of moves) {
    all.add(m.positionId)
    const key = JSON.stringify([m.part, m.month])
    let cell = cells.get(key)
    if (!cell) {
      cell = { part: m.part, month: m.month, ids: new Set() }
      cells.set(key, cell)
    }
    cell.ids.add(m.positionId)
  }
  let smallest: EditMovers['smallest'] = null
  const sorted = [...cells.values()].sort((a, b) => cmp(a.part, b.part) || cmp(a.month, b.month))
  for (const c of sorted)
    if (!smallest || c.ids.size < smallest.count)
      smallest = { part: c.part, month: c.month, count: c.ids.size }
  return { total: all.size, smallest }
}

/** 1 to `min − 1`: a count an edit may never move. */
const isShort = (n: number, min: number): boolean => n > 0 && n < min

/**
 * The refusal for an edit's moves, or null when it may go through: refused when 1 to `min − 1`
 * positions move in all, or in one month of one part.
 */
export function editRefusal(moves: readonly EditMove[], min: number): string | null {
  const m = editMovers(moves)
  if (isShort(m.total, min)) return editRefusedText(min)
  if (m.smallest && isShort(m.smallest.count, min)) return editRefusedText(min)
  return null
}
