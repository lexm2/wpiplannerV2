// JSON replacer/reviver pair for serializing Set objects. Use with JSON.stringify/parse.

export function setReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return { __type: 'Set', value: Array.from(value) };
  }
  return value;
}

export function setReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && '__type' in value) {
    const obj = value as Record<string, unknown>;
    if (obj.__type === 'Set' && Array.isArray(obj.value)) {
      return new Set(obj.value);
    }
  }
  return value;
}
