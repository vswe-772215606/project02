import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, Errors } from '../lib/errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // A body that fails its schema is the caller's mistake, not the server's:
  // answer it like any other validation error (400, VALIDATION) and list the
  // issues, instead of a 500 (PRD 14 G3).
  const error = err instanceof ZodError
    ? Errors.Validation("So'rov ma'lumotlari noto'g'ri", err.issues)
    : err;

  if (error instanceof AppError) {
    res.status(error.httpStatus).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  console.error('[unhandled]', err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
};
