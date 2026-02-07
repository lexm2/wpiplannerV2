// Safely serializes and deserializes complex data with circular references (Course ↔ Department) and Set objects.

/**
 * Creates a JSON replacer function that handles:
 * - Circular references (Course ↔ Department)
 * - Set serialization
 *
 * @returns A replacer function compatible with JSON.stringify
 */
export function createJSONReplacer(): (key: string, value: unknown) => unknown {
    return (key: string, value: unknown): unknown => {
        // Handle Set serialization
        if (value instanceof Set) {
            const setArray: unknown[] = [];
            value.forEach(item => setArray.push(item));
            return { __type: 'Set', value: setArray };
        }

        // Break circular reference: Course → Department → Course[]
        // Keep only essential department info, strip the courses array
        if (key === 'department' && value && typeof value === 'object' && 'courses' in value) {
            return {
                abbreviation: (value as Record<string, unknown>).abbreviation,
                name: (value as Record<string, unknown>).name
            };
        }


        return value;
    };
}

/**
 * Creates a JSON reviver function that restores complex types
 * from their serialized form.
 *
 * @returns A reviver function compatible with JSON.parse
 */
export function createJSONReviver(): (key: string, value: unknown) => unknown {
    return (_key: string, value: unknown): unknown => {
        // Restore Set from serialized form
        if (typeof value === 'object' && value !== null && '__type' in value && (value as Record<string, unknown>).__type === 'Set') {
            const setData = (value as Record<string, unknown>).value;
            if (Array.isArray(setData)) {
                return new Set(setData);
            }
        }
        return value;
    };
}

/**
 * Safely stringifies data that may contain circular references or complex types.
 *
 * @param data The data to stringify
 * @param space Optional indentation for pretty-printing (default: no formatting)
 * @returns JSON string representation
 * @throws Error if stringification fails
 */
export function safeStringify(data: unknown, space?: string | number): string {
    try {
        return JSON.stringify(data, createJSONReplacer() as (key: string, value: unknown) => unknown, space);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error during JSON stringification';
        throw new Error(`Failed to stringify data: ${message}`);
    }
}

/**
 * Safely parses JSON that may contain serialized complex types.
 *
 * @param json The JSON string to parse
 * @returns Parsed object with complex types restored
 * @throws Error if parsing fails or input is invalid
 */
export function safeParse(json: string): unknown {
    if (typeof json !== 'string' || !json.trim()) {
        throw new Error('Invalid JSON input: expected non-empty string');
    }
    try {
        return JSON.parse(json, createJSONReviver() as (key: string, value: unknown) => unknown);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error during JSON parsing';
        throw new Error(`Failed to parse JSON: ${message}`);
    }
}
