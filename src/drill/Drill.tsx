/**
 * Makes any number open what is behind it (docs/PLAN.md 9.5). A counted or weighted number opens
 * its records; a modeled number opens its calculation card. Wrap the number:
 *
 *   <Drill spec={() => drillSpec({ kind: 'positions', title: 'Openings past target start', rows })}>12</Drill>
 *   <Calc spec={() => card}>$6,301.17</Calc>
 *
 * The spec is a function so the rows (or the card) are only gathered when someone clicks.
 *
 * Inside the drill panel (a count in a records table, on a position card or a calculation card) a
 * number opens its records or card on top of what the panel shows, so Back returns to where the
 * reader was. A number whose records are a kind the mode does not list renders as plain text
 * (`drillTarget`, ./kinds.ts). A card always opens: its amounts come from the guard, so a hidden
 * one already reads "—" on it.
 */
import { createContext, type ReactNode, useContext } from 'react'
import { cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import { type CalcSource, resolveCalc } from './calc'
import { drillTarget } from './kinds'
import { openCalc, openDrill, pushCalc, pushDrill } from './store'
import { type DrillSource, resolveDrill } from './types'

export { type DrillSource, resolveDrill } from './types'

/** Open a drill from an event handler (charts' onSelect, table cells). No-op without records. */
export function drill(src: DrillSource): void {
  const spec = resolveDrill(src)
  if (spec) openDrill(spec)
}

/** Open a calculation card from an event handler (a chart mark, a table cell). No-op without a card. */
export function calc(src: CalcSource): void {
  const spec = resolveCalc(src)
  if (spec) openCalc(spec)
}

/** True inside the drill panel: numbers there stack their records instead of replacing the panel. */
const InDrillPanel = createContext(false)

/** Wraps the drill panel's body so the numbers in it open on top of it. */
export function DrillNesting({ children }: { children: ReactNode }) {
  return <InDrillPanel.Provider value>{children}</InDrillPanel.Provider>
}

/** True inside the drill panel (for components that open sheets themselves). */
export const useDrillNested = (): boolean => useContext(InDrillPanel)

/** Dotted underline that firms up on hover: clickable without shouting. */
export const DRILL_CLASS =
  'cursor-pointer rounded-mark underline decoration-dotted decoration-rule-strong decoration-1 underline-offset-[3px] hover:decoration-ink hover:decoration-solid focus-visible:decoration-solid'

export function Drill({
  spec,
  children,
  className,
  label,
}: {
  spec: DrillSource
  children: ReactNode
  className?: string
  /** Accessible name, e.g. "Show the 12 openings". Defaults to "Show the records behind this number". */
  label?: string
}) {
  const nested = useContext(InDrillPanel)
  // A kind the mode does not list is a plain number: no button, no hover, no tab stop.
  const access = useAnalyticsIfAny()?.access
  const target = drillTarget(access, spec)
  if (!target) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      className={cx(DRILL_CLASS, 'text-inherit', className)}
      aria-label={label}
      title={label ?? 'Show the records behind this number'}
      onClick={(e) => {
        e.stopPropagation()
        const s = resolveDrill(target)
        if (s) (nested ? pushDrill : openDrill)(s)
      }}
    >
      {children}
    </button>
  )
}

/** A modeled number that opens its calculation card (docs/PLAN.md 9.5). */
export function Calc({
  spec,
  children,
  className,
  label,
}: {
  spec: CalcSource
  children: ReactNode
  className?: string
  /** Accessible name, e.g. "Show how $6,301.17 is calculated". Defaults to "Show how this number is calculated". */
  label?: string
}) {
  const nested = useContext(InDrillPanel)
  if (!spec) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      className={cx(DRILL_CLASS, 'text-inherit', className)}
      aria-label={label}
      title={label ?? 'Show how this number is calculated'}
      onClick={(e) => {
        e.stopPropagation()
        const s = resolveCalc(spec)
        if (s) (nested ? pushCalc : openCalc)(s)
      }}
    >
      {children}
    </button>
  )
}
