"use client";

import { useState } from "react";

export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  function submit() {
    if (!text.trim() || busy || disabled) return;
    onSend(text.trim());
    setText("");
  }
  return (
    <footer className="mx-auto w-full max-w-3xl px-5 pb-5 pt-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="rounded-2xl border border-white/15 bg-[#1b1d22] p-3 shadow-xl"
      >
        <label htmlFor="message" className="sr-only">
          Message
        </label>
        <textarea
          id="message"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Message Local Chat…"
          rows={2}
          maxLength={8000}
          disabled={disabled}
          className="w-full resize-none rounded-lg bg-transparent px-2 py-2 text-sm leading-6 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <span className="px-2 text-xs text-zinc-500">
            Enter to send · Shift + Enter for a new line
          </span>
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || !text.trim()}
              className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:opacity-30"
            >
              Send ↑
            </button>
          )}
        </div>
      </form>
      <p className="mt-3 text-center text-xs text-zinc-500">
        Demo · No sign-in · AI can make mistakes
      </p>
    </footer>
  );
}
