import type { UIMessage } from "ai";

export function MessageList({
  messages,
  busy,
  failed,
}: {
  messages: UIMessage[];
  busy: boolean;
  failed: boolean;
}) {
  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-8 px-5 py-8"
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {messages.length === 0 && (
        <section className="py-16 text-center sm:py-24">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-300/10 text-2xl text-lime-300">
            ✳
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            A little space to think.
          </h2>
          <p className="mx-auto mt-4 max-w-md leading-relaxed text-zinc-400">
            Ask a question, work through an idea, or let the assistant check the
            time and do the math.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs text-zinc-500">
            <span className="rounded-full border border-white/10 px-3 py-2">
              Live streaming
            </span>
            <span className="rounded-full border border-white/10 px-3 py-2">
              Saved conversations
            </span>
            <span className="rounded-full border border-white/10 px-3 py-2">
              Two useful tools
            </span>
          </div>
        </section>
      )}
      {messages.map((message) => (
        <article
          key={message.id}
          className={
            message.role === "user"
              ? "ml-auto max-w-[90%] rounded-2xl bg-white/7 px-5 py-4"
              : "pr-4"
          }
        >
          <h2 className="mb-2 text-xs font-semibold text-zinc-400">
            {message.role === "user" ? "You" : "Assistant"}
          </h2>
          {message.parts.map((part, index) => {
            if (part.type === "text")
              return (
                <p
                  key={index}
                  className="whitespace-pre-wrap leading-7 break-words"
                >
                  {part.text}
                </p>
              );
            if (part.type.startsWith("tool-"))
              return (
                <div
                  key={index}
                  className="my-2 rounded-lg border border-lime-300/15 px-3 py-2 text-xs text-lime-300"
                >
                  Tool: {part.type.slice(5).replaceAll("_", " ")}
                </div>
              );
            return null;
          })}
        </article>
      ))}
      {busy && (
        <p role="status" className="animate-pulse text-sm text-lime-300">
          Assistant is responding…
        </p>
      )}
      {failed && messages.length > 0 && (
        <p className="text-xs text-amber-300">
          The last attempted turn is incomplete and will not be used as
          conversation history.
        </p>
      )}
    </div>
  );
}
