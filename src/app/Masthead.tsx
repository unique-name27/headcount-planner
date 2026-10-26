/**
 * Top line of the band (the template app's Masthead.tsx): the wordmark, whose data this is, the tags
 * that say how this tab stands ("Read only: Headcount Planner is open in another tab." in a reader
 * tab, docs/PLAN.md 5.4; "Pay amounts shown · Hide" while HR admin's switch is on, 7.5), the as-of
 * date, the Mode button (Mode and Acting as, 8.1), the Action center with its count, Audit, the Data
 * room, the Workspace files (M3), Settings and Help. Each button follows its `masthead:*` decision.
 *
 * Phones (under 768px) keep one row beside the wordmark: Mode, Actions, Settings and a "More" menu
 * holding Audit, the Data room and Help.
 */
import { Component, type ReactNode, type SVGProps, useState } from 'react'
import { HIDE_PAY, PAY_SHOWN_TAG } from '@/access/copy'
import { HOME_LABEL } from '@/access/modes'
import { Dialog } from '@/components/Dialog'
import {
  IconDatabase,
  IconDownload,
  IconEye,
  IconFile,
  IconGear,
  IconLock,
  IconMore,
} from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Button, cx, Menu, type MenuItem, Popover, Tag, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample/base'
import { homeView, READ_ONLY_NOTE, useStore } from '@/data/store'
import { openHelp } from '@/help/store'
import { HelpButton } from '@/help/ui/HelpButton'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { useActions } from '@/views/actions'
import { WorkspaceMenu } from '@/views/data/ui/WorkspaceMenu'
import { APP_NAME } from './brand'
import { companyLine, uploadedCount } from './exportMeta'
import { Mark } from './Mark'
import { ModeButton } from './ModeMenu'
import { openSettings, useSettingsSheet } from './settings/store'

/** Phones: the buttons beside the wordmark sit closer (8px sides), so they share the wordmark's row. */
const PHONE_BUTTON = 'max-sm:px-2'

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="cut-head text-[18px] leading-none font-bold tracking-[-0.02em] text-ink">
        {APP_NAME}
      </span>
    </span>
  )
}

/** Pay amounts are a per-session decision: while they are on, the band says so and offers a way back. */
export function PayShownTag() {
  const setShowPay = useStore((s) => s.setShowPay)
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-chip bg-sheet-3 text-label font-medium whitespace-nowrap text-ink">
      <span className="flex items-center gap-1 pr-1.5 pl-1">
        <IconEye className="size-3.5 shrink-0" />
        {PAY_SHOWN_TAG}
      </span>
      <button
        type="button"
        onClick={() => setShowPay(false)}
        aria-label="Hide pay amounts"
        className="h-full rounded-r-chip px-1.5 font-semibold shadow-[inset_1px_0_0_var(--rule-strong)] hover:bg-hover active:bg-press"
      >
        {HIDE_PAY}
      </button>
    </span>
  )
}

/** Another tab holds the write lock: this one shows everything and changes nothing. */
export function ReadOnlyTag() {
  return (
    <span
      role="status"
      className="inline-flex h-5 min-w-0 shrink items-center gap-1 rounded-chip bg-sheet-3 px-1.5 text-label font-medium text-ink"
    >
      <IconLock className="size-3.5 shrink-0" />
      <span className="truncate">{READ_ONLY_NOTE}</span>
    </span>
  )
}

/** A tray with a check: open items waiting on someone. 16px, 1.5px stroke like the icon set. */
function IconActions(p: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      <path d="M2.5 9.5h3l1 1.5h3l1-1.5h3" />
      <path d="M2.5 9.5 4 3.5h8l1.5 6v3h-11z" />
      <path d="m6.2 6.4 1.3 1.2 2.4-2.4" />
    </svg>
  )
}

/** The count beside "Actions": open items, and how many of them are critical. */
interface ActionCounted {
  count: number
  critical: number
}

