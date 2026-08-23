/**
 * Compact local export/import format (v4).
 * Keys are abbreviated to minimize size.
 */
import { z } from 'zod';

export interface MinimalSyncData {
  v: string;
  a: number | null;
  s: [string, (string | null)[], number?][];
  p?: {
    t: [number, number];
    d: number[];
    th?: string;
  };
}

/**
 * This format arrives from outside the app -- users paste files they exported
 * earlier, possibly from an older build -- so it is parsed rather than
 * asserted. Callers should use safeParse and report a friendly message; the
 * version check on `v` is deliberately left to them, so an old-but-well-formed
 * file gets "please re-export" rather than a schema error.
 */
export const MinimalSyncDataSchema = z.object({
  v: z.string(),
  a: z.number().nullable(),
  s: z.array(
    z.tuple([
      z.string(),
      z.array(z.string().nullable()),
      z.number().optional(),
    ]),
  ),
  p: z
    .object({
      t: z.tuple([z.number(), z.number()]),
      d: z.array(z.number()),
      th: z.string().optional(),
    })
    .optional(),
}) satisfies z.ZodType<MinimalSyncData>;
