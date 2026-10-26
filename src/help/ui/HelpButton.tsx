/**
 * The masthead Help button (`masthead:help`; question-mark icon and the word), which also mounts the
 * Help sheet and the tour layer, and opens Help with the ? key from anywhere outside a text field
 * (`shortcut:help`; the template app's HelpButton.tsx). On phones the masthead hides the button and
 * lists Help in its More menu; the sheet, the tour layer and the ? key stay mounted.
 */
import { useEffect } from 'react'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { HELP_SHEET_TITLE } from '../copy'
import { openHelp, useHelp } from '../store'
import { HelpSheet } from './HelpSheet'
import { IconHelp } from './IconHelp'
import { helpTrigger } from './refs'
import { TourLayer } from './TourLayer'

/** True when the key press belongs to a text field, a select or an editable region. */
export function typing(t: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(t instanceof HTMLElement)) return false
  return (
    !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') ||
    t.isContentEditable
  )
}

function useHelpKey(on: boolean) {
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (typing(e.target)) return
      const { open, tour } = useHelp.getState()
      if (open || tour) return
      e.preventDefault()
      openHelp()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])
}

export function HelpButton() {
  const open = useHelp((s) => s.open)
  const { access } = useAnalytics()
  useHelpKey(access.can('shortcut:help'))
  return (
    <>
      <Button
        ref={helpTrigger}
        data-tour="masthead-help"
        variant={open ? 'secondary' : 'ghost'}
        icon={<IconHelp />}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={HELP_SHEET_TITLE}
        aria-keyshortcuts="?"
        onClick={() => openHelp()}
      >
        <span className="hidden sm:inline">{HELP_SHEET_TITLE}</span>
      </Button>
      <HelpSheet />
      <TourLayer />
    </>
  )
}
