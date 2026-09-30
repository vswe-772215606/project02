import type { ConfirmResult } from '@/api/orders';

export type PrintFailureNotice = {
  title: string;
  description: string;
};

/**
 * What the till says when a confirmed bill did not print, or null when it did.
 * The sale is closed either way (PRD 14 G6), so the notice names the fix, not
 * the error.
 */
export function printFailureNotice(
  result: Pick<ConfirmResult, 'billPrinted' | 'printError'>,
): PrintFailureNotice | null {
  if (result.billPrinted) return null;
  if (result.printError?.includes('not configured')) {
    return {
      title: 'Chek chiqmadi',
      description: "Hisob yopildi, pul yozildi. Chek printeri tanlanmagan: Sozlamalarda tanlang, keyin qayta chop eting.",
    };
  }
  return {
    title: 'Chek chiqmadi',
    description: "Hisob yopildi, pul yozildi. Printerni tekshiring, keyin chekni qayta chop eting.",
  };
}
