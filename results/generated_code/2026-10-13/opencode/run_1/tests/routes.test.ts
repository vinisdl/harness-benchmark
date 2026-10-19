import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/conversations/[id]/route";
import { POST } from "@/app/api/chat/route";
import { getStore } from "@/lib/store";
import { handleChat } from "@/lib/chat";

vi.mock("@/lib/store", () => ({ getStore: vi.fn() }));
vi.mock("@/lib/chat", () => ({ handleChat: vi.fn() }));
const id = "e6e3b204-b599-42c8-967a-ce16659d8b3e";
function context(value = id) {
  return { params: Promise.resolve({ id: value }) };
}

describe("App Router API handlers", () => {
  it("delegates POST to chat handler", async () => {
    const request = new Request("http://localhost");
    vi.mocked(handleChat).mockResolvedValueOnce(new Response("ok"));
    expect(await (await POST(request)).text()).toBe("ok");
    expect(handleChat).toHaveBeenCalledWith(request);
  });
  it("validates ids, restores saved messages and returns safe errors", async () => {
    expect(
      (await GET(new Request("http://localhost"), context("invalid"))).status,
    ).toBe(400);
    const get = vi.fn().mockReturnValue(null);
    vi.mocked(getStore).mockReturnValue({ get } as unknown as ReturnType<
      typeof getStore
    >);
    expect(
      await (await GET(new Request("http://localhost"), context())).json(),
    ).toMatchObject({ title: "New conversation", messages: [], tokens: 0 });
    get.mockReturnValueOnce({
      title: "Saved",
      history: [{ id: "turn", user: "Hi", assistant: "Hey" }],
      tokens: 3,
      budget: 100,
      warning: null,
    });
    expect(
      await (await GET(new Request("http://localhost"), context())).json(),
    ).toMatchObject({
      title: "Saved",
      messages: [
        { id: "turn-user", role: "user" },
        { id: "turn-assistant", role: "assistant" },
      ],
    });
    get.mockImplementationOnce(() => {
      throw new Error("private");
    });
    const failed = await GET(new Request("http://localhost"), context());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private");
  });
});
