/**
 * Readable message from a caught value.
 *
 * A catch binding is `unknown`, so interpolating it directly renders a thrown
 * object as "[object Object]" -- and `(error as Error).message` is unsound for
 * the same throw. Use this in user-facing error strings.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
