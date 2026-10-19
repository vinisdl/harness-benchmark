"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useState } from "react";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
type Snapshot = {
  messages: UIMessage[];
  title: string;
  tokens: number;
  error?: string;
  pending?: boolean;
};
export function Chat() {
  const [id, setId] = useState("");
  const [title, setTitle] = useState("New conversation");
  const [tokens, setTokens] = useState(0);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { id, messages: [messages.at(-1)] },
        }),
      }),
    [id],
  );
  const { messages, setMessages, sendMessage, status, error, clearError } =
    useChat({
      id,
      transport,
      onFinish: () => {
        void refresh(false);
      },
    });
  async function refresh(restore: boolean) {
    try {
      const response = await fetch(`/api/conversations/${id}`);
      const data = (await response.json()) as Snapshot;
      if (!response.ok) throw new Error(data.error);
      if (data.pending && !restore) {
        window.setTimeout(() => {
          void refresh(false);
        }, 500);
        return;
      }
      setTitle(data.title);
      setTokens(data.tokens);
      if (restore) setMessages(data.messages);
    } catch {
      setNotice(
        "Could not load conversation details. Please reload to try again.",
      );
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    try {
      setId(localStorage.getItem("conversation-id") || crypto.randomUUID());
    } catch {
      setId(crypto.randomUUID());
    }
  }, []);
  useEffect(() => {
    if (!id) return;
    try {
      localStorage.setItem("conversation-id", id);
    } catch {
      /* Persistence still works by conversation ID. */
    }
    void refresh(true); /* ID changes are the only restore trigger. */
  }, [id]);
  const busy = status === "submitted" || status === "streaming";
  function newChat() {
    setReady(false);
    setMessages([]);
    setTitle("New conversation");
    setTokens(0);
    setNotice("");
    clearError();
    setId(crypto.randomUUID());
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-emerald-400 px-2 py-1 font-bold text-black">
            ↗
          </span>
          <span className="font-semibold">Local Chat</span>
          <span className="hidden text-xs text-slate-500 sm:inline">
            Streaming · Tools · Persistent
          </span>
        </div>
        <button
          onClick={newChat}
          disabled={busy}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm"
        >
          + New chat
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-5">
        <div className="flex items-center justify-between py-6 text-sm text-slate-400">
          <h1>{title}</h1>
          <span>{tokens.toLocaleString()} tokens used</span>
        </div>
        <div className="flex-1 pb-10">
          {messages.length === 0 ? (
            <div className="py-20 text-center">
              <h2 className="text-3xl font-semibold">What can I help with?</h2>
              <p className="mt-4 text-slate-400">
                Ask a question, check the time, or calculate something.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {[
                  "What is the current UTC time?",
                  "Calculate (24 + 18) / 6",
                ].map((text) => (
                  <button
                    className="rounded-xl border border-slate-700 px-4 py-3 text-sm"
                    key={text}
                    disabled={!ready || busy}
                    onClick={() => {
                      void sendMessage({ text });
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <MessageList messages={messages} busy={busy} />
          )}
        </div>
        {(error || notice) && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-600/40 bg-amber-900/20 p-4 text-sm text-amber-200"
          >
            {error?.message || notice}
            <button
              className="ml-3 underline"
              onClick={() => {
                clearError();
                setNotice("");
                void refresh(true);
              }}
            >
              Dismiss and reload saved history
            </button>
          </div>
        )}
        <Composer
          disabled={!ready || busy}
          onSend={(text) => {
            clearError();
            setNotice("");
            void sendMessage({ text });
          }}
        />
        <p className="mt-3 text-center text-xs text-slate-500">
          Demo without authentication. Avoid sharing sensitive information.
        </p>
      </main>
    </div>
  );
}