/** The Actions button, with the count when the Action center can give one. */
function ActionsButtonView({ counted }: { counted: ActionCounted | null }) {
  const { access } = useAnalytics()
  const onActions = useStore((s) => s.route.view === 'actions')
  const lists = access.mode !== 'hr-admin'
  const what = lists ? 'need attention' : 'open'
  const tip = !counted
    ? 'Open items from every view'
    : lists
      ? `${fmt(counted.count, 'int')} ${counted.count === 1 ? 'item needs' : 'items need'} attention${counted.critical ? `, ${fmt(counted.critical, 'int')} critical` : ''}`
      : `${fmt(counted.count, 'int')} open ${counted.count === 1 ? 'item' : 'items'}${counted.critical ? `, ${fmt(counted.critical, 'int')} critical` : ''}`
  return (
    <Tip content={tip} side="bottom">
      <Button
        data-tour="masthead-actions"
        variant={onActions ? 'secondary' : 'ghost'}
        icon={<IconActions />}
        className={PHONE_BUTTON}
        aria-current={onActions ? 'page' : undefined}
        aria-label={
          counted
            ? `Actions, ${fmt(counted.count, 'int')} ${what}${counted.critical ? `, ${fmt(counted.critical, 'int')} critical` : ''}`
            : 'Actions'
        }
        onClick={() => goTo('actions')}
      >
        <span className="hidden sm:inline">Actions</span>
        {counted && (
          <span className="tnum min-w-5 rounded-chip bg-sheet-3 px-1 text-center text-meta leading-5 font-semibold text-ink">
            {fmt(counted.count, 'int')}
          </span>
        )}
      </Button>
    </Tip>
  )
}

/**
 * The count is the Action center's own (docs/PLAN.md 9.6; the template app's `useOpenActionCount`):
 * a role mode counts its Needs attention, HR admin every open item, over the items open in this
 * browser (handled and snoozed ones left out), so the number always matches the page.
 */
function CountedActionsButton() {
  const m = useActions()
  return <ActionsButtonView counted={{ count: m.count, critical: m.critical }} />
}

/**
 * The Action center reads every view's items, so one that fails on odd data leaves the count out
 * rather than the masthead.
 */
class CountBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    console.error('The Action center count failed', error)
  }
  render() {
    return this.state.failed ? <ActionsButtonView counted={null} /> : this.props.children
  }
}

function ActionsButton() {
  return (
    <CountBoundary>
      <CountedActionsButton />
    </CountBoundary>
  )
}

/**
 * The Workspace control (`masthead:workspace`, M3): the files this mode saves and opens (Save a
 * Shareable file, Export requests, Export for a manager, Open a shared file, Import requests, and in
 * HR admin the Full file and Import), each item by its own action's decision in the menu itself
 * (src/views/data/ui/WorkspaceMenu.tsx). Outside HR admin the control is limited: its tip says so.
 */
function WorkspaceButton() {
  const { access } = useAnalytics()
  const [open, setOpen] = useState(false)
  const d = access.decide('masthead:workspace')
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width={340}
      title="Workspace"
      trigger={
        <Button
          data-tour="masthead-workspace"
          className={PHONE_BUTTON}
          variant={open ? 'secondary' : 'ghost'}
          icon={<IconDownload />}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Workspace"
          title={d.access === 'limited' ? d.how : undefined}
        >
          <span className="hidden sm:inline">Workspace</span>
        </Button>
      }
    >
      <WorkspaceMenu onClose={() => setOpen(false)} />
    </Popover>
  )
}

/** Phones only: the masthead buttons that do not fit beside the wordmark, in one menu. */
function MoreMenu({
  uploaded,
  total,
  onWorkspace,
}: {
  uploaded: number
  total: number
  onWorkspace: () => void
}) {
  const { access } = useAnalytics()
  const items: MenuItem[] = []
  if (access.can('masthead:workspace'))
    items.push({ label: 'Workspace', icon: <IconDownload />, onSelect: onWorkspace })
  if (access.can('masthead:audit'))
    items.push({ label: 'Audit', icon: <IconFile />, onSelect: () => goTo('audit') })
  if (access.can('masthead:data'))
    items.push({
      label: 'Data room',
      icon: <IconDatabase />,
      hint: `${uploaded} of ${total} uploaded`,
      onSelect: () => goTo('data'),
    })
  if (access.can('masthead:help')) items.push({ label: 'Help', hint: '?', onSelect: () => openHelp() })
  if (!items.length) return null
  return (
    <Menu
      width={248}
      items={items}
      trigger={
        <Button
          data-tour="masthead-more"
          variant="ghost"
          icon={<IconMore />}
          aria-label="More"
          className={cx('md:hidden', PHONE_BUTTON)}
        />
      }
    />
  )
}

