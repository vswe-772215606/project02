import { describe, expect, it } from 'vitest';

import {
  buildReadyPrompt,
  SHUTDOWN_NOTICE,
  updaterErrorMessage,
} from './updater-messages';

const CASES = [
  { label: 'orders open', openOrders: 3 },
  { label: 'no orders', openOrders: 0 },
  { label: 'count unavailable', openOrders: null },
] as const;

describe('buildReadyPrompt', () => {
  it('names the count and the version when orders are open', () => {
    const prompt = buildReadyPrompt({ version: '0.1.4', openOrders: 3 });
    expect(prompt.body).toContain('Hozir 3 ta ochiq buyurtma bor.');
    expect(prompt.body).toContain('Chayxana Master 0.1.4 yuklab olindi.');
  });

  it('does not also claim there are none', () => {
    const prompt = buildReadyPrompt({ version: '0.1.4', openOrders: 3 });
    expect(prompt.body).not.toContain("ochiq buyurtma yo'q");
  });

  it('says so plainly when nothing is open', () => {
    const prompt = buildReadyPrompt({ version: '0.1.4', openOrders: 0 });
    expect(prompt.body).toContain("Hozir ochiq buyurtma yo'q.");
    expect(prompt.body).not.toContain(' ta ochiq buyurtma bor');
  });

  it('takes no plural suffix after a numeral', () => {
    const prompt = buildReadyPrompt({ version: '0.1.4', openOrders: 1 });
    expect(prompt.body).toContain('Hozir 1 ta ochiq buyurtma bor.');
  });

  it('warns rather than claiming zero when the count could not be read', () => {
    const prompt = buildReadyPrompt({ version: '0.1.4', openOrders: null });
    expect(prompt.body).toContain('Ochiq buyurtmalar soni aniqlanmadi.');
    expect(prompt.body).not.toContain("ochiq buyurtma yo'q");
  });

  it('uses the same title and buttons in every case', () => {
    for (const { label, openOrders } of CASES) {
      const prompt = buildReadyPrompt({ version: '0.1.4', openOrders });
      expect(prompt.title, label).toBe('Yangi versiya tayyor');
      expect(prompt.confirmLabel, label).toBe("Hozir o'rnatish");
      expect(prompt.cancelLabel, label).toBe('Keyinroq');
    }
  });

  // RISK 1. Declining the Windows permission dialog leaves the app quit and
  // not relaunched, so the operator has to be told before they commit. A test
  // is the only thing stopping a future edit from trimming this paragraph.
  it('always warns about the Windows permission dialog', () => {
    for (const { label, openOrders } of CASES) {
      const prompt = buildReadyPrompt({ version: '0.1.4', openOrders });
      expect(prompt.body, label).toContain("Windows ruxsat so'raydi");
    }
  });
});

describe('the constants shown while installing', () => {

  it('gives the waiters a reason and a duration', () => {
    expect(SHUTDOWN_NOTICE).toContain('Master yangilanmoqda');
    expect(SHUTDOWN_NOTICE).toContain('1–2 daqiqa');
  });
});

describe('updaterErrorMessage', () => {
  it('maps the failures an operator can act on', () => {
    expect(updaterErrorMessage('ERR_UPDATER_CHANNEL_FILE_NOT_FOUND')).toBe(
      'Yangilanish serveri javob bermadi.',
    );
    expect(
      updaterErrorMessage(Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' })),
    ).toBe("Internet aloqasi yo'q.");
    expect(
      updaterErrorMessage(Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' })),
    ).toBe("Internet aloqasi yo'q.");
    expect(updaterErrorMessage(new Error('sha512 checksum mismatch'))).toBe(
      'Yuklab olingan fayl buzilgan.',
    );
  });

  it('always returns a non-empty Uzbek sentence, whatever it was handed', () => {
    for (const input of [new Error('Something went sideways'), 'plain string', undefined]) {
      const message = updaterErrorMessage(input);
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain('undefined');
      expect(message).not.toContain('[object Object]');
    }
  });
});
