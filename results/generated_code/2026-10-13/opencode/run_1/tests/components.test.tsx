// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatInit, UIMessage } from "ai";
import { ChatHeader } from "@/components/chat-header";
import { MessageList } from "@/components/message-list";
import { Composer } from "@/components/composer";
import { Notice } from "@/components/notice";
import { ChatPanel } from "@/components/chat-panel";
import { ChatApp } from "@/components/chat-app";
import Home from "@/app/page";
import RootLayout, { metadata } from "@/app/layout";
import ErrorPage from "@/app/error";
import { loadConversation, type Snapshot } from "@/lib/client";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
  setMessages: vi.fn(),
  status: "ready",
  messages: [] as UIMessage[],
  options: undefined as ChatInit<UIMessage> | undefined,
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: (options: ChatInit<UIMessage>) => {
    mocks.options = options;
    return {
      messages: mocks.messages,
      status: mocks.status,
      sendMessage: mocks.send,
      stop: mocks.stop,
      clearError: mocks.clear,
      setMessages: mocks.setMessages,
    };
  },
}));
vi.mock("@/lib/client", () => ({ loadConversation: vi.fn() }));
const initial: Snapshot = {
  title: "New conversation",
  tokens: 0,
  budget: 1000,
  messages: [],
  warning: null,
};
const id = "e6e3b204-b599-42c8-967a-ce16659d8b3e";
beforeEach(() => {
  mocks.status = "ready";
  mocks.messages = [];
  mocks.send.mockReset().mockResolvedValue(undefined);
  mocks.stop.mockReset();
  mocks.clear.mockReset();
  mocks.setMessages.mockReset();
  vi.mocked(loadConversation).mockReset().mockResolvedValue(initial);
  localStorage.clear();
});

