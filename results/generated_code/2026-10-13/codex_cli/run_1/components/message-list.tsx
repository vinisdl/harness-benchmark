import type { UIMessage } from "ai";
export function MessageList({
  messages,
  busy,
}: {
  messages: UIMessage[];
  busy: boolean;
}) {
  return (
    <div className="space-y-8" aria-live="polite" aria-label="Conversation">
      {messages.map((message) => (
        <article
          key={message.id}
          className={
            message.role === "user"
              ? "ml-auto max-w-[85%] rounded-2xl bg-[#292d37] px-5 py-3"
              : "max-w-full"
          }
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {message.role === "user" ? "You" : "Local Chat"}
          </p>
          {message.parts.map((part, index) =>
            part.type === "text" ? (
              <p className="whitespace-pre-wrap leading-7" key={index}>
                {part.text}
              </p>
            ) : part.type.startsWith("tool-") ? (
              <p key={index} className="my-2 text-sm text-emerald-300">
                Using {part.type.slice(5).replaceAll("_", " ")}…
              </p>
            ) : null,
          )}
        </article>
      ))}
      {busy && (
        <p role="status" className="text-sm text-slate-400">
          Generating reply…
        </p>
      )}
    </div>
  );
}
