import { useState } from 'react';
import { checkServerHealth, getErrorMessage, normalizeUrl } from '../lib/network';
import { useMasterUrl } from '../providers/MasterUrlProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export function ServerSetupPage() {
  const { setMasterUrl } = useMasterUrl();
  const [input, setInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    const url = normalizeUrl(input);
    if (!url) {
      setError('Server manzilini kiriting');
      return;
    }
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
