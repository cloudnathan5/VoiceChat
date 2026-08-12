import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { installDemoApi } from './lib/demo-api.js'

// There is no server, so `/api/*` is answered from localStorage. Installed
// before render, comfortably ahead of the first request — App issues those
// from an effect.
installDemoApi()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
