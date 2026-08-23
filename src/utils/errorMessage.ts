/**
 * Extracts a readable message from a caught value.
 *
 * A `catch` binding is `unknown` -- anything can be thrown. Interpolating it
 * directly (`` `Failed: ${error}` ``) renders a thrown object as the literal
 * string "[object Object]", which is what several user-facing error strings in
 * this codebase used to do.
 *
 * This also unifies two conventions that had grown side by side: bare
 * `${error}` interpolation in the service layer, and hand-written
 * `(error as Error).message` in IndexedDBStorageManager. The cast was unsound
 * for non-Error throws; this is not.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
