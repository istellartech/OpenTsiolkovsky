import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Fonts are bundled (no request to a font CDN); Plex Sans JP is split by
// unicode-range, so browsers only download the glyph subsets a page uses.
import '@fontsource/ibm-plex-sans-jp/400.css'
import '@fontsource/ibm-plex-sans-jp/500.css'
import '@fontsource/ibm-plex-sans-jp/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
