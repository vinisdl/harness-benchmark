import { describe, expect, it, vi } from "vitest";
import { calculate, chatTools } from "@/lib/tools";
import { boundHistory, outgoingMessages, uiMessages } from "@/lib/history";
import { readConfig, SYSTEM_PROMPT } from "@/lib/config";
import { ChatError, PROVIDER_ERROR, publicError } from "@/lib/errors";
import { chatModel } from "@/lib/provider";
import { loadConversation } from "@/lib/client";
import { generateText } from "ai";

describe("history", () => {
  const history = [
    { id: "1", user: "Hello", assistant: "Hi!" },
    { id: "2", user: "My name is Ada", assistant: "Hello Ada" },
  ];
  it("sends each user message exactly once, with the next prompt outside replayed history", () => {
    expect(outgoingMessages(history, "What is my name?")).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "My name is Ada" },
      { role: "assistant", content: "Hello Ada" },
      { role: "user", content: "What is my name?" },
    ]);
    expect(outgoingMessages([], "First")).toEqual([
      { role: "user", content: "First" },
    ]);
  });
  it("bounds complete pairs by count and UTF-8 bytes without mutating the input", () => {
    expect(boundHistory(history, 2, 1000)).toEqual([history[1]]);
    expect(boundHistory(history, 10, 2)).toEqual([]);
    expect(
      boundHistory(
        [{ id: "3", user: "🌍".repeat(20), assistant: "ok" }],
        10,
        70,
      ),
    ).toEqual([]);
    expect(history).toHaveLength(2);
    expect(uiMessages(history).map((message) => message.id)).toEqual([
      "1-user",
      "1-assistant",
      "2-user",
      "2-assistant",
    ]);
  });
});

describe("tools", () => {
  it.each([
    ["2 + 3 * (4 - 1)", 11],
    ["-2 + +4", 2],
    ["10 / 2 % 3", 2],
    [".5 + 2.", 2.5],
  ])("calculates %s safely", (expression, result) => {
    expect(calculate(expression)).toBe(result);
  });
  it.each([
    "process.exit()",
    "1/0",
    "1%0",
    "(2+3",
    "2 3",
    "",
    ".",
    "2**3",
    "9".repeat(201),
    "9".repeat(200) + "*9",
  ])("rejects %s", (expression) => {
    expect(() => calculate(expression)).toThrow();
  });
  it("exposes exactly two real SDK tools with input schemas and safe outputs", async () => {
    expect(Object.keys(chatTools)).toEqual(["server_time", "calculator"]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    try {
      expect(
        await chatTools.server_time.execute(
          {},
          { toolCallId: "1", messages: [], context: {} },
        ),
      ).toEqual({ utc: "2026-10-13T12:00:00.000Z" });
      expect(
        await chatTools.calculator.execute(
          { expression: "2+2" },
          { toolCallId: "2", messages: [], context: {} },
        ),
      ).toEqual({ result: 4 });
      expect(
        await chatTools.calculator.execute(
          { expression: "1/0" },
          { toolCallId: "3", messages: [], context: {} },
        ),
      ).toEqual({ error: "Division by zero." });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("configuration and provider", () => {
  it("uses the real OpenAI provider Chat Completions API at the mandated local proxy", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("OPENAI_MODEL", "gpt-6.1-sol");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: "test",
        object: "chat.completion",
        created: 1,
        model: "gpt-6.1-sol",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateText({
      model: chatModel(),
      prompt: "Hello",
      maxRetries: 0,
    });
    expect(result.text).toBe("Hello");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/v1/chat/completions",
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    if (typeof options.body !== "string")
      throw new Error("Missing JSON payload");
    expect(JSON.parse(options.body) as unknown).toMatchObject({
      model: "gpt-6.1-sol",
      messages: [{ role: "user", content: "Hello" }],
    });
  });
  it("has sane defaults and validates configuration", () => {
    expect(readConfig({}).OPENAI_MODEL).toBe("gpt-6.1-sol");
    expect(readConfig({ TOKEN_BUDGET: "123" }).TOKEN_BUDGET).toBe(123);
    expect(() => readConfig({ HISTORY_MAX_MESSAGES: "1" })).toThrow();
    expect(SYSTEM_PROMPT).toContain("MUST call calculator");
  });
  it("fails preflight safely and supports model overrides", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => chatModel()).toThrow("Set OPENAI_API_KEY");
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    expect(chatModel().modelId).toBe("test-model");
    expect(publicError(new Error("private provider detail"))).toBe(
      PROVIDER_ERROR,
    );
    expect(publicError(new ChatError("Friendly"))).toBe("Friendly");
  });
});

describe("client snapshot loading", () => {
  it("loads valid snapshots and rejects errors or malformed payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        title: "Test",
        tokens: 0,
        budget: 100,
        messages: [],
        warning: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect((await loadConversation("abc")).title).toBe("Test");
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations/abc", {
      cache: "no-store",
    });
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(loadConversation("abc")).rejects.toThrow(
      "could not be loaded",
    );
    fetchMock.mockResolvedValueOnce(Response.json({ invalid: true }));
    await expect(loadConversation("abc")).rejects.toThrow();
  });
});
