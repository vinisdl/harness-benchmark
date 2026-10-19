import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';

export const modelUsage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
export function modelFixture(
  text = 'Hello from the model',
  chunks?: LanguageModelV4StreamPart[],
) {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: chunks ?? [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: text.slice(0, 5) },
          { type: 'text-delta', id: 'text', delta: text.slice(5) },
          { type: 'text-end', id: 'text' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: modelUsage,
          },
        ],
        chunkDelayInMs: 5,
      }),
    },
    doGenerate: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ title: 'A friendly greeting' }),
        },
      ],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: modelUsage,
      warnings: [],
    },
  });
}
