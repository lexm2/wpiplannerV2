/**
 * Compact local export/import format (v4).
 * Keys are abbreviated to minimize size.
 */
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
