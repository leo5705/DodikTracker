import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (
      event.reason &&
      (String(event.reason).includes('WebSocket') ||
        (typeof event.reason === 'object' &&
          (event.reason.message?.includes('WebSocket') || event.reason.stack?.includes('vite'))))
    ) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
);
