import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ConnectionBanner } from '@/components/feedback/ConnectionBanner';

/**
 * Top-level shell for the admin app. Sidebar left (collapsible 200/60px),
 * Header sticky top (56px), connection banner under header, scroll
 * happens inside <main>. Layout sized for the 1366×768 floor per UI_UX_RULES §2.
 *
 * Migration pattern for pages:
 *   1. Use <PageHeader title="…" actions={…} /> as the first child.
 *   2. Wrap remaining content in <PageContent>.
 *   3. Replace raw <table> with <DataTable>; money/dates with typed cells.
 *   4. Replace custom Modal/ConfirmDialog with shadcn Dialog / ConfirmDialog.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen min-h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <ConnectionBanner />
        <main className="flex-1 overflow-auto p-4 xl:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
