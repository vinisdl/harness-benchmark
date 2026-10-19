"use client";

import { useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { loadConversation, type Snapshot } from "@/lib/client";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { Notice } from "./notice";

export function ChatPanel({
  id,
  initial,
  onNew,
}: {
  id: string;
  initial: Snapshot;
  onNew: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [notice, setNotice] = useState<string | null>(initial.warning);
  const [failed, setFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const saved = useRef(initial.messages);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages.at(-1);
          return {
            body: {
              id,
              turnId: last?.id,
              prompt: last?.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join(""),
            },
          };
        },
      }),
    [id],
  );
  const { messages, sendMessage, status, setMessages, stop, clearError } =
    useChat({
      id,
      transport,
      messages: initial.messages,
      onError: (error) => {
        setFailed(true);
        setNotice(
          error.message || "The assistant is unavailable. Please try again.",
        );
      },
      onFinish: ({ isAbort, isError, isDisconnect }) => {
        if (isAbort || isError || isDisconnect) {
          setFailed(true);
          if (isAbort) setNotice("Response stopped. This turn was not saved.");
          return;
        }
        setSyncing(true);
        void loadConversation(id)
          .then((next) => {
            saved.current = next.messages;
            setSnapshot(next);
            setNotice(next.warning);
          })
          .catch(() => {
            setSyncFailed(true);
            setFailed(true);
            setNotice(
              "The reply finished, but saved history could not be refreshed. Reload before continuing.",
            );
          })
          .finally(() => {
            setSyncing(false);
          });
      },
    });
  const busy = status === "submitted" || status === "streaming" || syncing;
  const exhausted = snapshot.tokens >= snapshot.budget;
  function send(text: string) {
    if (busy || exhausted || syncFailed) return;
    setMessages(saved.current);
    clearError();
    setFailed(false);
    setNotice(null);
    void sendMessage({ text }).catch(() => {
      setFailed(true);
      setNotice("Your message could not be sent. Please try again.");
    });
  }
  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader
        title={snapshot.title}
        tokens={snapshot.tokens}
        budget={snapshot.budget}
        onNew={onNew}
        busy={busy}
      />
      <Notice
        message={
          exhausted
            ? "This conversation has reached its token budget. Start a new chat to continue."
            : notice
        }
      />
      <main className="flex-1 overflow-y-auto">
        <MessageList messages={messages} busy={busy} failed={failed} />
      </main>
      <Composer
        onSend={send}
        onStop={() => {
          void stop();
        }}
        busy={busy}
        disabled={exhausted || syncing || syncFailed}
      />
    </div>
  );
}
