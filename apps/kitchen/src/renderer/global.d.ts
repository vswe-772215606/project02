interface Window {
  serverConfig: {
    getMasterUrl: () => Promise<string | null>;
    setMasterUrl: (url: string) => Promise<true>;
    clearMasterUrl: () => Promise<true>;
  };
}