/** Shown from 768px; on phones the item is in the More menu. A wrapper keeps any sheet it mounts. */
const WIDE_ONLY = 'contents max-md:[&>button]:hidden'

export function Masthead() {
  const ctx = useAnalytics()
  const { access } = ctx
  const onDataRoom = useStore((s) => s.route.view === 'data')
  const onAudit = useStore((s) => s.route.view === 'audit')
  // The switch and the lock are read from the store, so "Hide" and a promotion change the band at once.
  const showPayTag = useStore((s) => s.showPay) && access.can('masthead:pay-tags') && access.can('pay:switch')
  const readOnly = useStore((s) => s.readOnly) && access.can('masthead:read-only')
  const settingsOpen = useSettingsSheet((s) => s.open)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const { uploaded, total } = uploadedCount(ctx.sources)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 pb-2 md:gap-x-4">
      <button
        type="button"
        onClick={() => goTo(homeView())}
        aria-label={`${APP_NAME}, go to ${HOME_LABEL[access.mode]}`}
        className="-ml-1 rounded-control px-1 py-0.5 hover:bg-hover"
      >
        <Wordmark />
      </button>
      <div className="order-last flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
        <span aria-hidden="true" className="hidden h-4 w-px bg-rule-strong sm:block" />
        {access.can('masthead:company') && (
          <span className="truncate text-small text-ink-2">{companyLine(ctx.isSample, SAMPLE_COMPANY)}</span>
        )}
        {ctx.isSample && <Tag>Sample data</Tag>}
        {showPayTag && <PayShownTag />}
        {readOnly && <ReadOnlyTag />}
      </div>
      {/* Phones keep these on the wordmark's row (the rest are in More). Wraps onto a second row only
          when even those do not fit (very large text), so the page never scrolls sideways. */}
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1 max-md:-mr-1">
        <span className="mr-2 hidden text-meta text-muted md:inline">As of {formatDate(ctx.asOf)}</span>
        {access.can('masthead:mode') && <ModeButton />}
        {access.can('masthead:actions') && <ActionsButton />}
        {access.can('masthead:audit') && (
          <Button
            className="max-md:hidden"
            data-tour="masthead-audit"
            variant={onAudit ? 'secondary' : 'ghost'}
            icon={<IconFile />}
            aria-current={onAudit ? 'page' : undefined}
            onClick={() => goTo('audit')}
          >
            <span className="hidden sm:inline">Audit</span>
          </Button>
        )}
        {access.can('masthead:data') && (
          <Button
            className="max-md:hidden"
            data-tour="masthead-data"
            variant={onDataRoom ? 'secondary' : 'ghost'}
            icon={<IconDatabase />}
            aria-current={onDataRoom ? 'page' : undefined}
            aria-label={`Data room, ${uploaded} of ${total} uploaded`}
            onClick={() => goTo('data')}
          >
            <span className="hidden sm:inline">Data room</span>
            <span className={cx('hidden font-normal xl:inline', onDataRoom ? 'text-ink-2' : 'text-muted')}>
              {uploaded} of {total} uploaded
            </span>
          </Button>
        )}
        {access.can('masthead:workspace') && (
          <span className={WIDE_ONLY}>
            <WorkspaceButton />
          </span>
        )}
        {access.can('masthead:settings') && (
          <Button
            data-tour="masthead-settings"
            className={PHONE_BUTTON}
            variant={settingsOpen ? 'secondary' : 'ghost'}
            icon={<IconGear />}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            aria-label="Settings"
            onClick={() => openSettings()}
          >
            <span className="hidden sm:inline">Settings</span>
          </Button>
        )}
        {access.can('masthead:help') && (
          <span className={WIDE_ONLY}>
            <HelpButton />
          </span>
        )}
        <MoreMenu uploaded={uploaded} total={total} onWorkspace={() => setWorkspaceOpen(true)} />
        {/* Phones open the Workspace menu from More, in a dialog. */}
        <Dialog title="Workspace" open={workspaceOpen} onOpenChange={setWorkspaceOpen} width={420}>
          <WorkspaceMenu onClose={() => setWorkspaceOpen(false)} />
        </Dialog>
      </div>
    </div>
  )
}
