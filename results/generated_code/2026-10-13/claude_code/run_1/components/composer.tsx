import { useState } from 'react';

export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
}: {
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  function submit() {
    const prompt = text.trim();
    if (!prompt || disabled || busy) return;
    setText('');
    void onSend(prompt).catch(() => {
      setText(prompt);
    });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mx-auto w-full max-w-3xl"
    >
      <div className="flex items-end gap-3 rounded-2xl border border-zinc-300 bg-white p-3 shadow-sm focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
        <label htmlFor="prompt" className="sr-only">
          Message
        </label>
        <textarea
          id="prompt"
          rows={2}
          maxLength={8000}
          value={text}
          disabled={disabled || busy}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Message Local Chat…"
          className="max-h-48 min-h-12 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none disabled:opacity-50"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm text-white"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
          >
            Send
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-zinc-400">
        Enter to send · Shift + Enter for a new line · AI can make mistakes
      </p>
    </form>
  );
}
