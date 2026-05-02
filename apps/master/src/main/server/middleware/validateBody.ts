import { RequestHandler } from 'express';
import { ZodSchema } from 'zod';
import { Errors } from '../lib/errors';

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(Errors.Validation('Invalid request body', result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}
