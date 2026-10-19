// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  commit: vi.fn(),
  read: vi.fn(),
  streamText: vi.fn(),
  generateObject: vi.fn(),
}));
vi.mock("@/lib/store", () => ({ store: () => mocks }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: mocks.streamText,
  generateObject: mocks.generateObject,
}));
import { POST } from "@/app/api/chat/route";
import { GET } from "@/app/api/conversations/[id]/route";
const id = "a6c596cf-4d60-4aa6-9a2a-8f2046cb58f3";
function request(
  body: unknown = {
    id,
    messages: [
      { id: "u", role: "user", parts: [{ type: "text", text: "hello" }] },
    ],
  },
) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  mocks.acquire.mockReturnValue({
    history: [],
    ui: [],
    tokens: 0,
    title: "New conversation",
  });
});
it("preflights missing key before persistence and provider", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const res = await POST(request());
  expect(await res.text()).toContain("Set OPENAI_API_KEY");
  expect(mocks.streamText).not.toHaveBeenCalled();
});
it("rejects invalid input and budget errors", async () => {
  expect((await POST(request({}))).status).toBe(400);
  mocks.acquire.mockImplementation(() => {
    throw new Error("This conversation has reached its token budget.");
  });
  expect(await (await POST(request())).text()).toContain("token budget");
  expect(mocks.streamText).not.toHaveBeenCalled();
});
it("rescues synchronous provider errors and releases lease", async () => {
  mocks.streamText.mockImplementation(() => {
    throw new Error("private provider details");
  });
  const res = await POST(request());
  expect(await res.text()).not.toContain("private");
  expect(mocks.release).toHaveBeenCalled();
  expect(mocks.commit).not.toHaveBeenCalled();
});
it("streams through the real SDK response surface and commits completed turns with structured title", async () => {
  mocks.generateObject.mockResolvedValue({
    object: { title: "Greeting" },
    usage: { totalTokens: 4 },
  });
  mocks.streamText.mockReturnValue({
    totalUsage: Promise.resolve({ totalTokens: 12 }),
    toUIMessageStreamResponse: vi.fn((options) => {
      void options;
      return new Response("stream");
    }),
  });
  expect(await (await POST(request())).text()).toBe("stream");
  const args = mocks.streamText.mock.calls[0][0];
  expect(args.messages).toEqual([{ role: "user", content: "hello" }]);
  expect(Object.keys(args.tools)).toEqual(["server_time", "calculator"]);
  expect(args.system).toContain("Always call");
  const options =
    mocks.streamText.mock.results[0].value.toUIMessageStreamResponse.mock
      .calls[0][0];
  await options.onFinish({
    messages: [
      { id: "u", role: "user", parts: [{ type: "text", text: "hello" }] },
      { id: "a", role: "assistant", parts: [{ type: "text", text: "Hi" }] },
    ],
    isAborted: false,
    finishReason: "stop",
  });
  expect(mocks.generateObject).toHaveBeenCalled();
  expect(mocks.commit.mock.calls[0][4]).toBe(16);
  expect(mocks.commit.mock.calls[0][5]).toBe("Greeting");
});
it("never commits stream failures or aborted replies", async () => {
  mocks.streamText.mockReturnValue({
    toUIMessageStreamResponse: vi.fn(() => new Response()),
  });
  await POST(request());
  const args = mocks.streamText.mock.calls[0][0];
  args.onError({ error: new Error("bad") });
  const options =
    mocks.streamText.mock.results[0].value.toUIMessageStreamResponse.mock
      .calls[0][0];
  expect(options.onError()).toContain("not saved");
  await options.onFinish({ messages: [], isAborted: true });
  expect(mocks.commit).not.toHaveBeenCalled();
});
it("read endpoint validates IDs and degrades safely", async () => {
  expect(
    (await GET(request(), { params: Promise.resolve({ id: "bad" }) })).status,
  ).toBe(400);
  mocks.read.mockReturnValue(null);
  expect(
    await (await GET(request(), { params: Promise.resolve({ id }) })).json(),
  ).toEqual({
    messages: [],
    title: "New conversation",
    tokens: 0,
    pending: false,
  });
  mocks.read.mockImplementation(() => {
    throw new Error("disk");
  });
  expect(
    (await GET(request(), { params: Promise.resolve({ id }) })).status,
  ).toBe(503);
});
