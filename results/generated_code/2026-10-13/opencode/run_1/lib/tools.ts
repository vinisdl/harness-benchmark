import { tool } from "ai";
import { z } from "zod";

// Recursive descent grammar; never evals code or accesses identifiers.
export function calculate(expression: string): number {
  if (expression.length > 200 || !/^[\d\s.+\-*/()%]+$/.test(expression))
    throw new Error("Use only numbers, parentheses, and + - * / %.");
  const tokens = expression.match(/\d+(?:\.\d*)?|\.\d+|[^\s]/g) ?? [];
  let position = 0;
  function atom(): number {
    const token = tokens[position++];
    if (token === "+" || token === "-")
      return (token === "-" ? -1 : 1) * atom();
    if (token === "(") {
      const value = sum();
      if (tokens[position++] !== ")")
        throw new Error("Unbalanced parentheses.");
      return value;
    }
    if (!token || !/^\d*\.?\d+$|^\d+\.$/.test(token))
      throw new Error("Expected a number.");
    return Number(token);
  }
  function product(): number {
    let value = atom();
    while (["*", "/", "%"].includes(tokens[position] ?? "")) {
      const op = tokens[position++];
      const right = atom();
      if ((op === "/" || op === "%") && right === 0)
        throw new Error("Division by zero.");
      value =
        op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const op = tokens[position++];
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  if (position !== tokens.length || !Number.isFinite(result))
    throw new Error("Invalid or non-finite expression.");
  return result;
}

export const chatTools = {
  server_time: tool({
    description:
      "Get the current server date and time in UTC. Always use for current time/date questions.",
    inputSchema: z.object({}),
    execute: () => ({ utc: new Date().toISOString() }),
  }),
  calculator: tool({
    description:
      "Safely evaluate basic arithmetic with +, -, *, /, %, parentheses. Always use for calculations.",
    inputSchema: z.object({ expression: z.string().min(1).max(200) }),
    execute: ({ expression }) => {
      try {
        return { result: calculate(expression) };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Invalid expression.",
        };
      }
    },
  }),
};
