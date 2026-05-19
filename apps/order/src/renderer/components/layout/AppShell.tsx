import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ConnectionBanner } from '../ConnectionBanner';

const TITLE_BY_PATH: Array<{ match: RegExp; title: string }> = [
  { match: /^\/orders\/new$/, title: 'Olib ketish' },
  { match: /^\/orders\/[^/]+$/, title: 'Buyurtma' },
  { match: /^\/menu$/, title: 'Menyu' },
  { match: /^\/settings$/, title: 'Sozlamalar' },
  { match: /^\/$/, title: 'Stollar' },
];

function titleFor(pathname: string): string {
  for (const entry of TITLE_BY_PATH) {
    if (entry.match.test(pathname)) {
      return entry.title;
    }
  }
  return 'Chayxana';
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const title = titleFor(location.pathname);

  return (
    <div className="flex h-screen min-h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} />
        <ConnectionBanner />
        <main className="flex-1 overflow-auto p-4 xl:p-6">{children}</main>
      </div>
    </div>
  );
}
