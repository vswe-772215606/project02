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
  Validation: (msg: string, details?: unknown) =>
    new AppError('VALIDATION', 400, msg, details),
  IllegalStateTransition: (from: string, to: string) =>
    new AppError('ILLEGAL_STATE', 409, `Cannot transition from ${from} to ${to}`),
  OutOfStock: (itemName: string) =>
    new AppError('OUT_OF_STOCK', 409, `${itemName} is out of stock today`),
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
};
