import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const isDevHost = import.meta.env.DEV || window.location.hostname.startsWith('ais-dev-');
  if (isDevHost) {
    void (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister().catch(() => false)));
      } catch {}
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.includes('workbox') || k.includes('precache') || k.includes('erp-pages'))
              .map((k) => caches.delete(k).catch(() => false))
          );
        }
      } catch {}
      if (window.location.pathname === '/app') {
        window.history.replaceState({}, '', '/' + window.location.search + window.location.hash);
      }
    })();
  } else {
    registerSW({ immediate: true });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
);
