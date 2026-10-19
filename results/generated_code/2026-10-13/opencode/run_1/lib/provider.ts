import { createOpenAI } from "@ai-sdk/openai";
import { readConfig } from "./config";
import { ChatError } from "./errors";

export function chatModel() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key)
    throw new ChatError(
      "The demo needs an API key. Set OPENAI_API_KEY in the server environment, then restart the app.",
      503,
    );
  return createOpenAI({
    apiKey: key,
    baseURL: "http://localhost:4000/v1",
  }).chat(readConfig().OPENAI_MODEL);
}
