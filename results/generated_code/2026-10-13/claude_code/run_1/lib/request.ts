import { z } from 'zod';
import { AppError } from '@/lib/errors';

export const chatRequestSchema = z
  .object({
    conversationId: z.uuid(),
    message: z
      .object({
        id: z.string().min(1).max(100),
        text: z.string().trim().min(1).max(8000),
      })
      .strict(),
  })
  .strict();

export async function parseChatRequest(request: Request) {
  const body: ReadableStream<Uint8Array> | null = request.body;
  const reader = body?.getReader();
  if (!reader)
    throw new AppError('invalid_request', 'Enter a message to start chatting.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16384) {
        await reader.cancel();
        throw new AppError(
          'input_too_large',
          'Please shorten your message (maximum 8 KB).',
          413,
        );
      }
      chunks.push(chunk.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const parsed = chatRequestSchema.safeParse(value);
    if (!parsed.success) throw new Error('invalid');
    if (Buffer.byteLength(parsed.data.message.text, 'utf8') > 8000) {
      throw new AppError(
        'input_too_large',
        'Please shorten your message (maximum 8 KB).',
        413,
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'invalid_request',
      'Send a valid conversation and a non-empty text message.',
    );
  } finally {
    reader.releaseLock();
  }
}
