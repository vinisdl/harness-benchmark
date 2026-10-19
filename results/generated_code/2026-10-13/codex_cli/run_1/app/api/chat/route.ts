import {
  convertToModelMessages,
  generateObject,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { providerConfig } from "@/lib/config";
import { outgoingMessages } from "@/lib/history";
import { store } from "@/lib/store";
import { chatTools } from "@/lib/tools";
export const runtime = "nodejs";
const input = z.object({
  id: z.string().uuid(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.literal("user"),
        parts: z.array(z.object({ type: z.literal("text"), text: z.string() })),
      }),
    )
    .length(1),
});
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    const config = providerConfig();
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: "Please send a valid conversation and one user message." },
        { status: 400 },
      );
    const { id, messages } = parsed.data;
    const user = messages[0] as UIMessage;
    const prompt = messages[0].parts.map((p) => p.text).join("");
    if (!prompt.trim() || Buffer.byteLength(prompt) > 16000)
      return Response.json(
        { error: "Please enter a message under 16 KB." },
        { status: 400 },
      );
    const db = store(),
      lease = randomUUID();
    const previous = db.acquire(id, lease);
    release = () => db.release(id, lease);
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    const model = provider.chat(config.model);
    let failed = false;
    const result = streamText({
      model,
      system:
        "You are a helpful, concise assistant. Always call server_time for current time requests and calculator for arithmetic requests. Never invent tool results.",
      messages: outgoingMessages(previous.history, prompt),
      tools: chatTools,
      stopWhen: stepCountIs(5),
      maxOutputTokens: 2048,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(120000),
      onError: () => {
        failed = true;
        release?.();
      },
      onAbort: () => {
        failed = true;
        release?.();
      },
    });
    return result.toUIMessageStreamResponse({
      originalMessages: [...previous.ui, user],
      onError: () =>
        "The model service is unavailable. Your turn was not saved. Please try again.",
      onFinish: async ({
        messages: ui,
        isAborted,
        isCancelled,
        finishReason,
      }) => {
        try {
          if (failed || isAborted || isCancelled || finishReason === "error")
            return;
          const response = ui.at(-1)!;
          const history = [
            ...outgoingMessages(previous.history, prompt),
            ...(await convertToModelMessages([response])),
          ];
          let title = previous.title;
          let tokens =
            (await result.totalUsage).totalTokens ??
            Math.ceil((prompt.length + JSON.stringify(response).length) / 4);
          if (
            previous.history.length === 0 &&
            tokens < (Number(process.env.TOKEN_BUDGET) || 32000)
          ) {
            try {
              const generated = await generateObject({
                model,
                schema: z.object({ title: z.string().min(1).max(60) }),
                system:
                  "Create a short conversation title, no more than 60 characters.",
                prompt: JSON.stringify(history),
                maxOutputTokens: 100,
                maxRetries: 0,
                abortSignal: AbortSignal.timeout(15000),
              });
              title = generated.object.title;
              tokens += generated.usage.totalTokens ?? 100;
            } catch {
              title = "Conversation (title unavailable)";
            }
          }
          db.commit(id, lease, history, ui, tokens, title);
        } finally {
          release?.();
        }
      },
    });
  } catch (error) {
    release?.();
    const message =
      error instanceof Error &&
      /configured|already in progress|token budget/.test(error.message)
        ? error.message
        : "Unable to start a reply. Please try again.";
    return Response.json({ error: message }, { status: 503 });
  }
}
