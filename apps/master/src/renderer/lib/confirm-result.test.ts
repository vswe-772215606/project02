import { describe, expect, it } from 'vitest';

import { printFailureNotice } from './confirm-result';

describe('printFailureNotice', () => {
  it('says nothing when the bill printed', () => {
    expect(printFailureNotice({ billPrinted: true, printError: null })).toBeNull();
  });

  it('tells the admin to check the printer and reprint', () => {
    const notice = printFailureNotice({ billPrinted: false, printError: 'Command failed: receipt.exe' });
    expect(notice?.title).toBe('Chek chiqmadi');
    expect(notice?.description).toContain('Printerni tekshiring');
  });

  it('points to Sozlamalar when no printer is chosen', () => {
    const notice = printFailureNotice({ billPrinted: false, printError: 'Admin printer not configured' });
    expect(notice?.description).toContain('Sozlamalarda');
  });
});
