import type { ModelMessage, LanguageModelUsage } from 'ai';
import type { StoredMessage } from '@/lib/chat-types';
import { AppError } from '@/lib/errors';

// Only committed history comes from storage. The pending prompt is appended once.
export function outgoingMessages(
  history: StoredMessage[],
  prompt: string,
): ModelMessage[] {
  return [
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: prompt },
  ];
}

export function historyBytes(messages: StoredMessage[]): number {
  return Buffer.byteLength(JSON.stringify(messages), 'utf8');
}

export function boundHistory(
  messages: StoredMessage[],
  maxMessages: number,
  maxBytes: number,
): StoredMessage[] {
  const bounded = [...messages];
  // Evict whole exchanges so the replay never starts with an orphaned answer.
  while (
    bounded.length > 2 &&
    (bounded.length > maxMessages || historyBytes(bounded) > maxBytes)
  ) {
    bounded.splice(0, 2);
  }
  if (bounded.length > maxMessages || historyBytes(bounded) > maxBytes) {
    throw new AppError(
      'history_capacity',
      'This exchange is too large to save. Please ask a shorter question.',
      413,
    );
  }
  return bounded;
}

export function usageTokens(
  usage: Partial<LanguageModelUsage> | undefined,
  fallbackText: string,
): number {
  const total = usage?.totalTokens;
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0)
    return Math.ceil(total);
  const sum = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  return sum > 0
    ? Math.ceil(sum)
    : Math.ceil(Buffer.byteLength(fallbackText, 'utf8') / 4);
}
