// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ChatApp } from '@/components/chat-app';
import Home from '@/app/page';
import * as api from '@/lib/client-api';
import type { Conversation } from '@/lib/chat-types';

vi.mock('@/components/chat-session', () => ({
  ChatSession: ({
    initial,
    onNewChat,
  }: {
    initial: Conversation;
    onNewChat: () => void;
  }) => (
    <div>
      <p>{initial.title || 'Ready to chat'}</p>
      <button onClick={onNewChat}>New chat</button>
    </div>
  ),
}));
const snapshot: Conversation = {
  id: '978b01f2-1a13-4f56-8179-3c3d01a84235',
  title: 'Saved title',
  messages: [],
  tokens: 0,
  budget: 100,
  expiresAt: Date.now() + 10000,
};
beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

it('opens a chat, remembers its ID and starts a new one', async () => {
  const load = vi.spyOn(api, 'loadConversation').mockResolvedValue(snapshot);
  render(<ChatApp />);
  expect(screen.getByRole('status')).toHaveTextContent('Opening');
  await screen.findByText('Saved title');
  expect(localStorage.getItem('local-chat-conversation')).toBe(snapshot.id);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('Saved title');
  expect(load).toHaveBeenCalledTimes(2);
});
it('restores history using only the persisted conversation identifier', async () => {
  localStorage.setItem('local-chat-conversation', snapshot.id);
  const load = vi.spyOn(api, 'loadConversation').mockResolvedValue(snapshot);
  render(<ChatApp />);
  await screen.findByText('Saved title');
  expect(load).toHaveBeenCalledWith(snapshot.id, expect.any(AbortSignal));
});
it('creates a replacement when saved history expired', async () => {
  localStorage.setItem('local-chat-conversation', snapshot.id);
  const load = vi
    .spyOn(api, 'loadConversation')
    .mockRejectedValueOnce(new Error('This conversation has expired.'))
    .mockResolvedValueOnce(snapshot);
  render(<ChatApp />);
  await screen.findByText('Saved title');
  expect(load).toHaveBeenCalledTimes(2);
});
it('shows API errors and retries without trapping the user', async () => {
  vi.spyOn(api, 'loadConversation')
    .mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockResolvedValueOnce(snapshot);
  render(<ChatApp />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Storage unavailable',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Saved title');
});
it('does not replace a saved conversation on transient load failure', async () => {
  localStorage.setItem('local-chat-conversation', snapshot.id);
  const load = vi
    .spyOn(api, 'loadConversation')
    .mockRejectedValue(new Error('Network failure'));
  render(<ChatApp />);
  await screen.findByRole('alert');
  expect(load).toHaveBeenCalledOnce();
});
it('handles browser storage restrictions and unmount while loading', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('disabled');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('disabled');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('disabled');
  });
  vi.spyOn(api, 'loadConversation').mockResolvedValue(snapshot);
  const view = render(<ChatApp />);
  await screen.findByText('Saved title');
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('Saved title');
  view.unmount();
  let resolve: ((value: Conversation) => void) | undefined;
  vi.spyOn(api, 'loadConversation').mockReturnValue(
    new Promise((callback) => {
      resolve = callback;
    }),
  );
  const pending = render(<ChatApp />);
  pending.unmount();
  resolve?.(snapshot);
  await waitFor(() => {
    expect(screen.queryByText('Saved title')).toBeNull();
  });
});
it('Home is a Server component composing the Client app', () => {
  const home = Home();
  expect(home.type).toBe('main');
  expect(home.props as unknown).toEqual({
    children: expect.objectContaining({ type: ChatApp }) as unknown,
  });
});
