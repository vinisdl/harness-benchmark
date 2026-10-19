// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculate, chatTools } from "@/lib/tools";
import { outgoingMessages } from "@/lib/history";
import { positiveEnv, providerConfig } from "@/lib/config";
import { ChatStore } from "@/lib/store";
import type { ModelMessage, UIMessage } from "ai";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
afterEach(() => vi.unstubAllEnvs());
it("sends each user turn exactly once across multiple turns", () => {
  const history: ModelMessage[] = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "user", content: "Remember 7" },
    { role: "assistant", content: "OK" },
  ];
  expect(outgoingMessages(history, "What number?")).toEqual([
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "user", content: "Remember 7" },
    { role: "assistant", content: "OK" },
    { role: "user", content: "What number?" },
  ]);
  expect(history).toHaveLength(4);
});
describe("arithmetic and tools", () => {
  it.each([
    ["(24 + 18) / 6", 7],
    ["-2 * (3 + 4)", -14],
    [".5 + 2 * 3", 6.5],
  ])("evaluates %s", (expression, result) =>
    expect(calculate(expression)).toBe(result),
  );
  it.each(["process.exit()", "1/0", "1 +", "(2", "2 3", "2**3"])(
    "rejects %s",
    (expression) => expect(() => calculate(expression)).toThrow(),
  );
  it("exposes exactly two executable SDK tools", async () => {
    expect(Object.keys(chatTools)).toEqual(["server_time", "calculator"]);
    expect(
      await chatTools.server_time.execute!(
        {},
        { toolCallId: "t", messages: [], context: {} },
      ),
    ).toHaveProperty("utc");
    expect(
      await chatTools.calculator.execute!(
        { expression: "bad" },
        { toolCallId: "t", messages: [], context: {} },
      ),
    ).toHaveProperty("error");
  });
});
it("preflights configuration without leaking keys", () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(() => providerConfig()).toThrow("Set OPENAI_API_KEY");
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  vi.stubEnv("OPENAI_MODEL", "custom");
  expect(providerConfig().model).toBe("custom");
  vi.stubEnv("TOKEN_BUDGET", "-1");
  expect(positiveEnv("TOKEN_BUDGET", 32000)).toBe(32000);
});
const history: ModelMessage[] = [
  { role: "user", content: "hi" },
  { role: "assistant", content: "hello" },
];
const ui: UIMessage[] = [
  { id: "u", role: "user", parts: [{ type: "text", text: "hi" }] },
  { id: "a", role: "assistant", parts: [{ type: "text", text: "hello" }] },
];
it("persists across connections and prevents concurrent or stale commits", () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-test-"));
  const path = join(dir, "db.sqlite");
  const a = new ChatStore(path),
    b = new ChatStore(path);
  try {
    a.acquire("one", "lease");
    expect(() => b.acquire("one", "other")).toThrow("already");
    expect(() => b.commit("one", "other", history, ui, 10, "Hi")).toThrow();
    a.commit("one", "lease", history, ui, 10, "Hi");
    a.close();
    expect(b.read("one")?.history).toEqual(history);
    expect(b.read("one")?.title).toBe("Hi");
  } finally {
    b.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("does not save failed turns, enforces budget, bounds whole exchanges, expires history", () => {
  const db = new ChatStore(":memory:");
  try {
    db.acquire("one", "a");
    db.release("one", "a");
    expect(db.read("one")?.history).toEqual([]);
    db.acquire("one", "b");
    db.commit("one", "b", history, ui, 20, "Title");
    vi.stubEnv("TOKEN_BUDGET", "20");
    expect(() => db.acquire("one", "c")).toThrow("budget");
    vi.stubEnv("TOKEN_BUDGET", "100");
    vi.stubEnv("HISTORY_MESSAGE_CAP", "2");
    db.acquire("one", "d");
    db.commit(
      "one",
      "d",
      [...history, ...history],
      [...ui, ...ui],
      10,
      "Title",
    );
    expect(db.read("one")?.history).toHaveLength(2);
    vi.stubEnv("HISTORY_BYTE_CAP", "1");
    db.acquire("one", "e");
    expect(() => db.commit("one", "e", history, ui, 1, "Title")).toThrow(
      "too large",
    );
    db.release("one", "e");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 86401000);
    expect(db.read("one")).toBeNull();
    vi.restoreAllMocks();
  } finally {
    db.close();
  }
});
