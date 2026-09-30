import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Errors } from '../lib/errors';
import { errorHandler } from './errorHandler';

function answer(error: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  errorHandler(error, {} as Request, { status } as unknown as Response, vi.fn() as NextFunction);
  return { status, json };
}

describe('errorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers an AppError with its own status, code and message', () => {
    const { status, json } = answer(Errors.Conflict('Hisob allaqachon yopilgan'));
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: 'Hisob allaqachon yopilgan', details: undefined },
    });
  });

  it('answers a body that fails its schema with 400 and the code a validation error uses', () => {
    const parsed = z.object({ amount: z.number().int().positive() }).safeParse({ amount: -30000 });
    if (parsed.success) throw new Error('the schema should refuse a negative amount');

    const { status, json } = answer(parsed.error);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledTimes(1);
    const body = json.mock.calls[0]?.[0] as { error: { code: string; message: string; details: Array<{ path: unknown[] }> } };
    expect(body.error.code).toBe(Errors.Validation('x').code);
    expect(body.error.message).toBe("So'rov ma'lumotlari noto'g'ri");
    expect(body.error.details.map((issue) => issue.path)).toEqual([['amount']]);
  });

  it('answers anything else with 500 and shows the caller nothing of it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { status, json } = answer(new Error('no such table: C:\\Users\\till\\secret.db'));

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });
});
