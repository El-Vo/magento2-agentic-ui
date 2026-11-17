import React from 'react'
import ReactDOM from 'react-dom/client'
// DB UI (github.com/db-ui): Design-Tokens + Basis-Styles aus @db-ui/core
// (url()-Assets werden per Vite-Plugin neutralisiert, s. vite.config.ts)
import '@db-ui/core/dist/css/db-ui-core.vars.css'
import '@db-ui/core/dist/css/db-ui-core.general.css'
// @db-ui/react-elements registriert beim Import die Web Components (defineCustomElements)
import '@db-ui/react-elements'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
