export function ChatHeader({
  title,
  tokens,
  budget,
  onNew,
  busy,
}: {
  title: string;
  tokens: number;
  budget: number;
  onNew: () => void;
  busy: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-8">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-xs tracking-widest text-lime-300 uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
          Local Chat
        </div>
        <h1 className="truncate font-semibold">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <span
          className="hidden text-xs text-zinc-400 sm:block"
          aria-label="Token usage"
        >
          {tokens.toLocaleString()} / {budget.toLocaleString()} tokens
        </span>
        <button
          disabled={busy}
          onClick={onNew}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
        >
          + New chat
        </button>
      </div>
    </header>
  );
}
