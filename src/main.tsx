import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode removed: double-invokes useEffect in dev, which destroys the
// Phaser game instance before its async 'ready' event fires — canvas never renders.
createRoot(document.getElementById('root')!).render(<App />)
