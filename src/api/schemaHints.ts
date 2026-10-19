/**
 * Strict objects whose unknown-key errors say where the key belongs. Models
 * calling the MCP tools put arguments one level off ("earliestStart" inside
 * filters, "query" at the top level), and zod's bare 'Unrecognized key:
 * "earliestStart"' left them guessing.
 */
import * as z from 'zod';
import { closestMatches } from '../utils/editDistance';

interface SchemaInternals {
  _zod?: {
    def?: {
      shape?: Record<string, unknown>;
      innerType?: unknown;
      in?: unknown;
      element?: unknown;
    };
  };
}

/** The object shape under optional, default, pipe and array wrappers. */
function shapeOf(schema: unknown): Record<string, unknown> | null {
  let current = schema as SchemaInternals | undefined;
  for (let depth = 0; current && depth < 6; depth++) {
    const def = current._zod?.def;
    if (def?.shape) return def.shape;
    current = (def?.innerType ?? def?.in ?? def?.element) as
      SchemaInternals | undefined;
  }
  return null;
}

/** Every key of `schema` and its nested objects, by dotted path. */
function keyPaths(
  schema: unknown,
  prefix = '',
  paths = new Map<string, string[]>(),
): Map<string, string[]> {
  const shape = shapeOf(schema);
  if (!shape) return paths;
  for (const [key, child] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.set(key, [...(paths.get(key) ?? []), path]);
    keyPaths(child, path, paths);
  }
  return paths;
}

interface UnknownKeysIssue {
  keys: string[];
  path?: PropertyKey[];
  inst?: unknown;
}

function unknownKeysMessage(
  issue: UnknownKeysIssue,
  root: (() => unknown) | undefined,
): string {
  const where = issue.path?.length ? issue.path.join('.') : '';
  const here = where ? `in ${where}` : 'at the top level';
  const accepted = Object.keys(shapeOf(issue.inst) ?? {});
  const paths = root ? keyPaths(root()) : new Map<string, string[]>();
  const notes = issue.keys.map(key => {
    const homes = (paths.get(key) ?? []).filter(
      p => p !== (where ? `${where}.${key}` : key),
    );
    if (homes.length) {
      return `"${key}" does not go ${here}; it goes in ${homes.join(' or ')}.`;
    }
    const close = closestMatches(key, accepted, { limit: 3, max: 1 });
    return `Unknown key "${key}" ${here}${close.length ? `; did you mean "${close[0]}"?` : '.'}`;
  });
  return `${notes.join(' ')} Accepted ${here}: ${accepted.join(', ')}.`;
}

/**
 * z.strictObject whose unknown-key error names the accepted keys and, when
 * the key belongs elsewhere in `root` (the whole input schema), its place.
 */
export function strictObject<S extends z.core.$ZodLooseShape>(
  shape: S,
  root?: () => unknown,
) {
  return z.strictObject(shape, {
    error: issue =>
      issue.code === 'unrecognized_keys'
        ? unknownKeysMessage(issue as unknown as UnknownKeysIssue, root)
        : undefined,
  });
}
