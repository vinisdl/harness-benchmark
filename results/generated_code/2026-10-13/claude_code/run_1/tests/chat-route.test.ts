import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import { getConfig } from '@/lib/config';
import { ConversationStore } from '@/lib/db/store';
import * as storeModule from '@/lib/db/store';
import * as provider from '@/lib/provider';
import { POST } from '@/app/api/chat/route';
import { POST as createConversation } from '@/app/api/conversations/route';
import { GET } from '@/app/api/conversations/[id]/route';
import { modelFixture, modelUsage } from './model-fixture';

let store: ConversationStore;
beforeEach(() => {
  store = new ConversationStore({ ...getConfig(), databasePath: ':memory:' });
  vi.spyOn(storeModule, 'getStore').mockReturnValue(store);
});
afterEach(() => {
  store.close();
});
function request(id: string, text = 'Hello', messageId: string = randomUUID()) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: id,
      message: { id: messageId, text },
    }),
  });
}

describe('real AI SDK streaming route', () => {
  it('streams multiple deltas, persists one exchange and generates a structured title', async () => {
    const model = modelFixture();
    vi.spyOn(provider, 'chatModel').mockReturnValue(model);
    const { id } = store.create();
    const response = await POST(request(id, 'Hello', 'u1'));
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const body = await response.text();
    expect(body.match(/"type":"text-delta"/g)).toHaveLength(2);
    expect(body).toContain('data-conversation');
    expect(body).toContain('A friendly greeting');
    expect(store.get(id)).toMatchObject({
      tokens: 30,
      title: 'A friendly greeting',
    });
    expect(store.get(id).messages.map((message) => message.content)).toEqual([
      'Hello',
      'Hello from the model',
    ]);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0]?.responseFormat).toMatchObject({
      type: 'json',
    });
    await (await POST(request(id, 'What did I say?', 'u2'))).text();
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(
      model.doStreamCalls[1]?.prompt.filter(
        (message) => message.role !== 'system',
      ),
    ).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello from the model' }],
      },
      { role: 'user', content: [{ type: 'text', text: 'What did I say?' }] },
    ]);
    expect(model.doStreamCalls[0]?.prompt[0]).toMatchObject({
      role: 'system',
      content: provider.SYSTEM_PROMPT,
    });
    expect(
      model.doStreamCalls[0]?.tools?.map((tool) =>
        'name' in tool ? tool.name : '',
      ),
    ).toEqual(['server_time', 'calculator']);
  });
  it('delivers first tokens before the provider completes', async () => {
    let finish: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const model = modelFixture();
    model.doStream = () =>
      Promise.resolve({
        stream: new ReadableStream({
          async start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 'x' });
            controller.enqueue({
              type: 'text-delta',
              id: 'x',
              delta: 'First token',
            });
            await waiting;
            controller.enqueue({
              type: 'text-delta',
              id: 'x',
              delta: ' and last token',
            });
            controller.enqueue({ type: 'text-end', id: 'x' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: modelUsage,
            });
            controller.close();
          },
        }),
      });
    vi.spyOn(provider, 'chatModel').mockReturnValue(model);
    const { id } = store.create();
    const response = await POST(request(id));
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    let prefix = '';
    while (!prefix.includes('First token')) {
      const part = await reader?.read();
      prefix += new TextDecoder().decode(part?.value);
    }
    expect(store.get(id).messages).toEqual([]);
    expect(prefix).not.toContain('last token');
    finish?.();
    while (!(await reader?.read())?.done) {
      /* Drain the remainder to commit. */
    }
    expect(store.get(id).messages).toHaveLength(2);
  });
  it('rescues initial provider failure with no replayable failed content', async () => {
    const model = new MockLanguageModelV4({
      doStream: () => {
        throw new Error('private failure');
      },
    });
    vi.spyOn(provider, 'chatModel').mockReturnValue(model);
    const { id } = store.create();
    const body = await (await POST(request(id))).text();
    expect(body).toContain('temporarily unavailable');
    expect(body).not.toContain('private failure');
    expect(store.get(id).messages).toEqual([]);
    expect(() => store.acquire(id, 'retry')).not.toThrow();
  });
  it('rescues failures after partial tokens, aborts, and oversize responses without storing them', async () => {
    for (const chunks of [
      [{ type: 'error' as const, error: new Error('private') }],
      [{ type: 'text-delta' as const, id: 'x', delta: 'x'.repeat(17000) }],
    ]) {
      const model = modelFixture('', [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'x' },
        ...chunks,
        { type: 'text-end', id: 'x' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: modelUsage,
        },
      ]);
      vi.spyOn(provider, 'chatModel').mockReturnValue(model);
      const { id } = store.create();
      expect(await (await POST(request(id))).text()).toContain(
        '"type":"error"',
      );
      expect(store.get(id).messages).toEqual([]);
    }
    const model = modelFixture();
    vi.spyOn(provider, 'chatModel').mockReturnValue(model);
    const { id } = store.create();
    const controller = new AbortController();
    controller.abort();
    const original = request(id);
    expect(
      await (
        await POST(new Request(original, { signal: controller.signal }))
      ).text(),
    ).toContain('"type":"error"');
    expect(store.get(id).messages).toEqual([]);
  });
  it('forces actual calculator and time tool use on first step, then allows an answer', async () => {
    for (const [prompt, name, input] of [
      ['Calculate 2 + 2', 'calculator', '{"expression":"2+2"}'],
      ['What time is it?', 'server_time', '{}'],
    ]) {
      const model = modelFixture();
      const doStream = vi
        .fn()
        .mockImplementationOnce(() => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'tool-call', toolCallId: 't1', toolName: name, input },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage: modelUsage,
              },
            ],
          }),
        }))
        .mockImplementationOnce(() => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'x' },
              { type: 'text-delta', id: 'x', delta: 'Tool-backed answer' },
              { type: 'text-end', id: 'x' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: modelUsage,
              },
            ],
          }),
        }));
      const toolModel = new MockLanguageModelV4({
        doStream,
        doGenerate: model.doGenerate,
      });
      vi.spyOn(provider, 'chatModel').mockReturnValue(toolModel);
      const { id } = store.create();
      expect(await (await POST(request(id, prompt))).text()).toContain(
        'tool-output-available',
      );
      expect(toolModel.doStreamCalls[0]?.toolChoice).toEqual({
        type: 'tool',
        toolName: name,
      });
      expect(toolModel.doStreamCalls[1]?.toolChoice).toEqual({ type: 'auto' });
      expect(
        toolModel.doStreamCalls[1]?.prompt.some(
          (message) => message.role === 'tool',
        ),
      ).toBe(true);
    }
  });
  it('degrades title failures but retains a completed answer', async () => {
    const model = modelFixture();
    model.doGenerate = () => {
      throw new Error('private title failure');
    };
    vi.spyOn(provider, 'chatModel').mockReturnValue(model);
    const { id } = store.create();
    expect(await (await POST(request(id))).text()).toContain(
      'title could not be generated',
    );
    expect(store.get(id).messages).toHaveLength(2);
    expect(store.get(id).title).toBeNull();
  });
  it('preflights missing API key and refuses busy, invalid and over-budget turns without a model call', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { id } = store.create();
    expect((await POST(request(id))).status).toBe(503);
    const model = modelFixture();
    vi.spyOn(provider, 'chatModel').mockReturnValue(model);
    expect(
      (
        await POST(
          new Request('http://localhost/api/chat', {
            method: 'POST',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(400);
    const lease = store.acquire(id, 'u');
    expect((await POST(request(id))).status).toBe(409);
    store.commit(
      lease,
      { id: 'u', role: 'user', content: 'Hi' },
      { id: 'a', role: 'assistant', content: 'Hello' },
      1000000,
    );
    store.release(lease);
    expect((await POST(request(id))).status).toBe(429);
    expect(model.doStreamCalls).toHaveLength(0);
  });
  it('surfaces persistence commit failure and lease cleanup warning', async () => {
    vi.spyOn(provider, 'chatModel').mockReturnValue(modelFixture());
    const { id } = store.create();
    vi.spyOn(store, 'commit').mockImplementation(() => {
      throw new Error('private storage');
    });
    vi.spyOn(store, 'release').mockImplementation(() => {
      throw new Error('cleanup');
    });
    const body = await (await POST(request(id))).text();
    expect(body).toContain('"type":"error"');
    expect(body).toContain('Storage cleanup');
    expect(store.get(id).messages).toEqual([]);
  });
});

describe('conversation routes', () => {
  it('creates and loads uncached conversations', async () => {
    const response = createConversation();
    expect(response.status).toBe(201);
    const snapshot = (await response.json()) as { id: string };
    const loaded = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: snapshot.id }),
    });
    expect(loaded.headers.get('cache-control')).toBe('no-store');
    expect(await loaded.json()).toMatchObject({
      id: snapshot.id,
      messages: [],
    });
  });
  it('returns validation, not-found, and storage errors', async () => {
    expect(
      (
        await GET(new Request('http://localhost'), {
          params: Promise.resolve({ id: 'invalid' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await GET(new Request('http://localhost'), {
          params: Promise.resolve({ id: randomUUID() }),
        })
      ).status,
    ).toBe(404);
    vi.spyOn(store, 'create').mockImplementation(() => {
      throw new Error('private');
    });
    expect(createConversation().status).toBe(503);
  });
});