describe("presentational components", () => {
  it("renders title, usage and new-chat action", async () => {
    const onNew = vi.fn();
    render(
      <ChatHeader
        title="A title"
        tokens={50}
        budget={100}
        onNew={onNew}
        busy={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "A title" })).toBeVisible();
    expect(screen.getByLabelText("Token usage")).toHaveTextContent("50 / 100");
    await userEvent.click(screen.getByRole("button", { name: "+ New chat" }));
    expect(onNew).toHaveBeenCalledOnce();
  });
  it("renders empty state, incremental content, tools and failed state", () => {
    const { rerender } = render(
      <MessageList messages={[]} busy={false} failed={false} />,
    );
    expect(screen.getByText("A little space to think.")).toBeVisible();
    const messages: UIMessage[] = [
      { id: "1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      {
        id: "2",
        role: "assistant",
        parts: [
          { type: "text", text: "Hel" },
          {
            type: "tool-server_time",
            toolCallId: "t",
            state: "output-available",
            input: {},
            output: { utc: "now" },
          },
          { type: "step-start" },
        ],
      },
    ];
    rerender(<MessageList messages={messages} busy failed />);
    expect(screen.getByText("Hel")).toBeVisible();
    expect(screen.getByText("Tool: server time")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("responding");
    expect(screen.getByText(/last attempted turn/)).toBeVisible();
    rerender(
      <MessageList
        messages={[
          {
            id: "2",
            role: "assistant",
            parts: [{ type: "text", text: "Hello world" }],
          },
        ]}
        busy={false}
        failed={false}
      />,
    );
    expect(screen.getByText("Hello world")).toBeVisible();
  });
  it("renders actionable notices and hides empty ones", () => {
    const { rerender } = render(<Notice message={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<Notice message="Try again" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Try again");
  });
  it("sends trimmed text via click or enter, preserves shift-enter, respects busy/disabled and stops", async () => {
    const send = vi.fn();
    const stop = vi.fn();
    const { rerender } = render(
      <Composer onSend={send} onStop={stop} busy={false} disabled={false} />,
    );
    const input = screen.getByRole("textbox");
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
    await userEvent.type(input, "  hello  ");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(send).toHaveBeenCalledWith("hello");
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).toHaveBeenCalledWith("second");
    rerender(<Composer onSend={send} onStop={stop} busy disabled={false} />);
    fireEvent.change(input, { target: { value: "busy" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(stop).toHaveBeenCalledOnce();
    rerender(<Composer onSend={send} onStop={stop} busy={false} disabled />);
    expect(input).toBeDisabled();
    const form = input.closest("form");
    if (!form) throw new Error("Missing form");
    fireEvent.submit(form);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("chat panel", () => {
  it("sends only the newest prompt through real DefaultChatTransport", async () => {
    render(<ChatPanel id={id} initial={initial} onNew={vi.fn()} />);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        'data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
        {
          headers: {
            "content-type": "text/event-stream",
            "x-vercel-ai-ui-message-stream": "v1",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const transport = mocks.options?.transport;
    if (!transport) throw new Error("Missing transport");
    await transport.sendMessages({
      chatId: id,
      trigger: "submit-message",
      messageId: undefined,
      messages: [
        { id: "old", role: "user", parts: [{ type: "text", text: "Old" }] },
        { id: "new", role: "user", parts: [{ type: "text", text: "Latest" }] },
      ],
      abortSignal: undefined,
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    if (typeof options.body !== "string") throw new Error("Expected JSON body");
    expect(JSON.parse(options.body) as unknown).toEqual({
      id,
      turnId: "new",
      prompt: "Latest",
    });
    await userEvent.type(screen.getByRole("textbox"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(mocks.setMessages).toHaveBeenCalledWith([]);
    expect(mocks.send).toHaveBeenCalledWith({ text: "Hello" });
  });
  it("displays provider failure, then excludes failed local messages from retry", async () => {
    render(<ChatPanel id={id} initial={initial} onNew={vi.fn()} />);
    act(() => {
      mocks.options?.onError?.(new Error("Provider unavailable"));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Provider unavailable");
    await userEvent.type(screen.getByRole("textbox"), "Retry");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(mocks.setMessages).toHaveBeenCalledWith(initial.messages);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("refreshes structured title and usage after completion; budget disables further sends", async () => {
    vi.mocked(loadConversation).mockResolvedValue({
      ...initial,
      title: "Generated title",
      tokens: 1000,
    });
    render(<ChatPanel id={id} initial={initial} onNew={vi.fn()} />);
    act(() => {
      mocks.options?.onFinish?.({
        message: { id: "a", role: "assistant", parts: [] },
        messages: [],
        isAbort: false,
        isError: false,
        isDisconnect: false,
      });
    });
    await screen.findByRole("heading", { name: "Generated title" });
    expect(screen.getByRole("alert")).toHaveTextContent("token budget");
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
  it("rescues abort, disconnect, snapshot failures, and send rejection", async () => {
    render(<ChatPanel id={id} initial={initial} onNew={vi.fn()} />);
    act(() => {
      mocks.options?.onFinish?.({
        message: { id: "a", role: "assistant", parts: [] },
        messages: [],
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Response stopped");
    act(() => {
      mocks.options?.onFinish?.({
        message: { id: "a", role: "assistant", parts: [] },
        messages: [],
        isAbort: false,
        isError: false,
        isDisconnect: true,
      });
    });
    vi.mocked(loadConversation).mockRejectedValueOnce(new Error("failed"));
    act(() => {
      mocks.options?.onFinish?.({
        message: { id: "a", role: "assistant", parts: [] },
        messages: [],
        isAbort: false,
        isError: false,
        isDisconnect: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Reload before continuing",
      );
    });
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
  it("rescues rejected send promises", async () => {
    mocks.send.mockRejectedValueOnce(new Error("send failure"));
    render(<ChatPanel id={id} initial={initial} onNew={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("could not be sent");
    });
  });
  it("exposes stop and disables new chat during streaming", async () => {
    mocks.status = "streaming";
    render(<ChatPanel id={id} initial={initial} onNew={vi.fn()} />);
    expect(screen.getByRole("button", { name: "+ New chat" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
});

describe("application and server components", () => {
  it("restores conversation and starts a fresh one", async () => {
    localStorage.setItem("local-chat-conversation", id);
    vi.mocked(loadConversation).mockResolvedValue({
      ...initial,
      title: "Restored title",
    });
    render(<ChatApp />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    await screen.findByRole("heading", { name: "Restored title" });
    expect(loadConversation).toHaveBeenCalledWith(id);
    await userEvent.click(screen.getByRole("button", { name: "+ New chat" }));
    expect(
      screen.getByRole("heading", { name: "New conversation" }),
    ).toBeVisible();
    expect(localStorage.getItem("local-chat-conversation")).not.toBe(id);
  });
  it("recovers disabled localStorage and displays load failures", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.mocked(loadConversation).mockRejectedValueOnce(new Error("failed"));
    render(<ChatApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please refresh",
    );
  });
  it("generates a conversation id and tolerates storage write failure", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<ChatApp />);
    await screen.findByRole("heading", { name: "New conversation" });
    await userEvent.click(screen.getByRole("button", { name: "+ New chat" }));
    expect(
      screen.getByRole("heading", { name: "New conversation" }),
    ).toBeVisible();
  });
  it("renders server page, layout metadata and error recovery", async () => {
    expect(Home().type).toBe(ChatApp);
    const layout = RootLayout({ children: <p>Content</p> });
    expect(layout.type).toBe("html");
    expect(layout.props as unknown).toMatchObject({ lang: "en" });
    expect(metadata.title).toBe("Local Chat");
    const reset = vi.fn();
    render(<ErrorPage error={new Error("private")} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.queryByText("private")).toBeNull();
  });
});
