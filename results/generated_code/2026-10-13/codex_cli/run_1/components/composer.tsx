"use client";
import { useState } from "react";
export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  function submit() {
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText("");
    }
  }
  return (
    <form
      className="rounded-2xl border border-slate-700 bg-[#20242c] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label="Message"
        placeholder="Ask anything…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        maxLength={16000}
        rows={2}
        className="w-full resize-none bg-transparent p-2 outline-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Shift + Enter for a new line
        </span>
        <button
          disabled={disabled || !text.trim()}
          className="rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black"
          type="submit"
        >
          Send ↑
        </button>
      </div>
    </form>
  );
}
