/**
 * The Settings sheet (the template app's SettingsSheet.tsx): slides in from the right, like the
 * records panel, with one home for every preference. Its sections, in order: Mode, Display, Data,
 * Formulas, Official lists, Privacy and This device, each shown where its `settings:<section>`
 * decision shows it (the as-of date, in Data, is HR admin's: docs/PLAN.md 8.3). `openSettings(section)`
 * opens it at a section, and `openSettings(section, focus)` on one control in it. Escape or Close
 * closes it, and focus returns to what opened it.
 *
 * One surface: the sheet tone throughout, sections divided by hairlines, no card inside it. From
 * 1024px the sheet is two panes, the section list on the left (168px) and the sections on the right;
 * narrower, the list is one scrolling row under the title.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { useEffect, useRef } from 'react'
import { IconClose } from '@/components/icons'
import { useAnalytics } from '@/data/context'
import { SECTION_LABEL, SETTINGS_SECTIONS, type SettingsSection } from '@/data/settings'
import { DataSection } from './DataSection'
import { DeviceSection } from './DeviceSection'
import { DisplaySection } from './DisplaySection'
import { FormulasSection } from './FormulasSection'
import { ListsSection } from './ListsSection'
import { ModeSection } from './ModeSection'
import { describeSections } from './model'
import { PrivacySection } from './PrivacySection'
import { closeSettings, useSettingsSheet } from './store'
import { sectionId } from './ui'

/** The element that had focus when the sheet was asked to open (captured before React re-renders). */
let opener: HTMLElement | null = null
if (typeof document !== 'undefined')
  useSettingsSheet.subscribe((s, prev) => {
    if (s.open && s.nonce !== prev.nonce && !prev.open)
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  })

function returnFocus(): HTMLElement | null {
  const back = opener?.isConnected && opener !== document.body ? opener : null
  opener = null
  return back ?? document.querySelector<HTMLElement>('[data-tour="masthead-settings"]')
}

function SectionNav({
  sections,
  onGo,
}: {
  sections: readonly SettingsSection[]
  onGo: (s: SettingsSection) => void
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="border-b border-rule px-5 pt-2 pb-2 lg:w-[168px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-3 lg:pt-1"
    >
      <ul className="-mx-1.5 flex gap-x-0.5 gap-y-0.5 overflow-x-auto [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => (
          <li key={s} className="shrink-0">
            <a
              href={`#${sectionId(s)}`}
              onClick={(e) => {
                e.preventDefault()
                onGo(s)
              }}
              className="inline-flex h-7 items-center rounded-control px-1.5 text-meta font-medium whitespace-nowrap text-ink-2 hover:bg-hover hover:text-ink lg:flex lg:w-full lg:text-small"
            >
              {SECTION_LABEL[s]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Scroll the sheet to a section and put focus on its heading, or on the control named by `focus`
 * (its `data-settings-focus`) when the section has it.
 */
function goToSection(s: SettingsSection, focus?: string | null): boolean {
  const el = document.getElementById(sectionId(s))
  // A section the mode does not show: the sheet opens at its top.
  if (!el) return false
  el.scrollIntoView({ block: 'start' })
  const target = focus ? el.querySelector<HTMLElement>(`[data-settings-focus="${CSS.escape(focus)}"]`) : null
  if (target) {
    target.scrollIntoView({ block: 'nearest' })
    target.focus({ preventScroll: true })
  } else el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  return true
}

/** The sections a mode shows, in order. */
export const shownSections = (can: (surface: string) => boolean): SettingsSection[] =>
  SETTINGS_SECTIONS.filter((x) => can(`settings:${x}`))

export function SettingsSheet() {
  const req = useSettingsSheet()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { access } = useAnalytics()
  const sections = shownSections((s) => access.can(s))
  const shown = (x: SettingsSection) => sections.includes(x)

  // Every open request lands on its section (or the top), even when the sheet is already open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` changes on every request, so the effect runs again
  useEffect(() => {
    if (!req.open) return
    const frame = requestAnimationFrame(() => {
      if (!req.section || !goToSection(req.section, req.focus)) bodyRef.current?.scrollTo({ top: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [req.open, req.nonce, req.section, req.focus])

  return (
    <BDialog.Root open={req.open} onOpenChange={(o) => !o && closeSettings()}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup
          initialFocus={titleRef}
          finalFocus={returnFocus}
          className="fixed top-0 right-0 bottom-0 z-50 flex w-[min(560px,100vw)] flex-col bg-sheet pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0 lg:w-[min(760px,100vw)]"
        >
          <div className="flex items-start gap-2 px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <BDialog.Title
                ref={titleRef}
                tabIndex={-1}
                className="cut-head flex-1 rounded-mark text-section leading-tight font-semibold outline-none focus-visible:outline-2 focus-visible:outline-focus"
              >
                Settings
              </BDialog.Title>
              <BDialog.Description className="mt-0.5 text-small text-ink-2">
                {describeSections(sections)}
              </BDialog.Description>
            </div>
            <BDialog.Close
              aria-label="Close settings"
              className="-mr-1.5 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose />
            </BDialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-t border-rule lg:flex-row">
            <SectionNav sections={sections} onGo={(s) => goToSection(s)} />
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
              {shown('mode') && <ModeSection />}
              {shown('display') && <DisplaySection />}
              {shown('data') && <DataSection />}
              {shown('formulas') && <FormulasSection />}
              {shown('lists') && <ListsSection />}
              {shown('privacy') && <PrivacySection />}
              {shown('device') && <DeviceSection />}
            </div>
          </div>
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  )
}
