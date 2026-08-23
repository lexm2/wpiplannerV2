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
 * Untrusted input: users paste files they exported earlier, possibly from an
 * older build. The `v` check is left to callers so a well-formed but outdated
 * file can get "please re-export" rather than a schema error.
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
