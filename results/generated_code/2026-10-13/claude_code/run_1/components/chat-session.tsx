'use client';

import { useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  type ChatMessage,
  type Conversation,
  messageText,
  toUIMessages,
} from '@/lib/chat-types';
import { checkedFetch, loadConversation } from '@/lib/client-api';
import { ChatHeader } from '@/components/chat-header';
import { MessageList } from '@/components/message-list';
import { Composer } from '@/components/composer';
import { ErrorNotice } from '@/components/error-notice';

export function ChatSession({
  initial,
  onNewChat,
}: {
  initial: Conversation;
  onNewChat: () => void;
}) {
  const [info, setInfo] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [initialMessages] = useState(() => toUIMessages(initial.messages));
  const committed = useRef(initialMessages);
  const [transport] = useState(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: '/api/chat',
        fetch: checkedFetch,
        prepareSendMessagesRequest: ({ messages }) => {
          const latest = messages.at(-1);
          if (!latest || latest.role !== 'user')
            throw new Error('Enter a new message to continue.');
          return {
            body: {
              conversationId: initial.id,
              message: { id: latest.id, text: messageText(latest) },
            },
          };
        },
      }),
  );
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    clearError,
    stop,
  } = useChat<ChatMessage>({
    id: initial.id,
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type === 'data-conversation')
        setInfo((previous) => ({ ...previous, ...part.data }));
      if (part.type === 'data-warning') setNotice(part.data.message);
    },
    onError: () => {
      setNotice(
        'The unfinished turn is not part of your saved conversation. You can try again or start a new chat.',
      );
    },
    onFinish: ({ messages: completed, isAbort, isError, isDisconnect }) => {
      if (isAbort || isError || isDisconnect) {
        setMessages(committed.current);
        if (isAbort)
          setNotice('Response stopped. The unfinished exchange was not saved.');
        return;
      }
      committed.current = completed;
      setRefreshing(true);
      void loadConversation(initial.id)
        .then((saved) => {
          setInfo(saved);
          committed.current = toUIMessages(saved.messages);
          setMessages(committed.current);
        })
        .catch(() => {
          setNeedsReload(true);
          setNotice(
            'The answer completed, but saved history could not be refreshed. Reload before your next turn.',
          );
        })
        .finally(() => {
          setRefreshing(false);
        });
    },
  });
  const busy = status === 'submitted' || status === 'streaming';
  const exhausted = info.tokens >= info.budget;
  async function send(text: string) {
    setNotice(null);
    clearError();
    setMessages(committed.current);
    await sendMessage({ text });
  }
  return (
    <section className="flex h-dvh flex-col bg-white">
      <ChatHeader
        title={info.title}
        tokens={info.tokens}
        budget={info.budget}
        onNewChat={onNewChat}
        busy={busy}
      />
      <MessageList messages={messages} busy={busy} />
      <div className="space-y-3 border-t border-zinc-100 px-5 pb-5 pt-4 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-2">
          {error && <ErrorNotice message={error.message} />}
          {notice && <ErrorNotice message={notice} />}
          {exhausted && (
            <ErrorNotice message="This chat has reached its token budget. Start a new chat to keep going." />
          )}
        </div>
        <Composer
          onSend={send}
          onStop={() => {
            void stop();
          }}
          busy={busy}
          disabled={exhausted || refreshing || needsReload}
        />
      </div>
    </section>
  );
}
