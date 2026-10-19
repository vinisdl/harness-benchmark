import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getConfig, getProviderConfig } from '@/lib/config';
import { AppError, errorResponse, STORAGE_ERROR } from '@/lib/errors';
import { parseChatRequest } from '@/lib/request';

beforeEach(() => {
  for (const name of [
    'CONVERSATION_TOKEN_BUDGET',
    'HISTORY_MAX_MESSAGES',
    'HISTORY_MAX_BYTES',
    'HISTORY_TTL_SECONDS',
    'HISTORY_MAX_CONVERSATIONS',
    'DATABASE_PATH',
    'OPENAI_MODEL',
    'OPENAI_BASE_URL',
    'OPENAI_API_KEY',
  ])
    vi.stubEnv(name, '');
});

describe('configuration and preflight', () => {
  it('has bounded sane defaults and accepts valid overrides', () => {
    expect(getConfig()).toMatchObject({
      tokenBudget: 32000,
      maxMessages: 40,
      maxBytes: 65536,
      ttlMs: 86400000,
    });
    vi.stubEnv('HISTORY_MAX_MESSAGES', '1');
    vi.stubEnv('DATABASE_PATH', ':memory:');
    vi.stubEnv('CONVERSATION_TOKEN_BUDGET', '100');
    expect(getConfig()).toMatchObject({
      maxMessages: 2,
      tokenBudget: 100,
      databasePath: ':memory:',
    });
  });
  it.each(['-1', '0', 'Infinity', 'NaN', '1.5', '10000001'])(
    'rejects invalid budgets %s',
    (value) => {
      vi.stubEnv('CONVERSATION_TOKEN_BUDGET', value);
      expect(() => getConfig()).toThrow('CONVERSATION_TOKEN_BUDGET');
    },
  );
  it('fails missing credentials without leaking any values', () => {
    expect(() => getProviderConfig()).toThrow(
      'Set it in your server environment',
    );
  });
  it('uses only local Chat Completions configuration and model override', () => {
    vi.stubEnv('OPENAI_API_KEY', randomUUID());
    expect(getProviderConfig()).toMatchObject({
      model: 'gpt-6.1-sol',
      baseURL: 'http://localhost:4000/v1',
    });
    vi.stubEnv('OPENAI_MODEL', 'local-test-model');
    vi.stubEnv('OPENAI_BASE_URL', 'http://host.docker.internal:4000/v1');
    expect(getProviderConfig().model).toBe('local-test-model');
  });
  it.each([
    'https://example.com/v1',
    'http://localhost:9999/v1',
    'http://localhost:4000/other',
    'http://localhost:4000/v1?x=1',
    'http://localhost:4000/v1#x',
    'http://name@localhost:4000/v1',
  ])('rejects non-local or credential-bearing URL %s', (url) => {
    vi.stubEnv('OPENAI_API_KEY', randomUUID());
    vi.stubEnv('OPENAI_BASE_URL', url);
    expect(() => getProviderConfig()).toThrow();
  });
});

describe('safe API errors and input', () => {
  it('returns actionable application errors and masks arbitrary exception details', async () => {
    const response = errorResponse(new AppError('test', 'Safe message', 429));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: 'Safe message',
      code: 'test',
    });
    expect(
      await errorResponse(new Error('private provider details')).json(),
    ).toEqual({ error: STORAGE_ERROR, code: 'storage_unavailable' });
  });
  it('validates a text-only request, trimming once', async () => {
    const input = {
      conversationId: randomUUID(),
      message: { id: 'u1', text: ' Hello ' },
    };
    expect(
      await parseChatRequest(
        new Request('http://localhost/api/chat', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    ).toEqual({ ...input, message: { id: 'u1', text: 'Hello' } });
  });
  it.each([
    '{}',
    '{',
    JSON.stringify({ conversationId: 'bad', message: { id: 'u', text: 'Hi' } }),
    JSON.stringify({
      conversationId: randomUUID(),
      message: { id: 'u', text: ' ' },
    }),
  ])('rejects malformed input %s', async (body) => {
    await expect(
      parseChatRequest(
        new Request('http://localhost/api/chat', { method: 'POST', body }),
      ),
    ).rejects.toThrow('valid conversation');
  });
  it('rejects missing body and bounded request/UTF-8 input bytes', async () => {
    await expect(
      parseChatRequest(
        new Request('http://localhost/api/chat', { method: 'POST' }),
      ),
    ).rejects.toThrow('Enter a message');
    for (const text of ['x'.repeat(20000), '界'.repeat(3000)]) {
      await expect(
        parseChatRequest(
          new Request('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
              conversationId: randomUUID(),
              message: { id: 'u', text },
            }),
          }),
        ),
      ).rejects.toThrow('shorten');
    }
  });
});
