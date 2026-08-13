import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles.css';
import { ComponentsPage } from '@/pages/ComponentsPage';

/**
 * Standalone mount for the design-system gallery.
 *
 * The master renderer only runs inside Electron on Windows, which makes the
 * design system hard to look at anywhere else. This entry builds the same
 * `ComponentsPage` — the real components, the real compiled Tailwind — into a
 * plain page that opens in any browser.
 *
 *   pnpm gallery        → gallery-dist/
 *   pnpm gallery:page   → gallery-dist/blocks-c1-gallery.html (single file)
 */
const container = document.getElementById('root');
if (!container) {
  throw new Error('Gallery mount point #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <ComponentsPage />
  </StrictMode>,
);
