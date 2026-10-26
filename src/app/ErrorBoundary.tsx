/**
 * Keeps one broken view from taking down the shell (the template app's ErrorBoundary.tsx): says what
 * happened and offers a way back. Every view body and page renders behind one, and the folder tabs
 * catch their headlines (src/app/headlineGate.ts). A view still being built throws its contract's
 * stub error (docs/CONTRACTS-M2.md 4; no view is a stub after M3): that one reads "<view> is not part of this
 * build yet." rather than an error. The message names no record and no amount: an engine's error
 * text stays in the console.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, SeverityIcon } from '@/components/ui'
import { pageComing } from './copy'
import { isNotBuilt } from './headlineGate'

interface Props {
  /** Changing this (e.g. the route or the filters) clears a caught error. */
  resetKey: string
  /** Offered as a way out when the error depends on the current filters. */
  onResetFilters?: () => void
  /** What could not be drawn, in the title: "This tab", "This page". */
  what?: string
  /** The view's or page's name, for the line a body still being built shows. */
  label?: string
  children: ReactNode
}

interface State {
  error: Error | null
  key: string
}

/** The words a caught error shows. */
export const errorTitle = (what = 'This tab'): string => `${what} could not be drawn`
export const ERROR_BODY =
  'Something in the data or the current filters stopped it. The other tabs still work. Your data has not changed.'

export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A body still being built is expected; anything else goes to the console with its stack.
    if (!isNotBuilt(error)) console.error('View failed to render', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (isNotBuilt(error))
      return (
        <div className="mt-6 rounded-sheet bg-sheet px-5 py-5">
          <p className="text-body text-ink-2">{pageComing(this.props.label ?? 'This view')}</p>
        </div>
      )
    return (
      <div role="alert" className="mt-6 flex gap-3 rounded-sheet bg-sheet px-5 py-5">
        <SeverityIcon severity="critical" className="mt-1 size-4 shrink-0" />
        <div className="min-w-0">
          <h2 className="cut-head text-title font-semibold">{errorTitle(this.props.what)}</h2>
          <p className="mt-1 max-w-[70ch] text-small text-ink-2">{ERROR_BODY}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            {this.props.onResetFilters && (
              <Button size="sm" variant="ghost" onClick={this.props.onResetFilters}>
                Reset filters
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
