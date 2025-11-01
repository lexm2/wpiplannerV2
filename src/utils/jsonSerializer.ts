/**
 * Centralized JSON serialization utilities for handling circular references
 * and complex data types in the course/schedule data model.
 *
 * ROOT CAUSE OF CIRCULAR REFERENCES:
 * - Course.department contains a Department object
 * - Department.courses contains an array of Course objects
 * - This creates: Course → Department → Course[] → ... (infinite loop)
 *
 * This utility provides a safe serialization mechanism that breaks the cycle
 * by stripping unnecessary data during JSON serialization.
 */

/**
 * Creates a JSON replacer function that handles:
 * - Circular references (Course ↔ Department)
 * - Set serialization
 * - selectedSection optimization (removes redundant data)
 *
 * @returns A replacer function compatible with JSON.stringify
 */
export function createJSONReplacer(): (key: string, value: any) => any {
    return (key: string, value: any): any => {
        // Handle Set serialization
        if (value instanceof Set) {
            return { __type: 'Set', value: [...value] };
        }

        // Break circular reference: Course → Department → Course[]
        // Keep only essential department info, strip the courses array
        if (key === 'department' && value && value.courses) {
            return {
                abbreviation: value.abbreviation,
                name: value.name
            };
        }

        // Optimization: Remove selectedSection to avoid redundant data
        // (section data is already available elsewhere in the structure)
        if (key === 'selectedSection' && value && typeof value === 'object' && value.number) {
            return undefined;
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
export function createJSONReviver(): (key: string, value: any) => any {
    return (_key: string, value: any): any => {
        // Restore Set from serialized form
        if (typeof value === 'object' && value !== null && value.__type === 'Set') {
            return new Set(value.value);
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
 */
export function safeStringify(data: any, space?: string | number): string {
    return JSON.stringify(data, createJSONReplacer(), space);
}

/**
 * Safely parses JSON that may contain serialized complex types.
 *
 * @param json The JSON string to parse
 * @returns Parsed object with complex types restored
 */
export function safeParse(json: string): any {
    return JSON.parse(json, createJSONReviver());
}
