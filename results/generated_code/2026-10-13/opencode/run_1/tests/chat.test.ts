import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MockLanguageModelV4 } from "ai/test";
import { handleChat } from "@/lib/chat";
import { createStore } from "@/lib/store";
import { readConfig } from "@/lib/config";
import { PROVIDER_ERROR } from "@/lib/errors";
import { streamText, generateObject } from "ai";

vi.mock("ai", async (original) => {
  const actual = await original<typeof import("ai")>();
  return {
    ...actual,
    streamText: vi.fn(actual.streamText),
    generateObject: vi.fn(actual.generateObject),
  };
});
vi.mock("@/lib/provider", () => ({ chatModel: vi.fn() }));
import { chatModel } from "@/lib/provider";

const id = "e6e3b204-b599-42c8-967a-ce16659d8b3e";
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
function request(prompt = "Hello", turnId = "turn-1") {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({ id, prompt, turnId }),
  });
}
function model(chunks = ["Hello", " world"]) {
  return new MockLanguageModelV4({
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "text" });
            for (const text of chunks)
              controller.enqueue({
                type: "text-delta",
                id: "text",
                delta: text,
              });
            controller.enqueue({ type: "text-end", id: "text" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage,
            });
            controller.close();
          },
        }),
      }),
    doGenerate: () =>
      Promise.resolve({
        content: [
          { type: "text", text: JSON.stringify({ title: "A greeting" }) },
        ],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      }),
  });
}

beforeEach(() => {
  vi.mocked(streamText).mockClear();
  vi.mocked(generateObject).mockClear();
  vi.mocked(chatModel).mockReturnValue(model());
});

