import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/chat-types';
import { MessageBubble } from '@/components/message-bubble';

export function MessageList({
  messages,
  busy,
}: {
  messages: ChatMessage[];
  busy: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);
  return (
    <div
      className="flex-1 overflow-y-auto px-5 py-8 sm:px-8"
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      aria-busy={busy}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.length === 0 && (
          <div className="py-16 text-center">
            <span
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-2xl font-bold text-white"
              aria-hidden="true"
            >
              L
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">
              What can I help you explore?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
              Ask a question, work through an idea, or try a calculation. Your
              conversation stays on this server.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-zinc-500">
              <span className="rounded-full border border-zinc-200 px-3 py-2">
                “What time is it in UTC?”
              </span>
              <span className="rounded-full border border-zinc-200 px-3 py-2">
                “Calculate (12 + 8) × 3”
              </span>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {busy && (
          <p role="status" className="animate-pulse text-sm text-emerald-700">
            Assistant is working…
          </p>
        )}
        <div ref={end} />
      </div>
    </div>
  );
}
