export function calculate(expression: string): number {
  if (!expression.trim() || expression.length > 200)
    throw new Error('Use an arithmetic expression of 1–200 characters.');
  const tokens =
    expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/%]|\S/g) ?? [];
  let index = 0;
  let depth = 0;
  function checked(value: number): number {
    if (!Number.isFinite(value))
      throw new Error('The result must be finite (no division by zero).');
    return value;
  }
  function primary(): number {
    if (++depth > 30) throw new Error('The expression is too deeply nested.');
    const token = tokens[index++];
    let result: number;
    if (token === '+' || token === '-')
      result = (token === '-' ? -1 : 1) * primary();
    else if (token === '(') {
      result = sum();
      if (tokens[index++] !== ')') throw new Error('Close every parenthesis.');
    } else if (token && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token))
      result = checked(Number(token));
    else
      throw new Error(
        'Only numbers, parentheses, and + - * / % are supported.',
      );
    depth--;
    return checked(result);
  }
  function product(): number {
    let value = primary();
    while (['*', '/', '%'].includes(tokens[index] ?? '')) {
      const operator = tokens[index++];
      const right = primary();
      if ((operator === '/' || operator === '%') && right === 0)
        throw new Error('Division by zero is not allowed.');
      value = checked(
        operator === '*'
          ? value * right
          : operator === '/'
            ? value / right
            : value % right,
      );
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const right = product();
      value = checked(operator === '+' ? value + right : value - right);
    }
    return value;
  }
  const result = sum();
  if (index !== tokens.length)
    throw new Error('Unexpected characters in the expression.');
  return Object.is(result, -0) ? 0 : result;
}
