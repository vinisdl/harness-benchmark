import { tool } from 'ai';
import { z } from 'zod';
import { calculate } from '@/lib/calculator';

export const chatTools = {
  server_time: tool({
    description:
      'Return the current server date and time in UTC. Always use for current time/date requests.',
    inputSchema: z.object({}),
    execute: () => ({ utc: new Date().toISOString(), timezone: 'UTC' }),
  }),
  calculator: tool({
    description:
      'Safely evaluate basic arithmetic with +, -, *, /, %, unary signs and parentheses. Always use for calculations.',
    inputSchema: z.object({ expression: z.string().min(1).max(200) }),
    execute: ({ expression }) => {
      try {
        return { expression, result: calculate(expression) };
      } catch (error) {
        return {
          expression,
          error:
            error instanceof Error
              ? error.message
              : 'Invalid arithmetic expression.',
        };
      }
    },
  }),
};

export function selectTool(prompt: string): keyof typeof chatTools | undefined {
  if (/\b(time|date|clock|utc|today)\b/i.test(prompt)) return 'server_time';
  if (
    /\b(calculate|compute|arithmetic|sum|multiply|divide|subtract|plus|minus|times)\b/i.test(
      prompt,
    ) ||
    /\d\s*[+\-*/%]\s*[\d(]/.test(prompt)
  )
    return 'calculator';
  return undefined;
}
