import { useState } from 'react';
import { useSettingsStore } from '../stores/settings.store';

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  const withoutProto = url.replace(/^https?:\/\//i, '');
  if (/^[^/:]+$/.test(withoutProto)) url = `${url}:4000`;
  return url.replace(/\/$/, '');
}

export function ServerSetupPage() {
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const [input, setInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    const url = normalizeUrl(input);
    if (!url) { setError('IP address kiriting'); return; }
    setError('');
    setTesting(true);
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('bad status');
      setServerUrl(url);
    } catch {
      setError(`Ulanib bo'lmadi: ${url}\nServer yoqilganligini va IP to'g'riligini tekshiring.`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-3xl font-black text-blue-700 text-center mb-6">Chayxana Kitchen</h1>
        <h2 className="text-lg font-bold text-gray-800 text-center mb-2">Master server manzili</h2>
        <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
          Master kompyuterning IP manzilini kiriting.<br />
          <span className="font-semibold text-gray-700">Masalan: 192.168.1.50</span>
        </p>

        <input
          type="text"
          className={`w-full border-2 rounded-xl px-4 py-3 text-base outline-none mb-3 ${
            error ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
          }`}
          placeholder="192.168.1.50"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
          autoFocus
        />

        {error && (
          <p className="text-red-600 text-sm text-center mb-3 whitespace-pre-line">{error}</p>
        )}

        <button
          className={`w-full py-3 rounded-xl font-bold text-white text-base transition-colors ${
            testing ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
          onClick={() => void handleConnect()}
          disabled={testing}
        >
          {testing ? 'Ulanmoqda...' : 'Ulash'}
        </button>
      </div>
    </div>
  );
}
