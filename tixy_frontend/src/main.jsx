import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode desactivado — causa doble ejecución de efectos en dev
// que dispara requests antes de que el token esté en localStorage
createRoot(document.getElementById('root')).render(
  <App />
)
