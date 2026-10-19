import type { ModelMessage, UIMessage } from "ai";

export interface Exchange {
  user: string;
  assistant: string;
  id: string;
}
export function outgoingMessages(
  history: Exchange[],
  prompt: string,
): ModelMessage[] {
  return [
    ...history.flatMap(({ user, assistant }): ModelMessage[] => [
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ]),
    { role: "user", content: prompt },
  ];
}

export function uiMessages(history: Exchange[]): UIMessage[] {
  return history.flatMap(({ user, assistant, id }) => [
    {
      id: `${id}-user`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: user }],
    },
    {
      id: `${id}-assistant`,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: assistant }],
    },
  ]);
}

export function boundHistory(
  history: Exchange[],
  maxMessages: number,
  maxBytes: number,
): Exchange[] {
  const bounded = [...history];
  while (
    bounded.length * 2 > maxMessages ||
    Buffer.byteLength(JSON.stringify(bounded), "utf8") > maxBytes
  )
    bounded.shift();
  return bounded;
}
