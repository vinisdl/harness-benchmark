// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ErrorNotice } from '@/components/error-notice';
import { ChatHeader } from '@/components/chat-header';
import { MessageBubble } from '@/components/message-bubble';
import { MessageList } from '@/components/message-list';
import { Composer } from '@/components/composer';
import ErrorPage from '@/app/error';
import RootLayout, { metadata } from '@/app/layout';

afterEach(cleanup);

describe('ErrorNotice and app error boundary', () => {
  it('shows an accessible error and retries', () => {
    const retry = vi.fn();
    render(<ErrorNotice message="Try later" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Try later');
    fireEvent.click(screen.getByRole('button'));
    expect(retry).toHaveBeenCalledOnce();
  });
  it('omits absent retry and never exposes raw boundary errors', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('private')} reset={reset} />);
    expect(screen.getByRole('alert')).not.toHaveTextContent('private');
    fireEvent.click(screen.getByRole('button'));
    expect(reset).toHaveBeenCalledOnce();
    cleanup();
    render(<ErrorNotice message="Problem" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ChatHeader', () => {
  it('shows title, usage, and new-chat button', () => {
    const newChat = vi.fn();
    render(
      <ChatHeader
        title="My conversation"
        tokens={100}
        budget={32000}
        busy={false}
        onNewChat={newChat}
      />,
    );
    expect(screen.getByRole('heading')).toHaveTextContent('My conversation');
    expect(screen.getByLabelText('Token usage')).toHaveTextContent(
      '100 / 32,000',
    );
    fireEvent.click(screen.getByRole('button'));
    expect(newChat).toHaveBeenCalledOnce();
  });
  it('uses a default title and disables new-chat while streaming', () => {
    render(
      <ChatHeader
        title={null}
        tokens={0}
        budget={100}
        busy
        onNewChat={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading')).toHaveTextContent(
      'A fresh conversation',
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('MessageBubble and MessageList', () => {
  it('renders safe text with separate user/assistant labels', () => {
    render(
      <MessageBubble
        message={{
          id: 'u',
          role: 'user',
          parts: [{ type: 'text', text: '<script>not executable</script>' }],
        }}
      />,
    );
    expect(screen.getByLabelText('Your message')).toHaveTextContent(
      '<script>not executable</script>',
    );
    expect(document.querySelector('script')).toBeNull();
    cleanup();
    render(
      <MessageBubble
        message={{
          id: 'a',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'It is noon.' },
            {
              type: 'tool-server_time',
              toolCallId: 't',
              state: 'output-available',
              input: {},
              output: { utc: 'now' },
            },
            {
              type: 'tool-calculator',
              toolCallId: 'c',
              state: 'input-available',
              input: { expression: '2+2' },
            },
          ],
        }}
      />,
    );
    expect(screen.getByLabelText('Assistant message')).toHaveTextContent(
      'Server time · complete',
    );
    expect(screen.getByLabelText('Assistant message')).toHaveTextContent(
      'Calculator · working',
    );
  });
  it('shows empty suggestions, activity, and incrementally updated content', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const view = render(<MessageList messages={[]} busy={false} />);
    expect(screen.getByRole('heading')).toHaveTextContent('What can I help');
    view.rerender(
      <MessageList
        messages={[
          {
            id: 'a',
            role: 'assistant',
            parts: [{ type: 'text', text: 'First' }],
          },
        ]}
        busy
      />,
    );
    expect(screen.getByRole('log')).toHaveTextContent('First');
    expect(screen.getByRole('status')).toHaveTextContent('working');
    view.rerender(
      <MessageList
        messages={[
          {
            id: 'a',
            role: 'assistant',
            parts: [{ type: 'text', text: 'First second' }],
          },
        ]}
        busy={false}
      />,
    );
    expect(screen.getByRole('log')).toHaveTextContent('First second');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Composer', () => {
  it('sends trimmed text and clears input', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(
      <Composer onSend={send} onStop={vi.fn()} disabled={false} busy={false} />,
    );
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: ' Hello ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith('Hello');
    });
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });
  it('Enter sends, Shift+Enter does not; rejects empty and restores failed sends', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <Composer onSend={send} onStop={vi.fn()} disabled={false} busy={false} />,
    );
    const input = screen.getByLabelText('Message');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Retry me' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(input).toHaveValue('Retry me');
    });
    expect(send).toHaveBeenCalledOnce();
  });
  it('disables submission for exhausted budgets and supports stop', () => {
    const stop = vi.fn();
    const view = render(
      <Composer onSend={vi.fn()} onStop={stop} disabled busy={false} />,
    );
    expect(screen.getByLabelText('Message')).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
    view.rerender(
      <Composer onSend={vi.fn()} onStop={stop} disabled={false} busy />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(stop).toHaveBeenCalledOnce();
  });
});

it('RootLayout supplies semantic document and metadata', () => {
  const root = RootLayout({ children: <div>Children</div> });
  expect(root.type).toBe('html');
  expect(root.props as unknown).toMatchObject({ lang: 'en' });
  expect(metadata.title).toBe('Local Chat');
});
