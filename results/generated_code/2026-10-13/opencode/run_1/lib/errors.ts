export class ChatError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export const PROVIDER_ERROR =
  "The assistant is temporarily unavailable. Your turn was not saved. Please try again.";
export function publicError(error: unknown): string {
  return error instanceof ChatError ? error.message : PROVIDER_ERROR;
}
