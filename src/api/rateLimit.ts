/**
 * Requests per client the server answers before refusing with 429: a
 * search is CPU work on the one thread every caller shares, and an AI
 * assistant stuck retrying would otherwise starve everyone else. A soft
 * limit for runaway loops, not a security boundary: the address comes from
 * X-Forwarded-For, which only the proxies in front of the server set
 * honestly.
 */
import { isIP } from 'node:net';

interface Bucket {
  tokens: number;
  updated: number;
}

/** Buckets idle this long are full again, so they can be forgotten. */
const IDLE_MS = 10 * 60_000;

/**
 * A token bucket per client: `perMinute` requests a minute on average,
 * with bursts up to `burst` (an assistant answering one question calls a
 * few tools in quick succession).
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly perMs: number;
  private lastSweep = 0;

  constructor(
    perMinute: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    this.perMs = perMinute / 60_000;
  }

  /** Takes a request for `client`; 0 when allowed, else the seconds to wait. */
  take(client: string): number {
    const now = this.now();
    this.sweep(now);
    const bucket = this.buckets.get(client) ?? {
      tokens: this.burst,
      updated: now,
    };
    bucket.tokens = Math.min(
      this.burst,
      bucket.tokens + (now - bucket.updated) * this.perMs,
    );
    bucket.updated = now;
    this.buckets.set(client, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.ceil((1 - bucket.tokens) / this.perMs / 1000);
  }

  /** Forgets idle clients now and then, so the map holds only recent ones. */
  private sweep(now: number): void {
    if (now - this.lastSweep < IDLE_MS) return;
    this.lastSweep = now;
    for (const [client, bucket] of this.buckets) {
      if (now - bucket.updated >= IDLE_MS) this.buckets.delete(client);
    }
  }
}

/** Loopback and private ranges: our own proxies, never a student's address. */
function isInternal(address: string): boolean {
  const ip = address.replace(/^::ffff:/i, '');
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  const lower = ip.toLowerCase();
  return lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

/**
 * The client a request counts against. Straight from a client, the socket
 * address. Through the proxies (nginx, Apache, any TLS proxy before them),
 * each appends the address it was reached from to X-Forwarded-For, so the
 * client is the last address there that is not one of ours; read only
 * when the socket itself is a proxy, as a client could send the header.
 */
export function clientAddress(
  request: Request,
  socketAddress: string | null,
): string {
  const peer = socketAddress ?? 'unknown';
  if (!isInternal(peer)) return peer;
  const forwarded = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map(a => a.trim())
    .filter(a => isIP(a.replace(/^::ffff:/i, '')) !== 0);
  // Every hop internal (a campus network): the first is the client.
  const outermost = [...forwarded].reverse().find(a => !isInternal(a));
  return outermost ?? forwarded[0] ?? peer;
}
