import { describe, expect, it } from 'vitest';
import { buildBillArgs, paymentLines, type ReceiptOrder } from './receipt-builder';

/** Stands in for Prisma.Decimal: the builder only ever calls toString() on it. */
const dec = (value: number) => ({ toString: () => String(value) });

const store = { storeHeading: 'Chayxana' };

/** The 01-bill bill: Osh ×2 (90 000) + Xizmat haqi ×3 (15 000), Chegirma 10 000 → Umumiy 95 000, paid Naqd. */
function bill(over: Partial<ReceiptOrder> = {}): ReceiptOrder {
  return {
    id: 'cmg4order0001abcdef',
    orderType: 'DINE_IN',
    approvedAt: new Date('2026-10-20T12:30:00+05:00'),
    subtotalSnapshot: dec(90_000),
    discountAmountSnapshot: dec(10_000),
    serviceChargeSnapshot: dec(15_000),
    totalSnapshot: dec(95_000),
    lines: [
      { nameSnapshot: 'Osh', quantity: 2, unitPriceSnapshot: dec(45_000), isCanceled: false },
      { nameSnapshot: 'Xizmat haqi', quantity: 3, unitPriceSnapshot: dec(5_000), isCanceled: false },
    ],
    table: { name: 'Stol 4' },
    payments: [{ method: 'CASH', amount: dec(95_000) }],
    debt: null,
    ...over,
  };
}

/** The six arguments as receipt.exe reads them. */
function parse(args: string[]) {
  const [heading = '', info = '', items = '', jami = '', chegirma = '', umumiy = ''] = args;
  const num = (s: string) => Number(s.replace(/\s/g, ''));
  return {
    heading,
    info: info.split('\n'),
    items: items ? items.split(';').map((row) => row.split('|')) : [],
    jami,
    chegirma,
    umumiy,
    sum: { jami: num(jami), chegirma: num(chegirma), umumiy: num(umumiy) },
  };
}

const SANA = /^Sana: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/;

