import type { UIMessage } from 'ai';
import { z } from 'zod';

export const storedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type StoredMessage = z.infer<typeof storedMessageSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  messages: z.array(storedMessageSchema),
  tokens: z.number(),
  budget: z.number(),
  expiresAt: z.number(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export type ChatMessage = UIMessage<
  unknown,
  {
    conversation: { title: string | null; tokens: number; budget: number };
    warning: { message: string };
  }
>;

export function toUIMessages(messages: StoredMessage[]): ChatMessage[] {
  return messages.map(({ id, role, content }) => ({
    id,
    role,
    parts: [{ type: 'text', text: content }],
  }));
}

export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
