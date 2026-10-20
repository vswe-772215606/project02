import { z } from 'zod';
import { isValidLocalDay } from './time';

/**
 * A Tashkent calendar day in a request: "YYYY-MM-DD", and a day that exists.
 *
 * `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` let "2026-13-45" through to
 * `parseLocalDay`, whose Invalid Date then threw in `localDayKey` (finance,
 * reports) or was refused by Prisma (me) — a 500 for the caller's typo. A day
 * that does not exist is a validation error, so it answers 400 VALIDATION like
 * every other bad input (PRD 14 G3).
 */
export const localDaySchema = z.string().refine(isValidLocalDay, { message: "Sana noto'g'ri" });