describe("streaming chat with the real AI SDK", () => {
  it("delivers a delta before the provider completes its reply", async () => {
    const store = createStore(":memory:");
    let complete: (() => void) | undefined;
    vi.mocked(chatModel).mockReturnValueOnce(
      new MockLanguageModelV4({
        doStream: () =>
          Promise.resolve({
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: "stream-start", warnings: [] });
                controller.enqueue({ type: "text-start", id: "text" });
                controller.enqueue({
                  type: "text-delta",
                  id: "text",
                  delta: "First token",
                });
                complete = () => {
                  controller.enqueue({
                    type: "text-delta",
                    id: "text",
                    delta: " last token",
                  });
                  controller.enqueue({ type: "text-end", id: "text" });
                  controller.enqueue({
                    type: "finish",
                    finishReason: { unified: "stop", raw: "stop" },
                    usage,
                  });
                  controller.close();
                };
              },
            }),
          }),
        doGenerate: () =>
          Promise.resolve({
            content: [{ type: "text", text: '{"title":"Streaming test"}' }],
            finishReason: { unified: "stop", raw: "stop" },
            usage,
            warnings: [],
          }),
      }),
    );
    try {
      const response = await handleChat(request(), store);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing streaming body");
      let received = "";
      while (!received.includes('"delta":"First token"')) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("Premature completion");
        received += new TextDecoder().decode(chunk.value);
      }
      expect(received).not.toContain("last token");
      expect(store.get(id)?.history).toEqual([]);
      if (!complete) throw new Error("Missing completion gate");
      complete();
      let chunk = await reader.read();
      while (!chunk.done) {
        received += new TextDecoder().decode(chunk.value);
        chunk = await reader.read();
      }
      expect(received).toContain("last token");
      expect(store.get(id)?.history[0]?.assistant).toBe(
        "First token last token",
      );
    } finally {
      store.close();
    }
  });
  it("emits separate text deltas, persists only a completed exchange, creates structured title, and replays exact multi-turn payload", async () => {
    const store = createStore(":memory:");
    try {
      const response = await handleChat(request(), store);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      const stream = await response.text();
      expect(stream).toContain('"delta":"Hello"');
      expect(stream).toContain('"delta":" world"');
      expect(store.get(id)).toMatchObject({
        title: "A greeting",
        tokens: 30,
        exchanges: 1,
      });
      expect(vi.mocked(generateObject).mock.calls[0]?.[0]).toHaveProperty(
        "schema",
      );
      const second = await handleChat(
        request("What did I say?", "turn-2"),
        store,
      );
      await second.text();
      expect(vi.mocked(streamText).mock.calls[1]?.[0].messages).toEqual([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hello world" },
        { role: "user", content: "What did I say?" },
      ]);
      expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(1);
      const options = vi.mocked(streamText).mock.calls[0]?.[0];
      expect(options?.system).toContain("MUST call server_time");
      expect(Object.keys(options?.tools ?? {})).toEqual([
        "server_time",
        "calculator",
      ]);
    } finally {
      store.close();
    }
  });
  it("shows safe provider errors and never persists failed turns", async () => {
    const store = createStore(":memory:");
    vi.mocked(chatModel).mockReturnValue(
      new MockLanguageModelV4({
        doStream: () => Promise.reject(new Error("private detail")),
      }),
    );
    try {
      const response = await handleChat(request(), store);
      const body = await response.text();
      expect(body).toContain(PROVIDER_ERROR);
      expect(body).not.toContain("private detail");
      expect(store.get(id)?.history).toEqual([]);
      expect(() => store.begin(id, "retry")).not.toThrow();
    } finally {
      store.close();
    }
  });
  it("retains successful reply with visible warning if title generation fails", async () => {
    const store = createStore(":memory:");
    vi.mocked(generateObject).mockRejectedValueOnce(
      new Error("private title error"),
    );
    try {
      await (await handleChat(request(), store)).text();
      expect(store.get(id)).toMatchObject({
        title: "Untitled conversation",
        warning: "Your reply was saved, but the title service is unavailable.",
        tokens: 15,
      });
    } finally {
      store.close();
    }
  });
  it("refuses exceeded budgets before streamText or title generation", async () => {
    const store = createStore(":memory:", readConfig({ TOKEN_BUDGET: "1" }));
    try {
      await (await handleChat(request(), store)).text();
      expect(generateObject).not.toHaveBeenCalled();
      const response = await handleChat(request("More", "turn-2"), store);
      expect(response.status).toBe(429);
      expect(await response.text()).toContain("Start a new chat");
      expect(streamText).toHaveBeenCalledTimes(1);
    } finally {
      store.close();
    }
  });
  it("rescues invalid JSON, oversized inputs, preflight failures and synchronous SDK failures", async () => {
    const store = createStore(":memory:");
    try {
      expect((await handleChat(request(""), store)).status).toBe(400);
      expect(
        (
          await handleChat(
            new Request("http://localhost", {
              method: "POST",
              body: "no json",
            }),
            store,
          )
        ).status,
      ).toBe(503);
      expect(
        (
          await handleChat(
            new Request("http://localhost", {
              method: "POST",
              body: "{}",
              headers: { "content-length": "50000" },
            }),
            store,
          )
        ).status,
      ).toBe(413);
      vi.mocked(chatModel).mockImplementationOnce(() => {
        throw new Error("secret");
      });
      expect(await (await handleChat(request(), store)).text()).toBe(
        PROVIDER_ERROR,
      );
      vi.mocked(streamText).mockImplementationOnce(() => {
        throw new Error("synchronous");
      });
      expect((await handleChat(request(), store)).status).toBe(503);
      expect(store.get(id)?.history).toEqual([]);
    } finally {
      store.close();
    }
  });
  it("rejects empty replies and rescues persistence failures", async () => {
    const store = createStore(":memory:");
    try {
      vi.mocked(chatModel).mockReturnValueOnce(model([""]));
      expect(await (await handleChat(request(), store)).text()).toContain(
        "could not complete",
      );
      expect(store.get(id)?.history).toEqual([]);
      vi.spyOn(store, "finish").mockImplementationOnce(() => {
        throw new Error("database failure");
      });
      expect(
        await (await handleChat(request("Retry", "turn-2"), store)).text(),
      ).toContain("could not be saved");
      expect(store.get(id)?.history).toEqual([]);
    } finally {
      store.close();
    }
  });
  it("uses the SDK structured-output schema contract", async () => {
    const result = await generateObject({
      model: model(),
      schema: z.object({ title: z.string() }),
      prompt: "Title",
    });
    expect(result.object).toEqual({ title: "A greeting" });
  });
});
