export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const PROVIDER_ERROR =
  'The model is temporarily unavailable. Your unfinished turn was not saved. Please try again.';
export const STORAGE_ERROR =
  'Conversation storage is temporarily unavailable. Please try again in a moment.';

export function errorResponse(error: unknown): Response {
  const safe =
    error instanceof AppError
      ? error
      : new AppError('storage_unavailable', STORAGE_ERROR, 503);
  return Response.json(
    { error: safe.message, code: safe.code },
    { status: safe.status },
  );
}
