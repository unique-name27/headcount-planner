import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { registerSample } from './app/boot'
import { applyTheme } from './app/useShell'
import { useStore } from './data/store'
import './styles/index.css'

// Pin a saved light or dark choice before the first paint so the page never flashes the other theme.
applyTheme(useStore.getState().theme)

// The sample arrives the way real data does: the generated datasets, then the raw extracts through
// the import pipeline with their confirmations and certifications (src/data/sample/raw). The store
// awaits the starter state on init; the full import follows in the background. Plan state starts
// from the sample's own plan (src/app/planState.ts).
registerSample()

const root = document.getElementById('root')
if (!root) throw new Error('The page has no #root element.')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