describe('buildBillArgs — the six receipt.exe arguments (issue 1)', () => {
  it('always six arguments, heading first', () => {
    const args = buildBillArgs(bill(), store);
    expect(args).toHaveLength(6);
    expect(args[0]).toBe('Chayxana');
  });

  it('the 01-bill bill: rows Osh 90 000 + Xizmat haqi 15 000; Jami 105 000 is their sum, Chegirma 10 000, Umumiy 95 000', () => {
    const r = parse(buildBillArgs(bill(), store));
    expect(r.items).toEqual([
      ['Osh', '2', '45000', '90000'],
      ['Xizmat haqi', '3', '5000', '15000'],
    ]);
    expect({ jami: r.jami, chegirma: r.chegirma, umumiy: r.umumiy }).toEqual({ jami: '105 000', chegirma: '10 000', umumiy: '95 000' });
    // Jami = Σ rows; Jami − Chegirma = Umumiy
    const rows = r.items.reduce((s, [, , , amount]) => s + Number(amount), 0);
    expect(r.sum.jami).toBe(rows);
    expect(r.sum.jami - r.sum.chegirma).toBe(r.sum.umumiy);
  });

  it("the order-info block: number, table, type, date, then how it was paid — To'lov: Naqd 95 000", () => {
    const r = parse(buildBillArgs(bill(), store));
    expect(r.info.slice(0, 3)).toEqual(['Buyurtma #abcdef', 'Stol: Stol 4', 'Tur: Zalda']);
    expect(r.info[3]).toMatch(SANA);
    expect(r.info.slice(4)).toEqual(["To'lov: Naqd 95 000"]);
  });

  it('Karta 60 000 + Nasiya 45 000 prints two lines, the debtor on the Nasiya one, in the order the legs were taken', () => {
    const r = parse(
      buildBillArgs(
        bill({
          subtotalSnapshot: dec(105_000),
          discountAmountSnapshot: dec(0),
          serviceChargeSnapshot: dec(0),
          totalSnapshot: dec(105_000),
          lines: [{ nameSnapshot: 'Osh', quantity: 2, unitPriceSnapshot: dec(45_000), isCanceled: false }, { nameSnapshot: 'Somsa', quantity: 1, unitPriceSnapshot: dec(15_000), isCanceled: false }],
          payments: [
            { method: 'CARD', amount: dec(60_000) },
            { method: 'DEBT', amount: dec(45_000) },
          ],
          debt: { debtorName: 'Karim aka' },
        }),
        store,
      ),
    );
    expect(r.info.slice(4)).toEqual(["To'lov: Karta 60 000", 'Nasiya: Karim aka 45 000']);
    expect({ jami: r.jami, chegirma: r.chegirma, umumiy: r.umumiy }).toEqual({ jami: '105 000', chegirma: '0', umumiy: '105 000' });
  });

  it('a CASH leg of 0 prints nothing — the ticket sends empty legs', () => {
    const r = parse(
      buildBillArgs(
        bill({
          subtotalSnapshot: dec(45_000),
          discountAmountSnapshot: dec(0),
          serviceChargeSnapshot: dec(0),
          totalSnapshot: dec(45_000),
          lines: [{ nameSnapshot: 'Osh', quantity: 1, unitPriceSnapshot: dec(45_000), isCanceled: false }],
          payments: [
            { method: 'CASH', amount: dec(0) },
            { method: 'CARD', amount: dec(45_000) },
          ],
        }),
        store,
      ),
    );
    expect(r.info.slice(4)).toEqual(["To'lov: Karta 45 000"]);
    expect(r.info.join('\n')).not.toContain('Naqd');
  });

  it('a 100% comped bill with a service line: Jami 50 000, Chegirma 45 000, Umumiy 5 000 — the xizmat survives', () => {
    const r = parse(
      buildBillArgs(
        bill({
          subtotalSnapshot: dec(45_000),
          discountAmountSnapshot: dec(45_000),
          serviceChargeSnapshot: dec(5_000),
          totalSnapshot: dec(5_000),
          lines: [
            { nameSnapshot: 'Osh', quantity: 1, unitPriceSnapshot: dec(45_000), isCanceled: false },
            { nameSnapshot: 'Xizmat haqi', quantity: 1, unitPriceSnapshot: dec(5_000), isCanceled: false },
          ],
          payments: [{ method: 'CASH', amount: dec(5_000) }],
        }),
        store,
      ),
    );
    expect(r.sum).toEqual({ jami: 50_000, chegirma: 45_000, umumiy: 5_000 });
    expect(r.sum.jami - r.sum.chegirma).toBe(r.sum.umumiy);
  });

  it('cancelled lines are neither printed nor counted; a bill with no service has Jami = Umumiy', () => {
    const r = parse(
      buildBillArgs(
        bill({
          subtotalSnapshot: dec(90_000),
          discountAmountSnapshot: dec(0),
          serviceChargeSnapshot: dec(0),
          totalSnapshot: dec(90_000),
          lines: [
            { nameSnapshot: 'Osh', quantity: 2, unitPriceSnapshot: dec(45_000), isCanceled: false },
            { nameSnapshot: 'Somsa', quantity: 3, unitPriceSnapshot: dec(8_000), isCanceled: true },
          ],
          payments: [{ method: 'CASH', amount: dec(90_000) }],
        }),
        store,
      ),
    );
    expect(r.items).toEqual([['Osh', '2', '45000', '90000']]);
    expect(r.sum).toEqual({ jami: 90_000, chegirma: 0, umumiy: 90_000 });
  });

  it('takeaway: no table line, "Tur: Olib ketish"', () => {
    const r = parse(buildBillArgs(bill({ orderType: 'TAKEAWAY', table: null }), store));
    expect(r.info.slice(0, 2)).toEqual(['Buyurtma #abcdef', 'Tur: Olib ketish']);
    expect(r.info[2]).toMatch(SANA);
  });

  it('every info line and item name is ASCII with no | or ; and no line break of its own', () => {
    const r = parse(
      buildBillArgs(
        bill({
          lines: [{ nameSnapshot: 'Lag‘mon | «katta»; yangi\nqator', quantity: 1, unitPriceSnapshot: dec(30_000), isCanceled: false }],
          table: { name: 'Stol — 7' },
          payments: [{ method: 'DEBT', amount: dec(95_000) }],
          debt: { debtorName: 'Ra’no opa | Chilonzor; tel\r\n+998' },
        }),
        { storeHeading: 'Chayxana “Oqtepa”', storeAddress: 'Ko‘cha 5', storePhone: '+998 90 000 00 00' },
      ),
    );
    const lines = [...r.heading.split('\n'), ...r.info, ...r.items.map((row) => row[0] ?? '')];
    for (const line of lines) {
      expect(line, line).toMatch(/^[\x20-\x7e]*$/);
    }
    expect(r.items[0]?.[0]).toBe("Lag'mon   \"katta\"  yangi qator");
    expect(r.info.at(-1)).toBe("Nasiya: Ra'no opa   Chilonzor  tel  +998 95 000");
    expect(r.heading).toBe('Chayxana "Oqtepa"\nKo\'cha 5\nTel: +998 90 000 00 00');
  });

  it('typographic spaces (NBSP, narrow NBSP, thin, figure) print as plain spaces, never as ?', () => {
    const r = parse(
      buildBillArgs(
        bill({
          lines: [{ nameSnapshot: 'Qovurma lag’mon katta porsiya x', quantity: 1, unitPriceSnapshot: dec(30_000), isCanceled: false }],
          debt: null,
        }),
        store,
      ),
    );
    expect(r.items[0]?.[0]).toBe("Qovurma lag'mon katta porsiya x");
  });

  it('amounts may arrive as numbers or digit strings as well as Decimals', () => {
    const r = parse(
      buildBillArgs(
        bill({ subtotalSnapshot: 90_000, discountAmountSnapshot: '10000', serviceChargeSnapshot: 15_000, totalSnapshot: '95000', payments: [{ method: 'CASH', amount: 95_000 }] }),
        store,
      ),
    );
    expect(r.sum).toEqual({ jami: 105_000, chegirma: 10_000, umumiy: 95_000 });
    expect(r.info.at(-1)).toBe("To'lov: Naqd 95 000");
  });
});

describe('paymentLines', () => {
  it('a Nasiya leg without a debt row still says Nasiya and the amount', () => {
    expect(paymentLines({ payments: [{ method: 'DEBT', amount: 45_000 }], debt: null })).toEqual(['Nasiya: 45 000']);
  });

  it('no legs, or only empty legs, print nothing', () => {
    expect(paymentLines({ payments: [], debt: null })).toEqual([]);
    expect(paymentLines({ payments: [{ method: 'CASH', amount: 0 }], debt: null })).toEqual([]);
  });
});
