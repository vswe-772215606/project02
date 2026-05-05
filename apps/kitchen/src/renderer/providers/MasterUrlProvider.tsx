import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearMasterUrl, getMasterUrl, setMasterUrl } from '../lib/env';

const LEGACY_STORAGE_KEY = 'chayxana-kitchen-settings';

type MasterUrlContextValue = {
  loading: boolean;
  masterUrl: string | null;
  setMasterUrl: (url: string) => Promise<void>;
  clearMasterUrl: () => Promise<void>;
};

const MasterUrlContext = createContext<MasterUrlContextValue | null>(null);

async function migrateLegacyServerUrl(): Promise<void> {
  const fileUrl = await window.serverConfig.getMasterUrl();
  if (fileUrl) {
    return;
  }

  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) {
    return;
  }

  try {
    const parsed = JSON.parse(legacyRaw) as { state?: { serverUrl?: unknown } };
    const legacyUrl = parsed?.state?.serverUrl;
    if (typeof legacyUrl === 'string' && legacyUrl.length > 0) {
      await setMasterUrl(legacyUrl);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    // Ignore invalid legacy payloads.
  }
}

export function MasterUrlProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [masterUrl, setMasterUrlState] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        await migrateLegacyServerUrl();
        const resolvedUrl = await getMasterUrl();
        if (active) {
          setMasterUrlState(resolvedUrl);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<MasterUrlContextValue>(() => ({
    loading,
    masterUrl,
    setMasterUrl: async (url: string) => {
      await setMasterUrl(url);
      setMasterUrlState(url);
    },
    clearMasterUrl: async () => {
      await clearMasterUrl();
      setMasterUrlState(null);
    },
  }), [loading, masterUrl]);

  return <MasterUrlContext.Provider value={value}>{children}</MasterUrlContext.Provider>;
}

export function useMasterUrl(): MasterUrlContextValue {
  const value = useContext(MasterUrlContext);
  if (!value) {
    throw new Error('useMasterUrl must be used within MasterUrlProvider');
  }

  return value;
}
