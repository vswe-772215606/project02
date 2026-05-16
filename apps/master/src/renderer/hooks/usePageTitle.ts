import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui.store';

/**
 * Page components call this once at mount to publish the page title for the
 * Header. The title is cleared automatically on unmount so the Header doesn't
 * keep showing a stale value during route transitions.
 */
export function usePageTitle(title: string) {
  const setPageTitle = useUIStore((s) => s.setPageTitle);
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle('');
  }, [title, setPageTitle]);
}
