import type { ChatMessage } from '@/lib/chat-types';
import { messageText } from '@/lib/chat-types';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const tools = message.parts.filter(
    (part) =>
      part.type === 'tool-server_time' || part.type === 'tool-calculator',
  );
  return (
    <article
      aria-label={isUser ? 'Your message' : 'Assistant message'}
      className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}
    >
      {!isUser && (
        <span
          aria-hidden="true"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-sm font-bold text-white"
        >
          L
        </span>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${isUser ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-800'}`}
      >
        <p className="mb-1 text-xs font-semibold text-zinc-500">
          {isUser ? 'You' : 'Assistant'}
        </p>
        {tools.map((part, index) => (
          <p
            key={index}
            className="mb-2 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
          >
            {part.type === 'tool-server_time' ? 'Server time' : 'Calculator'} ·{' '}
            {'state' in part && part.state === 'output-available'
              ? 'complete'
              : 'working'}
          </p>
        ))}
        <div className="whitespace-pre-wrap break-words text-[15px] leading-7">
          {messageText(message)}
        </div>
      </div>
    </article>
  );
}
