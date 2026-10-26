/**
 * Settings > Official lists (read only in M2): each list in force (business units with their HR
 * business partners, departments, cost centers, locations, levels with their leader-seat marks, the
 * roles), whether it is official or proposed, and how many values it holds. Lists are edited in the
 * Data room's Lists tab.
 */
import { listsInForce } from '@/access/lists'
import { goTo } from '@/components/navigation'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { fmt } from '@/lib/format'
import { useOfficialLists } from '../dictionary'
import { listRows } from './model'
import { closeSettings } from './store'
import { SettingsBlock } from './ui'

export function ListsSection() {
  const ctx = useAnalytics()
  const saved = useOfficialLists((s) => s.state)
  const rows = listRows(listsInForce(saved, ctx.all, ctx.sources))
  return (
    <SettingsBlock
      section="lists"
      intro="The names the data is checked against and the app reads: business units and their HR business partners, leader seats, the roles."
    >
      <ul className="divide-y divide-rule border-y border-rule">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-small font-medium text-ink">{r.label}</span>
              <span className="block text-meta leading-snug text-muted">{r.about}</span>
            </span>
            <span className="text-meta text-ink-2">
              {r.status} · {r.source} · <span className="tnum">{fmt(r.values, 'int')}</span>
            </span>
          </li>
        ))}
      </ul>
      {ctx.access.can('page:data') && (
        <div>
          <Button
            onClick={() => {
              closeSettings()
              goTo('data', 'lists')
            }}
          >
            Edit lists in the Data room
          </Button>
        </div>
      )}
    </SettingsBlock>
  )
}
