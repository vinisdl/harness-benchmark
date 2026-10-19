type ChatHeaderProps = {
  title: string | null;
  tokens: number;
  budget: number;
  onNewChat: () => void;
  busy: boolean;
};

export function ChatHeader({
  title,
  tokens,
  budget,
  onNewChat,
  busy,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white/90 px-5 py-4 sm:px-8">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
          Local Chat
        </p>
        <h1 className="truncate text-lg font-semibold text-zinc-900">
          {title || 'A fresh conversation'}
        </h1>
        <p className="mt-1 text-xs text-zinc-500" aria-label="Token usage">
          ≈ {tokens.toLocaleString()} / {budget.toLocaleString()} tokens
        </p>
      </div>
      <button
        type="button"
        onClick={onNewChat}
        disabled={busy}
        className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40"
      >
        + New chat
      </button>
    </header>
  );
}
