import { describe, expect, it } from 'vitest';

import { billName, printFailureNotice } from './confirm-result';

const atTable = { tableName: 'Stol 5', orderType: 'DINE_IN', orderNumber: 'K3J9AB' } as const;
const takeaway = { tableName: null, orderType: 'TAKEAWAY', orderNumber: 'C29F05' } as const;

describe('printFailureNotice', () => {
  it('says nothing when the bill printed', () => {
    expect(printFailureNotice({ ...atTable, billPrinted: true, printError: null })).toBeNull();
  });

  it('tells the admin to check the printer and reprint', () => {
    const notice = printFailureNotice({ ...atTable, billPrinted: false, printError: 'Command failed: receipt.exe' });
    expect(notice?.title).toBe('Chek chiqmadi');
    expect(notice?.description).toContain('Printerni tekshiring');
  });

  it('points to Sozlamalar when no printer is chosen', () => {
    const notice = printFailureNotice({ ...atTable, billPrinted: false, printError: 'Admin printer not configured' });
    expect(notice?.description).toContain('Sozlamalarda');
  });

  it('starts with the bill it is about, so stacked notices can be told apart', () => {
    const failed = { billPrinted: false, printError: 'Command failed: receipt.exe' };
    expect(printFailureNotice({ ...atTable, ...failed })?.description).toMatch(/^Stol 5: Hisob yopildi/);
    expect(printFailureNotice({ ...takeaway, ...failed })?.description).toMatch(/^Olib ketish #C29F05: Hisob yopildi/);
    expect(
      printFailureNotice({ ...atTable, billPrinted: false, printError: 'Admin printer not configured' })?.description,
    ).toMatch(/^Stol 5: /);
  });
});

describe('billName', () => {
  it('names a bill by its table, as the queue does', () => {
    expect(billName(atTable)).toBe('Stol 5');
  });

  it('names a bill with no table by its number', () => {
    expect(billName(takeaway)).toBe('Olib ketish #C29F05');
    expect(billName({ tableName: null, orderType: 'DINE_IN', orderNumber: 'F63B17' })).toBe('Buyurtma #F63B17');
  });
});
