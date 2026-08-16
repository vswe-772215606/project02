import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import './styles.css';

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

window.addEventListener('error', (event) => {
  const location = `${event.filename || 'unknown'}:${event.lineno}:${event.colno}`;
  const details = event.error ? formatUnknownError(event.error) : event.message;
  console.error(`[window.error] ${location}\n${details}`);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error(`[window.unhandledrejection] ${formatUnknownError(event.reason)}`);
});

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
      <Toaster richColors position="bottom-right" />
    </AppErrorBoundary>
  </React.StrictMode>,
);
