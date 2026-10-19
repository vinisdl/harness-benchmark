// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { ChatSession } from '@/components/chat-session';
import type { Conversation } from '@/lib/chat-types';

const initial: Conversation = {
  id: '978b01f2-1a13-4f56-8179-3c3d01a84235',
  title: null,
  messages: [],
  tokens: 0,
  budget: 100,
  expiresAt: Date.now() + 100000,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('real useChat renders token deltas before completion, then displays the title', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  function emit(chunk: unknown) {
    streamController?.enqueue(
      encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
    );
  }
  const saved = {
    ...initial,
    title: 'A streamed greeting',
    tokens: 22,
    messages: [
      { id: 'u', role: 'user', content: 'Hello' },
      { id: 'a', role: 'assistant', content: 'First token and second token' },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => {
      if (url !== '/api/chat') return Promise.resolve(Response.json(saved));
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller;
              emit({ type: 'start', messageId: 'a' });
              emit({ type: 'start-step' });
              emit({ type: 'text-start', id: 'text' });
              emit({ type: 'text-delta', id: 'text', delta: 'First token' });
            },
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'x-vercel-ai-ui-message-stream': 'v1',
            },
          },
        ),
      );
    }),
  );
  render(<ChatSession initial={initial} onNewChat={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('First token')).toBeVisible();
  expect(screen.queryByText(/second token/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await act(async () => {
    emit({ type: 'text-delta', id: 'text', delta: ' and second token' });
    emit({ type: 'text-end', id: 'text' });
    emit({ type: 'finish-step' });
    emit({
      type: 'data-conversation',
      data: { title: 'A streamed greeting', tokens: 22, budget: 100 },
      transient: true,
    });
    emit({ type: 'finish', finishReason: 'stop' });
    streamController?.enqueue(encoder.encode('data: [DONE]\n\n'));
    streamController?.close();
    await Promise.resolve();
  });
  expect(await screen.findByText('First token and second token')).toBeVisible();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'A streamed greeting',
  );
  expect(screen.getByLabelText('Token usage')).toHaveTextContent('22 / 100');
});

it('real useChat surfaces a friendly HTTP preflight error in the page', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json(
          { error: 'Set OPENAI_API_KEY in your server environment.' },
          { status: 503 },
        ),
      ),
    ),
  );
  render(<ChatSession initial={initial} onNewChat={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(
    await screen.findByText('Set OPENAI_API_KEY in your server environment.'),
  ).toBeVisible();
});
