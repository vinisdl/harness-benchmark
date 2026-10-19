"use client";

import { useEffect, useState } from "react";
import { loadConversation, type Snapshot } from "@/lib/client";
import { ChatPanel } from "./chat-panel";
import { Notice } from "./notice";

const STORAGE_KEY = "local-chat-conversation";
export function ChatApp() {
  const [conversation, setConversation] = useState<{
    id: string;
    snapshot: Snapshot;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let id: string;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      id =
        stored &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          stored,
        )
          ? stored
          : crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      id = crypto.randomUUID();
    }
    void loadConversation(id)
      .then((snapshot) => {
        if (active) setConversation({ id, snapshot });
      })
      .catch(() => {
        if (active)
          setError(
            "Saved conversation could not be loaded. Please refresh to try again.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  function newChat() {
    const id = crypto.randomUUID();
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* Storage may be disabled; chat remains usable. */
    }
    if (conversation)
      setConversation({
        id,
        snapshot: {
          title: "New conversation",
          tokens: 0,
          budget: conversation.snapshot.budget,
          messages: [],
          warning: null,
        },
      });
  }
  if (!conversation)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-xl font-semibold">Local Chat</h1>
        {error ? (
          <Notice message={error} />
        ) : (
          <p role="status" className="text-zinc-400">
            Loading your conversation…
          </p>
        )}
      </main>
    );
  return (
    <ChatPanel
      key={conversation.id}
      id={conversation.id}
      initial={conversation.snapshot}
      onNew={newChat}
    />
  );
}
