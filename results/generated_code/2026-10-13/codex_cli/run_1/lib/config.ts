export function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
export function providerConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim())
    throw new Error(
      "Chat is not configured. Set OPENAI_API_KEY in the server environment and restart the app.",
    );
  return {
    apiKey,
    baseURL: "http://localhost:4000/v1",
    model: process.env.OPENAI_MODEL || "gpt-6.1-sol",
  };
}
