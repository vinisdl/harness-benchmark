import { describe, it, expect } from 'vitest';
import { calculate } from '@/lib/calculator';
import { chatTools, selectTool } from '@/lib/tools';
import { asSchema } from 'ai';

describe('safe calculator', () => {
  it.each([
    ['2 + 3 * 4', 14],
    ['(12 + 8) * 3', 60],
    ['-2 * +3', -6],
    ['8 / 2 - 1', 3],
    ['10 % 3', 1],
    ['.5 + 1.5', 2],
    ['--2', 2],
    ['-0', 0],
    ['2.', 2],
  ])('evaluates %s', (expression, result) => {
    expect(calculate(expression)).toBe(result);
  });
  it.each([
    '',
    '1 / 0',
    '1 % 0',
    'process.exit()',
    '2 ** 4',
    '(1 + 2',
    '1 2',
    '1 +',
    '1e8',
    '1)',
  ])('rejects %s', (expression) => {
    expect(() => calculate(expression)).toThrow();
  });
  it('limits length and nesting', () => {
    expect(() => calculate('1'.repeat(201))).toThrow('1–200');
    expect(() => calculate('('.repeat(31) + '1' + ')'.repeat(31))).toThrow(
      'nested',
    );
    expect(() =>
      calculate('9'.repeat(180) + '*' + '9'.repeat(10) + '*' + '9'.repeat(7)),
    ).not.toThrow();
    expect(() =>
      calculate('9'.repeat(99) + '*' + '9'.repeat(99)),
    ).not.toThrow();
  });
});

describe('exactly two AI SDK tools', () => {
  it('exposes only calculator and server_time with real schemas and executions', async () => {
    expect(Object.keys(chatTools).sort()).toEqual([
      'calculator',
      'server_time',
    ]);
    const time = await chatTools.server_time.execute(
      {},
      { toolCallId: 'test', messages: [], context: {} },
    );
    expect(time).toEqual({
      utc: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/) as unknown,
      timezone: 'UTC',
    });
    expect(
      await chatTools.calculator.execute(
        { expression: '2 + 2' },
        { toolCallId: 'test', messages: [], context: {} },
      ),
    ).toEqual({ expression: '2 + 2', result: 4 });
    expect(
      await chatTools.calculator.execute(
        { expression: '2 / 0' },
        { toolCallId: 'test', messages: [], context: {} },
      ),
    ).toEqual({
      expression: '2 / 0',
      error: 'Division by zero is not allowed.',
    });
    const schema = asSchema(chatTools.calculator.inputSchema);
    expect((await schema.validate?.({ expression: '3 * 5' }))?.success).toBe(
      true,
    );
    expect((await schema.validate?.({ expression: '' }))?.success).toBe(false);
  });
  it.each([
    ['What time is it?', 'server_time'],
    ['What is the date today?', 'server_time'],
    ['Calculate 12 * 3', 'calculator'],
    ['What is 2 + 2?', 'calculator'],
    ['Tell me a story', undefined],
  ])('selects first-step tool for %s', (prompt, expected) => {
    expect(selectTool(prompt)).toBe(expected);
  });
});
