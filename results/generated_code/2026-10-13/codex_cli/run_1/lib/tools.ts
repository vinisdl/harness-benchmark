import { tool } from "ai";
import { z } from "zod";
export function calculate(expression: string): number {
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/g);
  if (
    !tokens ||
    tokens.join("") !== expression.replace(/\s/g, "") ||
    expression.length > 200
  )
    throw new Error("Use only numbers, parentheses, and + - * /.");
  let i = 0;
  function primary(): number {
    const t = tokens![i++];
    if (t === "+" || t === "-") return (t === "-" ? -1 : 1) * primary();
    if (t === "(") {
      const n = sum();
      if (tokens![i++] !== ")") throw new Error("Unbalanced parentheses");
      return n;
    }
    if (t === undefined || !/^(?:\d|\.)/.test(t))
      throw new Error("Invalid expression");
    return Number(t);
  }
  function product(): number {
    let n = primary();
    while (tokens![i] === "*" || tokens![i] === "/") {
      const op = tokens![i++];
      const r = primary();
      n = op === "*" ? n * r : n / r;
    }
    return n;
  }
  function sum(): number {
    let n = product();
    while (tokens![i] === "+" || tokens![i] === "-") {
      const op = tokens![i++];
      const r = product();
      n = op === "+" ? n + r : n - r;
    }
    return n;
  }
  const result = sum();
  if (i !== tokens.length || !Number.isFinite(result))
    throw new Error("Invalid expression or division by zero");
  return result;
}
export const chatTools = {
  server_time: tool({
    description:
      "Get the current server UTC time. Always use for time requests.",
    inputSchema: z.object({}),
    execute: async () => ({ utc: new Date().toISOString() }),
  }),
  calculator: tool({
    description:
      "Safely calculate basic arithmetic. Always use for calculation requests.",
    inputSchema: z.object({ expression: z.string().max(200) }),
    execute: async ({ expression }) => {
      try {
        return { result: calculate(expression) };
      } catch {
        return {
          error:
            "Invalid arithmetic expression. Use numbers, parentheses, and + - * /.",
        };
      }
    },
  }),
};
