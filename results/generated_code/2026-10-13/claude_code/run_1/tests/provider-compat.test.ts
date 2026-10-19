import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { streamText } from 'ai';
import { chatModel } from '@/lib/provider';
import { outgoingMessages } from '@/lib/history';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('uses the real OpenAI provider Chat Completions API at the local LiteLLM URL with exact history', async () => {
  vi.stubEnv('OPENAI_API_KEY', randomUUID());
  vi.stubEnv('OPENAI_BASE_URL', 'http://localhost:4000/v1');
  vi.stubEnv('OPENAI_MODEL', 'gpt-6.1-sol');
  let destination: unknown;
  let payload: unknown;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init: RequestInit) => {
      destination = url;
      if (typeof init.body !== 'string')
        throw new Error('Expected serialized provider request.');
      payload = JSON.parse(init.body) as unknown;
      const data = {
        id: 'chat-test',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'gpt-6.1-sol',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'Hello' },
            finish_reason: null,
          },
        ],
      };
      const final = {
        ...data,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      };
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify(data)}\n\ndata: ${JSON.stringify(final)}\n\ndata: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );
    }),
  );
  const model = chatModel();
  expect(model.modelId).toBe('gpt-6.1-sol');
  const result = streamText({
    model,
    system: 'Be helpful.',
    messages: outgoingMessages(
      [
        { id: 'u1', role: 'user', content: 'My name is Ada.' },
        { id: 'a1', role: 'assistant', content: 'Hello, Ada.' },
      ],
      'What is my name?',
    ),
    maxRetries: 0,
  });
  expect(await result.text).toBe('Hello');
  expect(destination).toBe('http://localhost:4000/v1/chat/completions');
  expect(payload).toMatchObject({
    model: 'gpt-6.1-sol',
    stream: true,
    messages: [
      // The OpenAI adapter translates SDK system instructions to the GPT developer role.
      { role: 'developer', content: 'Be helpful.' },
      { role: 'user', content: 'My name is Ada.' },
      { role: 'assistant', content: 'Hello, Ada.' },
      { role: 'user', content: 'What is my name?' },
    ],
  });
  expect((await result.usage).totalTokens).toBe(12);
});
