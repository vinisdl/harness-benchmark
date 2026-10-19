import { describe, expect, it } from 'vitest';
import {
  boundHistory,
  historyBytes,
  outgoingMessages,
  usageTokens,
} from '@/lib/history';
import {
  messageText,
  toUIMessages,
  type StoredMessage,
} from '@/lib/chat-types';

const history: StoredMessage[] = [
  { id: 'u1', role: 'user', content: 'Hello' },
  { id: 'a1', role: 'assistant', content: 'Hi!' },
  { id: 'u2', role: 'user', content: 'My name is Ada.' },
  { id: 'a2', role: 'assistant', content: 'Nice to meet you, Ada.' },
];

describe('multi-turn payload correctness', () => {
  it('replays committed history and appends exactly one pending user prompt', () => {
    expect(outgoingMessages(history, 'What is my name?')).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'My name is Ada.' },
      { role: 'assistant', content: 'Nice to meet you, Ada.' },
      { role: 'user', content: 'What is my name?' },
    ]);
    expect(history).toHaveLength(4);
    expect(outgoingMessages([], 'First')).toEqual([
      { role: 'user', content: 'First' },
    ]);
  });
});

describe('bounded history and usage', () => {
  it('evicts complete exchanges for message and byte limits', () => {
    expect(boundHistory(history, 3, 10000)).toEqual(history.slice(2));
    expect(boundHistory(history, 40, historyBytes(history.slice(2)))).toEqual(
      history.slice(2),
    );
    expect(boundHistory(history, 40, 10000)).toEqual(history);
  });
  it('rejects an exchange that cannot fit', () => {
    expect(() => boundHistory(history.slice(0, 2), 2, 10)).toThrow('too large');
    expect(() => boundHistory(history.slice(0, 2), 1, 10000)).toThrow(
      'too large',
    );
  });
  it('counts UTF-8 serialized bytes and SDK usage with a fallback', () => {
    expect(
      historyBytes([{ id: 'u', role: 'user', content: '你好' }]),
    ).toBeGreaterThan(
      JSON.stringify([{ id: 'u', role: 'user', content: '你好' }]).length,
    );
    expect(usageTokens({ totalTokens: 15 }, 'ignored')).toBe(15);
    expect(usageTokens({ totalTokens: 0 }, 'ignored')).toBe(0);
    expect(usageTokens({ inputTokens: 4, outputTokens: 6 }, '')).toBe(10);
    expect(usageTokens(undefined, 'abcdefgh')).toBe(2);
    expect(usageTokens({ totalTokens: NaN }, 'abcdefgh')).toBe(2);
  });
  it('converts stored UI messages and ignores non-text parts', () => {
    const ui = toUIMessages(history);
    expect(ui[0]).toEqual({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    });
    expect(
      messageText({
        id: 'a',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'text', text: 'A' },
          { type: 'text', text: 'B' },
        ],
      }),
    ).toBe('AB');
  });
});
