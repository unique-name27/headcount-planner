/**
 * First frame while the datasets and the plan state load (the template app's Loading.tsx): the real
 * band with the working mark and the folder tabs (numbers not yet known, so left blank), and the
 * first sheets at their final size with their titles. One quiet status line, no skeleton blocks, so
 * nothing flashes or jumps. The mark's seats pulse with CSS (`mark-seat`), held still for people who
 * prefer reduced motion.
 */
import { Pending } from '@/components/Pending'
import { cx } from '@/components/ui'
import { VIEW_KEYS, VIEW_LABEL } from '@/data/schema'
import { APP_NAME, DOM_IDS } from './brand'
import { LOADING_LINE } from './copy'
import { Mark } from './Mark'

/** The tabs a first visit shows (My team is Manager mode's own home, not a tab elsewhere). */
export const LOADING_TABS = VIEW_KEYS.filter((k) => k !== 'team').map((k) => ({
  key: k,
  label: VIEW_LABEL[k],
}))

export function LoadingShell() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <header className="band">
        <div className="mx-auto max-w-[1440px] px-(--gutter)">
          <div className="flex h-[52px] items-center gap-2 pt-1">
            <Mark working />
            <span className="cut-head text-[18px] leading-none font-bold tracking-[-0.02em]">{APP_NAME}</span>
          </div>
          <div
            aria-hidden="true"
            className="-mx-(--gutter) flex items-end gap-1.5 overflow-hidden px-(--gutter) pt-1"
          >
            {LOADING_TABS.map((v, i) => (
              <div
                key={v.key}
                className={cx(
                  'flex w-[184px] shrink-0 flex-col rounded-t-sheet px-3.5 pt-2.5 pb-3',
                  i === 0 ? 'on-desk bg-page' : 'mt-1 bg-tab-idle',
                )}
              >
                <span className="cut-tab truncate text-small leading-tight font-semibold text-ink-2">
                  {v.label}
                </span>
                <span className="mt-2 block h-5" />
                <span className="mt-1 block h-4" />
              </div>
            ))}
          </div>
        </div>
      </header>
      <main id={DOM_IDS.main} className="flex-1">
        <div className="mx-auto max-w-[1440px] px-(--gutter) pb-16">
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-12 max-md:*:col-span-full">
            <Pending
              message={LOADING_LINE}
              frames={[
                // A home's first sheets: the hero beside the key figures, then the lead figure beside Needs attention.
                { title: 'Where things stand', span: 4, height: 223 },
                { title: 'Key figures', span: 8, height: 223 },
                { title: 'Heads by month', span: 8, height: 420 },
                { title: 'Needs attention', span: 4, height: 420 },
              ]}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
