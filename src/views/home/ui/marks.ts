/**
 * This browser's Action center marks (Mark handled and Snooze, saved under `hcp:actions`) as the role
 * homes and My team read them, so their Needs attention leaves out exactly what the Action center
 * and the masthead count leave out (the template app's useHomeItems reads the same marks).
 *
 * The Action center's own store (src/views/actions/ui/store.ts) is a view's ui/ module, which the
 * import rules keep other views from importing, so the saved marks are read here through the
 * Action center's engine (`loadMarks`): when the page opens (marks are set on the Action center
 * page and saved as they are set, so they are in the browser when a home opens), when another tab
 * changes them (the storage event), and once a minute, so a snooze that ends while the page is open
 * ends on screen. Marks the browser refused to save last only on the Action center page.
 */
import { useEffect, useMemo, useState } from 'react'
import type { OpenAction } from '@/views/actions/engine'
import { browserStorage, isOpen, loadMarks, type Marks, STORAGE_KEY } from '@/views/actions/engine/marks'

/** Whether an item is open in this browser (neither handled nor snoozed), as the Action center judges it. */
export type OpenTest = (a: OpenAction) => boolean

export function useOpenTest(): OpenTest {
  const [marks, setMarks] = useState<Marks>(() => loadMarks(browserStorage(), Date.now()))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const reload = () => {
      setNow(Date.now())
      setMarks(loadMarks(browserStorage(), Date.now()))
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) reload()
    }
    // The marks may have changed between the first render and now (the Action center just closed).
    reload()
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    try {
      window.addEventListener('storage', onStorage)
    } catch {
      /* no storage events: the next page open reads the marks again */
    }
    return () => {
      window.clearInterval(tick)
      try {
        window.removeEventListener('storage', onStorage)
      } catch {
        /* nothing to remove */
      }
    }
  }, [])
  return useMemo(() => (a: OpenAction) => isOpen(a, marks, now), [marks, now])
}
