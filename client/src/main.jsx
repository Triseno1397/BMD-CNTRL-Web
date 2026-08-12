import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode disabled for development - causes double WebSocket connections
createRoot(document.getElementById('root')).render(
  <App />
)
