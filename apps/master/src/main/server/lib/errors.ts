export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  Unauthorized: () => new AppError('UNAUTHORIZED', 401, 'Authentication required'),
  Forbidden: (msg = 'Forbidden') => new AppError('FORBIDDEN', 403, msg),
  NotFound: (entity: string) => new AppError('NOT_FOUND', 404, `${entity} not found`),
  Conflict: (msg: string) => new AppError('CONFLICT', 409, msg),
  Business: (code: string, msg: string, httpStatus = 409, details?: unknown) =>
    new AppError(code, httpStatus, msg, details),
  Validation: (msg: string, details?: unknown) =>
    new AppError('VALIDATION', 400, msg, details),
  IllegalStateTransition: (from: string, to: string) =>
    new AppError('ILLEGAL_STATE', 409, `Cannot transition from ${from} to ${to}`),
  OutOfStock: (itemName: string, parentDishName?: string) =>
    new AppError(
      'OUT_OF_STOCK',
      409,
      parentDishName
        ? `${itemName} (${parentDishName} uchun) yetarli emas`
        : `${itemName} yetarli emas`,
      parentDishName ? { ingredientName: itemName, parentDishName } : { ingredientName: itemName },
    ),
  ItemUnavailable: (itemName: string) =>
    new AppError('ITEM_UNAVAILABLE', 409, `${itemName} is unavailable`),
  DiscountCapExceeded: (msg: string) =>
    new AppError('DISCOUNT_CAP_EXCEEDED', 400, msg),
  PrintFailed: (msg: string, details?: unknown) =>
    new AppError('PRINT_FAILED', 500, msg, details),
  Locked: (until: Date) =>
    new AppError('LOCKED', 423, `Account locked until ${until.toISOString()}`, { until }),
  PaymentMismatch: (msg: string) =>
    new AppError('PAYMENT_MISMATCH', 400, msg),
  DebtMetadataRequired: () =>
    new AppError('DEBT_METADATA_REQUIRED', 400, 'Qarz uchun qarzdor ma\'lumoti kiritilishi shart'),
  DebtAlreadyExists: () =>
    new AppError('DEBT_ALREADY_EXISTS', 409, 'Bu buyurtma uchun qarz allaqachon yaratilgan'),
  DebtNotOpen: () =>
    new AppError('DEBT_NOT_OPEN', 409, 'Qarz allaqachon yopilgan yoki mavjud emas'),
  DebtOverpay: () =>
    new AppError('DEBT_OVERPAY', 400, 'To\'lov summasi qolgan qarzdan katta bo\'lishi mumkin emas'),
  ExpenseImmutable: () =>
    new AppError('EXPENSE_IMMUTABLE', 409, 'Chiqim yozuvini to\'g\'ridan-to\'g\'ri o\'zgartirib bo\'lmaydi'),
  ExpenseAlreadyReversed: () =>
    new AppError('EXPENSE_ALREADY_REVERSED', 409, 'Bu chiqim allaqachon bekor qilingan'),
  ExpenseReversalSameDayOnly: () =>
    new AppError('EXPENSE_REVERSAL_SAME_DAY_ONLY', 409, 'Chiqimni faqat u kiritilgan kunning o\'zida bekor qilish mumkin'),
  ExpenseReversalInvalid: (msg = 'Chiqimni bekor qilish so\'rovi noto\'g\'ri') =>
    new AppError('EXPENSE_REVERSAL_INVALID', 400, msg),
};
