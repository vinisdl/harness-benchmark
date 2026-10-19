import { z } from 'zod';
import { conversationSchema } from '@/lib/chat-types';

const apiErrorSchema = z.object({ error: z.string() });

export async function checkedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error(
      'Cannot reach the chat server. Check your connection and try again.',
    );
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = apiErrorSchema.safeParse(body);
    throw new Error(
      error.success
        ? error.data.error
        : 'The chat server could not complete your request. Please try again.',
    );
  }
  return response;
}

export async function loadConversation(id?: string, signal?: AbortSignal) {
  const response = await checkedFetch(
    id ? `/api/conversations/${id}` : '/api/conversations',
    {
      method: id ? 'GET' : 'POST',
      cache: 'no-store',
      signal,
    },
  );
  return conversationSchema.parse(await response.json());
}
