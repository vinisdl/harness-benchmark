import { z } from "zod";
import type { UIMessage } from "ai";

export interface Snapshot {
  title: string;
  tokens: number;
  budget: number;
  messages: UIMessage[];
  warning: string | null;
}
const snapshotSchema = z.object({
  title: z.string(),
  tokens: z.number(),
  budget: z.number(),
  warning: z.string().nullable(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      parts: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    }),
  ),
});
export async function loadConversation(id: string): Promise<Snapshot> {
  const response = await fetch(`/api/conversations/${id}`, {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "Saved conversation could not be loaded. Please refresh to try again.",
    );
  return snapshotSchema.parse((await response.json()) as unknown);
}
