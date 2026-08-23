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

/**
 * Structural clone that survives the Set round-trip, via the pair above.
 *
 * The assertion is the honest one: JSON.parse returns `any`, and the shape is
 * only `T` because JSON.stringify was handed a `T` on the way in. Anything not
 * representable in JSON (undefined, functions, Map, cycles) is silently lost or
 * throws -- the same caveats structuredClone has, minus Set support, which is
 * why this pair exists.
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, setReplacer), setReviver) as T;
}
