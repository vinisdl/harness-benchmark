// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ChatInit, HttpChatTransportInitOptions } from 'ai';
import { useChat } from '@ai-sdk/react';
import type { ChatMessage, Conversation } from '@/lib/chat-types';
import { ChatSession } from '@/components/chat-session';
import * as api from '@/lib/client-api';

const mocks = vi.hoisted(() => ({
  setMessages: vi.fn(),
  sendMessage: vi.fn(),
  stop: vi.fn(),
  clearError: vi.fn(),
}));
let options: ChatInit<ChatMessage> | undefined;
let transportOptions: HttpChatTransportInitOptions<ChatMessage> | undefined;
vi.mock('@ai-sdk/react', () => ({ useChat: vi.fn() }));
vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('ai')>();
  return {
    ...original,
    DefaultChatTransport: class extends original.DefaultChatTransport<ChatMessage> {
      constructor(input: HttpChatTransportInitOptions<ChatMessage>) {
        super(input);
        transportOptions = input;
      }
    },
  };
});
const initial: Conversation = {
  id: '978b01f2-1a13-4f56-8179-3c3d01a84235',
  title: null,
  messages: [],
  tokens: 0,
  budget: 100,
  expiresAt: Date.now() + 10000,
};
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  mocks.setMessages.mockClear();
  mocks.sendMessage.mockReset().mockResolvedValue(undefined);
  mocks.stop.mockReset().mockResolvedValue(undefined);
  mocks.clearError.mockClear();
  vi.mocked(useChat).mockImplementation((input) => {
    options = input as ChatInit<ChatMessage>;
    return {
      id: initial.id,
      regenerate: vi.fn(),
      resumeStream: vi.fn(),
      addToolResult: vi.fn(),
      addToolOutput: vi.fn(),
      addToolApprovalResponse: vi.fn(),
      messages: [],
      status: 'ready',
      error: undefined,
      setMessages: mocks.setMessages,
      sendMessage: mocks.sendMessage,
      stop: mocks.stop,
      clearError: mocks.clearError,
    } satisfies ReturnType<typeof useChat>;
  });
  vi.spyOn(api, 'loadConversation').mockResolvedValue(initial);
});
afterEach(cleanup);

it('sends only the current user prompt via the real transport option surface', async () => {
  render(<ChatSession initial={initial} onNewChat={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'Hi' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => {
    expect(mocks.sendMessage).toHaveBeenCalledWith({ text: 'Hi' });
  });
  const payload = await transportOptions?.prepareSendMessagesRequest?.({
    id: initial.id,
    messages: [
      { id: 'old', role: 'user', parts: [{ type: 'text', text: 'Old' }] },
      { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'Answer' }] },
      { id: 'new', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
    ],
    api: '/api/chat',
    trigger: 'submit-message',
    messageId: 'new',
    requestMetadata: undefined,
    body: undefined,
    headers: undefined,
    credentials: undefined,
  });
  expect(payload?.body).toEqual({
    conversationId: initial.id,
    message: { id: 'new', text: 'Hi' },
  });
  expect(() =>
    transportOptions?.prepareSendMessagesRequest?.({
      id: initial.id,
      messages: [],
      api: '/api/chat',
      trigger: 'submit-message',
      messageId: undefined,
      requestMetadata: undefined,
      body: undefined,
      headers: undefined,
      credentials: undefined,
    }),
  ).toThrow('new message');
});
it('displays structured title, token metadata, and warnings while streaming', () => {
  render(<ChatSession initial={initial} onNewChat={vi.fn()} />);
  act(() => {
    options?.onData?.({
      type: 'data-conversation',
      data: { title: 'Generated title', tokens: 22, budget: 100 },
    });
    options?.onData?.({
      type: 'data-warning',
      data: { message: 'Title unavailable' },
    });
  });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Generated title',
  );
  expect(screen.getByLabelText('Token usage')).toHaveTextContent('22 / 100');
  expect(screen.getByRole('alert')).toHaveTextContent('Title unavailable');
});
it('rolls back failed/aborted turns and shows degraded UI', () => {
  render(<ChatSession initial={initial} onNewChat={vi.fn()} />);
  const finish = {
    message: { id: 'a', role: 'assistant' as const, parts: [] },
    messages: [],
    isAbort: true,
    isError: false,
    isDisconnect: false,
  };
  act(() => {
    options?.onFinish?.(finish);
  });
  expect(mocks.setMessages).toHaveBeenCalledWith([]);
  expect(screen.getByRole('alert')).toHaveTextContent('Response stopped');
  act(() => {
    options?.onError?.(new Error('Provider down'));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('unfinished turn');
});
it('refreshes authoritative committed history on successful completion', async () => {
  const saved = {
    ...initial,
    title: 'Saved title',
    messages: [
      { id: 'u', role: 'user' as const, content: 'Hi' },
      { id: 'a', role: 'assistant' as const, content: 'Hello' },
    ],
  };
  vi.spyOn(api, 'loadConversation').mockResolvedValue(saved);
  render(<ChatSession initial={initial} onNewChat={vi.fn()} />);
  act(() => {
    options?.onFinish?.({
      message: { id: 'a', role: 'assistant', parts: [] },
      messages: [],
      isAbort: false,
      isError: false,
      isDisconnect: false,
    });
  });
  await screen.findByText('Saved title');
  expect(mocks.setMessages).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ id: 'u' })]),
  );
});
it('surfaces refresh failure and refuses exhausted conversation input', async () => {
  vi.spyOn(api, 'loadConversation').mockRejectedValue(new Error('offline'));
  render(
    <ChatSession initial={{ ...initial, tokens: 100 }} onNewChat={vi.fn()} />,
  );
  expect(screen.getByLabelText('Message')).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('budget');
  act(() => {
    options?.onFinish?.({
      message: { id: 'a', role: 'assistant', parts: [] },
      messages: [],
      isAbort: false,
      isError: false,
      isDisconnect: false,
    });
  });
  await screen.findByText(/saved history could not be refreshed/);
});
it('renders SDK error and supports stop via the real useChat API', () => {
  vi.mocked(useChat).mockReturnValue({
    id: initial.id,
    regenerate: vi.fn(),
    resumeStream: vi.fn(),
    addToolResult: vi.fn(),
    addToolOutput: vi.fn(),
    addToolApprovalResponse: vi.fn(),
    messages: [],
    status: 'streaming',
    error: new Error('Friendly model error'),
    setMessages: mocks.setMessages,
    sendMessage: mocks.sendMessage,
    stop: mocks.stop,
    clearError: mocks.clearError,
  } satisfies ReturnType<typeof useChat>);
  render(<ChatSession initial={initial} onNewChat={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Friendly model error');
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(mocks.stop).toHaveBeenCalledOnce();
});
