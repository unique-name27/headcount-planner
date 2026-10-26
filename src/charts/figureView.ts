/**
 * Ask a figure on screen to show its chart or its table (a tour step or a link): dispatch this event on the figure's element with `detail: { table: boolean }`. A figure
 * without a table toggle ignores it.
 */
export const FIGURE_VIEW_EVENT = 'figure:view'
