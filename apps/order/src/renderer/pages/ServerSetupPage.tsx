import { useEffect, useState } from 'react';
import { checkServerHealth, getErrorMessage, normalizeUrl } from '../lib/network';
import { useMasterUrl } from '../providers/MasterUrlProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Wifi } from 'lucide-react';

export function ServerSetupPage() {
  const { setMasterUrl } = useMasterUrl();
  const [input, setInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [discovered, setDiscovered] = useState<string | null>(null);

  // Poll the main process for the mDNS-discovered URL. The discovery
  // browser is already running (started in app.whenReady), so this just
  // checks "have you seen one yet?" every second.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const url = await window.discovery?.getMasterUrl?.();
        if (!cancelled && url) setDiscovered(url);
      } catch { /* discovery may not exist on older builds */ }
    };
    void tick();
    const interval = setInterval(() => void tick(), 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const connectTo = async (url: string) => {
    setError('');
    setTesting(true);
    try {
      await checkServerHealth(url);
      await setMasterUrl(url);
    } catch (err) {
      const reason = getErrorMessage(err);
      setError(
        `Ulanib bo'lmadi: ${url}\nServer yoqilganligini va IP to'g'riligini tekshiring.\nXatolik: ${reason}`,
      );
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    const url = normalizeUrl(input);
    if (!url) {
      setError('Server manzilini kiriting');
      return;
    }
    await connectTo(url);
  };

  const handleUseDiscovered = async () => {
    if (!discovered) return;
    await connectTo(discovered);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-primary text-center mb-2">Chayxana Buyurtma</h1>
        <h2 className="text-base font-semibold text-foreground text-center mb-2">
          Master server manzili
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
          Master kompyuterning IP manzilini kiriting.
          <br />
          <span className="font-semibold text-foreground">Masalan: 192.168.1.50</span>
        </p>

        <div className="space-y-3">
          {discovered && (
            <div className="rounded-md border border-success/40 bg-success/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-success">
                <Wifi className="h-4 w-4" />
                Avtomatik topildi
              </div>
              <p className="text-xs text-muted-foreground tabular-nums break-all">{discovered}</p>
              <Button
                size="sm"
                className="w-full"
                onClick={() => void handleUseDiscovered()}
                disabled={testing}
              >
                {testing ? 'Ulanmoqda...' : 'Shu serverga ulanish'}
              </Button>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="server-url">Server IP yoki URL</Label>
            <Input
              id="server-url"
              type="text"
              placeholder="192.168.1.50"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-destructive text-xs text-center whitespace-pre-line">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={() => void handleConnect()}
            disabled={testing}
          >
            {testing ? 'Ulanmoqda...' : 'Ulash'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
