import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Self-host Courier Prime via @fontsource so the title-page preview
// renders the industry-standard typography even when the user is
// offline. Only the regular weight is needed — the preview never
// bolds the screenplay font.
import '@fontsource/courier-prime/400.css';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
