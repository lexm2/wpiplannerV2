// JSON serialization utilities for handling Set objects.

/**
 * JSON replacer for serializing Set objects to arrays.
 * Use with JSON.stringify(data, setReplacer)
 */
export function setReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value) };
    }
    return value;
}

/**
 * JSON reviver for deserializing arrays back to Set objects.
 * Use with JSON.parse(json, setReviver)
 */
export function setReviver(_key: string, value: unknown): unknown {
    if (typeof value === 'object' && value !== null && '__type' in value) {
        const obj = value as Record<string, unknown>;
        if (obj.__type === 'Set' && Array.isArray(obj.value)) {
            return new Set(obj.value);
        }
    }
    return value;
}
