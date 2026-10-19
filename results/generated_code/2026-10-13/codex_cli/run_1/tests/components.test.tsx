import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Composer } from "@/components/composer";
import { MessageList } from "@/components/message-list";
import { Chat } from "@/components/chat";
import Home from "@/app/page";
import Layout, { metadata } from "@/app/layout";
const mocked = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  clearError: vi.fn(),
  status: "ready",
  error: undefined as Error | undefined,
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({ ...mocked, messages: [] }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocked.status = "ready";
  mocked.error = undefined;
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], title: "Saved title", tokens: 42 }),
    }),
  );
});
it("composer submits trimmed text and clears input", () => {
  const send = vi.fn();
  render(<Composer disabled={false} onSend={send} />);
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: " Hello " },
  });
  fireEvent.click(screen.getByRole("button"));
  expect(send).toHaveBeenCalledWith("Hello");
  expect(screen.getByLabelText("Message")).toHaveValue("");
});
it("composer disables sends and preserves Shift+Enter", () => {
  const send = vi.fn();
  const { rerender } = render(<Composer disabled={false} onSend={send} />);
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "hi" },
  });
  fireEvent.keyDown(screen.getByLabelText("Message"), {
    key: "Enter",
    shiftKey: true,
  });
  expect(send).not.toHaveBeenCalled();
  rerender(<Composer disabled onSend={send} />);
  expect(screen.getByRole("button")).toBeDisabled();
});
it("renders incremental assistant text and busy state", () => {
  const { rerender } = render(
    <MessageList
      messages={[
        { id: "a", role: "assistant", parts: [{ type: "text", text: "Hel" }] },
      ]}
      busy
    />,
  );
  expect(screen.getByText("Hel")).toBeVisible();
  expect(screen.getByRole("status")).toBeVisible();
  rerender(
    <MessageList
      messages={[
        {
          id: "a",
          role: "assistant",
          parts: [{ type: "text", text: "Hello" }],
        },
      ]}
      busy={false}
    />,
  );
  expect(screen.getByText("Hello")).toBeVisible();
});
it("restores title and sends a suggested tool request", async () => {
  render(<Chat />);
  await screen.findByText("Saved title");
  fireEvent.click(screen.getByText("What is the current UTC time?"));
  expect(mocked.sendMessage).toHaveBeenCalledWith({
    text: "What is the current UTC time?",
  });
  fireEvent.click(screen.getByText("+ New chat"));
  await waitFor(() => expect(mocked.setMessages).toHaveBeenCalledWith([]));
});
it("shows provider errors and supports recovery", async () => {
  mocked.error = new Error("Provider unavailable");
  render(<Chat />);
  expect(screen.getByRole("alert")).toHaveTextContent("Provider unavailable");
  fireEvent.click(screen.getByText("Dismiss and reload saved history"));
  expect(mocked.clearError).toHaveBeenCalled();
  await screen.findByText("Saved title");
});
it("shows persistence errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<Chat />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
});
it("server page composes the client app and layout has metadata", () => {
  expect(Home().type).toBe(Chat);
  expect(Layout({ children: "content" }).type).toBe("html");
  expect(metadata.title).toBe("Local Chat");
});
