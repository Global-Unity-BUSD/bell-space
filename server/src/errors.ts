export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type DbError = { code?: string; message?: string; constraint?: string };

/** Map an error to a status and a message safe to show. null = unexpected (500, logged). */
export function describeError(error: unknown): { status: number; message: string } | null {
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  const e = (error ?? {}) as DbError & { statusCode?: number; validation?: unknown };
  if (e.validation) return { status: 400, message: 'Some fields are missing or not valid.' };
  if (e.statusCode === 413 || e.code === 'FST_REQ_FILE_TOO_LARGE') return { status: 413, message: 'That file is too large (5 MB at most).' };
  if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) return { status: e.statusCode, message: e.message ?? 'Bad request.' };
  switch (e.code) {
    // Raised by the database's checked functions with a readable message.
    case '42501': return { status: 403, message: /permission denied|row-level security/.test(e.message ?? '') ? 'Not allowed.' : e.message! };
    case 'P0001': return { status: 409, message: e.message ?? 'Not possible right now.' };
    case '23505': return { status: 409, message: e.constraint === 'accounts_email_key' ? 'That email is already used.' : 'That already exists.' };
    case '23514': case '23502': case '22P02': case '22001': case '22023': case '23503':
      return { status: 400, message: 'Some fields are missing or not valid.' };
    default: return null;
  }
}
