import { AppError } from '@/lib/errors';

function positiveInteger(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new AppError(
      'configuration',
      `Set ${name} to an integer between 1 and ${String(max)}.`,
      503,
    );
  }
  return value;
}

export function getConfig() {
  return {
    databasePath: process.env.DATABASE_PATH || '.data/chat.sqlite',
    tokenBudget: positiveInteger('CONVERSATION_TOKEN_BUDGET', 32000, 10000000),
    maxMessages: Math.max(2, positiveInteger('HISTORY_MAX_MESSAGES', 40, 200)),
    maxBytes: positiveInteger('HISTORY_MAX_BYTES', 65536, 1048576),
    ttlMs: positiveInteger('HISTORY_TTL_SECONDS', 86400, 2592000) * 1000,
    maxConversations: positiveInteger(
      'HISTORY_MAX_CONVERSATIONS',
      1000,
      100000,
    ),
    maxInputBytes: 8000,
    leaseMs: 120000,
    timeoutMs: 90000,
  };
}

export function getProviderConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(
      'missing_api_key',
      'The chat backend needs OPENAI_API_KEY. Set it in your server environment for the local LiteLLM proxy, then restart the app.',
      503,
    );
  }
  const baseURL = process.env.OPENAI_BASE_URL || 'http://localhost:4000/v1';
  const url = new URL(baseURL);
  if (
    !['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(
      url.hostname,
    ) ||
    url.protocol !== 'http:' ||
    url.pathname.replace(/\/$/, '') !== '/v1'
  ) {
    throw new AppError(
      'configuration',
      'OPENAI_BASE_URL must point to the local LiteLLM proxy at port 4000 under /v1.',
      503,
    );
  }
  if (
    url.port !== '4000' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new AppError(
      'configuration',
      'Use the local LiteLLM proxy URL without credentials or query parameters.',
      503,
    );
  }
  return { apiKey, baseURL, model: process.env.OPENAI_MODEL || 'gpt-6.1-sol' };
}
