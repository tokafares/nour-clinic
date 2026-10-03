import type { z, ZodError } from 'zod';
import { AppError } from './errors.js';

export function zodToAppError(error: ZodError): AppError {
  const details = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return new AppError(400, 'VALIDATION_ERROR', details[0]?.message ?? 'Invalid request', details);
}

/** Parses `data` with a Zod schema, turning failures into a 400 with field details. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw zodToAppError(result.error);
  return result.data;
}
