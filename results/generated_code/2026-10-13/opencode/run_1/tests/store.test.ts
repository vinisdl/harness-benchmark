import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createStore, LEASE_MS } from "@/lib/store";
import { readConfig } from "@/lib/config";

describe("transactional SQLite store", () => {
  it("persists across independent connections and restarts; fences concurrent and stale writers", () => {
    const directory = mkdtempSync("/workspace/test-db-");
    const path = join(directory, "chat.db");
    const first = createStore(path);
    const second = createStore(path);
    try {
      const session = first.begin("conversation", "turn-1");
      expect(() => second.begin("conversation", "turn-2")).toThrow(
        "already responding",
      );
      second.fail("conversation", "wrong-lease");
      expect(() => second.begin("conversation", "turn-2")).toThrow(
        "already responding",
      );
      first.finish(
        "conversation",
        session.lease,
        { id: "turn-1", user: "Hi", assistant: "Hello" },
        12,
        "Greeting",
      );
      expect(second.get("conversation")).toMatchObject({
        tokens: 12,
        title: "Greeting",
        exchanges: 1,
      });
      expect(() => second.begin("conversation", "turn-1")).toThrow(
        "already completed",
      );
      const next = second.begin("conversation", "turn-2");
      expect(() => {
        first.finish(
          "conversation",
          session.lease,
          { id: "stale", user: "bad", assistant: "bad" },
          1,
        );
      }).toThrow("expired");
      second.fail("conversation", next.lease);
      first.close();
      const restarted = createStore(path);
      try {
        expect(restarted.get("conversation")?.history).toEqual([
          { id: "turn-1", user: "Hi", assistant: "Hello" },
        ]);
      } finally {
        restarted.close();
      }
    } finally {
      try {
        first.close();
      } catch {
        /* Already closed. */
      }
      second.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("enforces budget, message/byte caps, capacity, TTL and failed-turn exclusion", () => {
    const config = readConfig({
      TOKEN_BUDGET: "10",
      HISTORY_MAX_MESSAGES: "2",
      HISTORY_MAX_BYTES: "1024",
      MAX_CONVERSATIONS: "1",
      CONVERSATION_TTL_SECONDS: "1",
    });
    const store = createStore(":memory:", config);
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    try {
      expect(store.get("missing")).toBeNull();
      const first = store.begin("id", "a");
      store.fail("id", first.lease);
      expect(store.get("id")?.history).toEqual([]);
      const retry = store.begin("id", "a");
      store.finish(
        "id",
        retry.lease,
        { id: "a", user: "A", assistant: "B" },
        3,
      );
      const next = store.begin("id", "b");
      store.finish(
        "id",
        next.lease,
        { id: "b", user: "C", assistant: "D" },
        7,
        undefined,
        "Title unavailable",
      );
      expect(store.get("id")?.history).toEqual([
        { id: "b", user: "C", assistant: "D" },
      ]);
      expect(() => store.begin("id", "c")).toThrow("token budget");
      expect(() => store.begin("another", "a")).toThrow("capacity");
      vi.advanceTimersByTime(1001);
      expect(store.get("id")).toBeNull();
      const oversized = store.begin("another", "a");
      store.finish(
        "another",
        oversized.lease,
        { id: "a", user: "x".repeat(2000), assistant: "y" },
        1,
      );
      expect(store.get("another")?.history).toEqual([]);
    } finally {
      store.close();
      vi.useRealTimers();
    }
  });
  it("allows recovery of abandoned leases and rejects their late commits", () => {
    const store = createStore(":memory:");
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    try {
      const old = store.begin("id", "a");
      vi.advanceTimersByTime(LEASE_MS + 1);
      expect(() => {
        store.finish(
          "id",
          old.lease,
          { id: "a", user: "X", assistant: "Y" },
          1,
        );
      }).toThrow("expired");
      const current = store.begin("id", "b");
      store.fail("id", old.lease);
      expect(() => store.begin("id", "c")).toThrow("already responding");
      store.fail("id", current.lease);
    } finally {
      store.close();
      vi.useRealTimers();
    }
  });
});
