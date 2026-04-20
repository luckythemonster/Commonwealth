import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { worldEngine } from './engine/WorldEngine'

// Initialize world state before React renders so HUD JSX can read getState() safely.
// StrictMode removed: double-invokes useEffect in dev, destroying Phaser before init.
worldEngine.initWorld()
createRoot(document.getElementById('root')!).render(<App />)
