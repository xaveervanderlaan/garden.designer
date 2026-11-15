import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './styles/global.css'
import App from './App.tsx'
import { registerServiceWorker } from './pwa/serviceWorker'
import { UpdatePrompt } from './pwa/UpdatePrompt'

const updater = registerServiceWorker() // production build only: offline support and updates

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {updater && <UpdatePrompt updater={updater} />}
  </StrictMode>,
)
