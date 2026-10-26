/** The Forecast metrics' wording from the dictionary, with changed settings noted: the Plan view's helpers. */
export { changedSettingsText, definitionsOf, definitionText } from '@/views/plan/engine/wording'

import { plural } from '@/lib/format'

/** A bridge bar's contributor line: "1 position moved", "12 positions moved" (14.3, review CP-5). */
export const positionsMovedText = (n: number): string => `${plural(n, 'position')} moved`
