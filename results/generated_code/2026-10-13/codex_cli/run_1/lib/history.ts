import type { ModelMessage } from "ai";
export function outgoingMessages(
  history: ModelMessage[],
  prompt: string,
): ModelMessage[] {
  return [...history, { role: "user", content: prompt }];
}
