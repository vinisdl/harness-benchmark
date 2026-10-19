'use client';

import { useEffect, useState } from 'react';
import type { Conversation } from '@/lib/chat-types';
import { loadConversation } from '@/lib/client-api';
import { ChatSession } from '@/components/chat-session';
import { ErrorNotice } from '@/components/error-notice';

const STORAGE_KEY = 'local-chat-conversation';

export function ChatApp() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function initialize() {
      try {
        let id: string | undefined;
        try {
          id = localStorage.getItem(STORAGE_KEY) ?? undefined;
        } catch {
          /* Storage may be disabled. */
        }
        let saved: Conversation;
        if (id) {
          try {
            saved = await loadConversation(id, controller.signal);
          } catch (failure) {
            if (failure instanceof Error && failure.message.includes('expired'))
              saved = await loadConversation(undefined, controller.signal);
            else throw failure;
          }
        } else saved = await loadConversation(undefined, controller.signal);
        if (controller.signal.aborted) return;
        try {
          localStorage.setItem(STORAGE_KEY, saved.id);
        } catch {
          /* The chat works without reload restoration. */
        }
        setConversation(saved);
        setError(null);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not open your conversation. Please try again.',
          );
      }
    }
    void initialize();
    return () => {
      controller.abort();
    };
  }, [generation]);
  function newChat() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Browser storage is optional. */
    }
    setConversation(null);
    setError(null);
    setGeneration((value) => value + 1);
  }
  if (conversation)
    return (
      <ChatSession
        key={conversation.id}
        initial={conversation}
        onNewChat={newChat}
      />
    );
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md">
        <h1 className="mb-4 text-2xl font-semibold">Local Chat</h1>
        {error ? (
          <ErrorNotice message={error} onRetry={newChat} />
        ) : (
          <p role="status" className="text-sm text-zinc-500">
            Opening your conversation…
          </p>
        )}
      </div>
    </div>
  );
}
