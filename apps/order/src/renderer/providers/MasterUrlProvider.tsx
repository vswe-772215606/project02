import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearMasterUrl, getMasterUrl, setMasterUrl } from '../lib/env';

type MasterUrlContextValue = {
  loading: boolean;
  masterUrl: string | null;
  setMasterUrl: (url: string) => Promise<void>;
  clearMasterUrl: () => Promise<void>;
};

const MasterUrlContext = createContext<MasterUrlContextValue | null>(null);

export function MasterUrlProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [masterUrl, setMasterUrlState] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
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
