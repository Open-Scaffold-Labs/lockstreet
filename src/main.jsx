import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import './styles/index.css';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_KEY) {
  // Fail loud and early — the rest of the app assumes Clerk is mounted.
  // Copy .env.example to .env.local and fill in VITE_CLERK_PUBLISHABLE_KEY.
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is missing. See README → "Keys you have to provide".');
}

// Register the service worker for Web Push (best-effort, no-op on insecure origins).
if ('serviceWorker' in navigator && typeof window !== 'undefined' && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW register failed', e));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>
);
