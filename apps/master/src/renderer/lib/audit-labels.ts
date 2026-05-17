/**
 * User-facing Uzbek labels for AuditAction enum values. Update this when
 * a new action is added to schema.prisma's AuditAction enum.
 */
export const AUDIT_LABELS: Record<string, string> = {
  USER_CREATED: 'Foydalanuvchi yaratildi',
  USER_DEACTIVATED: 'Foydalanuvchi o‘chirildi',

  DISCOUNT_CREATED: 'Chegirma yaratildi',
  DISCOUNT_EDITED: 'Chegirma o‘zgartirildi',
  DISCOUNT_DELETED: 'Chegirma o‘chirildi',
  DISCOUNT_APPLIED: 'Chegirma qo‘llanildi',

  ORDER_CONFIRMED: "Buyurtma tasdiqlandi va to'landi",
  ORDER_CANCELED: 'Buyurtma bekor qilindi',
  WALKOUT_MARKED: 'To‘lovsiz ketdi (walkout)',
  TABLE_TRANSFERRED: 'Stol o‘zgartirildi',
  RECEIPT_REPRINTED: 'Chek qaytadan chop etildi',

  SETTINGS_CHANGED: 'Sozlama o‘zgartirildi',
  SERVICE_CHARGE_WAIVED: 'Xizmat haqi olib tashlandi',

  // Xarajatlar (chiqim)
  EXPENSE_CREATED: 'Chiqim qo‘shildi',
  EXPENSE_REVERSED: 'Chiqim bekor qilindi',
  EXPENSE_RETURN_RECEIVED: 'Chiqim qaytarildi (qisman/to‘liq)',
  EXPENSE_WRITTEN_OFF: 'Chiqim yo‘qotildi (write-off)',

  // Qarz
  DEBT_CREATED: 'Qarz ochildi',
  DEBT_PAYMENT_RECORDED: 'Qarz qaytimi qabul qilindi',
  DEBT_CLOSED: 'Qarz yopildi',
  DEBT_WRITTEN_OFF: 'Qarz yo‘qotildi (write-off)',

  // Mahsulot (ingredient)
  INGREDIENT_CREATED: 'Mahsulot yaratildi',
  INGREDIENT_UPDATED: 'Mahsulot o‘zgartirildi',
  INGREDIENT_ACTIVATED: 'Mahsulot faollashtirildi',
  INGREDIENT_DEACTIVATED: 'Mahsulot to‘xtatildi',
  INGREDIENT_COST_ADJUSTED: 'Mahsulot tannarxi qo‘lda tuzatildi',

  // Xarid
  PURCHASE_RECORDED: 'Xarid kiritildi',

  // Retsept
  RECIPE_CREATED: 'Retsept yaratildi',
  RECIPE_UPDATED: 'Retsept o‘zgartirildi',
  RECIPE_ACTIVATED: 'Retsept faollashtirildi',
  RECIPE_DEACTIVATED: 'Retsept to‘xtatildi',

  // Sanoq (stocktake)
  STOCKTAKE_OPENED: 'Sanoq boshlandi',
  STOCKTAKE_COMPLETED: 'Sanoq tugatildi',
  STOCKTAKE_VARIANCE_CATEGORIZED: 'Farq sababi belgilandi',

  // Yo‘qotish
  WASTE_RECORDED: 'Yo‘qotish yozildi',

  // Hisobot
  REPORT_SENT: 'Hisobot yuborildi',
  REPORT_SEND_FAILED: 'Hisobot yuborilmadi',
};

/**
 * Grouping for the action filter on the audit page.
 */
export const AUDIT_GROUPS: Array<{ label: string; values: string[] }> = [
  {
    label: 'Buyurtma',
    values: ['ORDER_CONFIRMED', 'ORDER_CANCELED', 'WALKOUT_MARKED', 'TABLE_TRANSFERRED', 'RECEIPT_REPRINTED', 'DISCOUNT_APPLIED', 'SERVICE_CHARGE_WAIVED'],
  },
  {
    label: 'Mahsulot va retsept',
    values: [
      'INGREDIENT_CREATED', 'INGREDIENT_UPDATED', 'INGREDIENT_ACTIVATED', 'INGREDIENT_DEACTIVATED',
      'INGREDIENT_COST_ADJUSTED', 'PURCHASE_RECORDED',
      'RECIPE_CREATED', 'RECIPE_UPDATED', 'RECIPE_ACTIVATED', 'RECIPE_DEACTIVATED',
    ],
  },
  {
    label: 'Chiqim va qarz',
    values: [
      'EXPENSE_CREATED', 'EXPENSE_REVERSED', 'EXPENSE_RETURN_RECEIVED', 'EXPENSE_WRITTEN_OFF',
      'DEBT_CREATED', 'DEBT_PAYMENT_RECORDED', 'DEBT_CLOSED', 'DEBT_WRITTEN_OFF',
    ],
  },
  {
    label: 'Sozlama va boshqaruv',
    values: ['SETTINGS_CHANGED', 'USER_CREATED', 'USER_DEACTIVATED', 'DISCOUNT_CREATED', 'DISCOUNT_EDITED', 'DISCOUNT_DELETED'],
  },
  {
    label: 'Sanoq va yo‘qotish',
    values: ['STOCKTAKE_OPENED', 'STOCKTAKE_COMPLETED', 'STOCKTAKE_VARIANCE_CATEGORIZED', 'WASTE_RECORDED'],
  },
];

/**
 * Color tone for a given action, for badges on the audit page.
 */
export function auditActionTone(action: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (
    ['ORDER_CANCELED', 'WALKOUT_MARKED', 'EXPENSE_REVERSED', 'EXPENSE_WRITTEN_OFF',
     'DEBT_WRITTEN_OFF',
     'USER_DEACTIVATED', 'INGREDIENT_DEACTIVATED', 'RECIPE_DEACTIVATED',
     'REPORT_SEND_FAILED'].includes(action)
  ) return 'danger';

  if (
    ['DISCOUNT_APPLIED', 'STOCKTAKE_VARIANCE_CATEGORIZED', 'SERVICE_CHARGE_WAIVED'].includes(action)
  ) return 'warning';

  if (
    ['ORDER_CONFIRMED', 'USER_CREATED', 'INGREDIENT_CREATED', 'INGREDIENT_ACTIVATED',
     'RECIPE_CREATED', 'RECIPE_ACTIVATED', 'DISCOUNT_CREATED',
     'EXPENSE_RETURN_RECEIVED', 'DEBT_PAYMENT_RECORDED', 'DEBT_CLOSED',
     'STOCKTAKE_COMPLETED', 'REPORT_SENT'].includes(action)
  ) return 'success';

  if (
    ['PURCHASE_RECORDED', 'EXPENSE_CREATED', 'DEBT_CREATED',
     'INGREDIENT_UPDATED', 'RECIPE_UPDATED', 'SETTINGS_CHANGED',
     'TABLE_TRANSFERRED', 'STOCKTAKE_OPENED'].includes(action)
  ) return 'info';

  return 'neutral';
}
