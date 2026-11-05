/**
 * Requests per client the server answers before refusing with 429: a
 * search is CPU work on the one thread every caller shares, and an AI
 * assistant stuck retrying would otherwise starve everyone else. A soft
 * limit for runaway loops, not a security boundary: behind a proxy the
 * address comes from X-Forwarded-For, which is believed only from the
 * proxies the server is told of (TRUSTED_PROXIES; loopback always).
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

const stripV4Mapping = (address: string) => address.replace(/^::ffff:/i, '');

function ipv4Number(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
}

/** Proxies whose X-Forwarded-For can be believed: loopback, plus those configured. */
export type TrustedProxies = (address: string) => boolean;

/**
 * `list` is comma-separated IPv4 CIDRs ("172.16.0.0/12") or addresses.
 * Loopback is always trusted (Apache or nginx on the same host); nothing else
 * is unless listed, as a private-range address is as likely a student's
 * laptop on the campus network as a proxy, and a client that is not behind
 * one can send any X-Forwarded-For it likes.
 */
export function trustedProxies(list = ''): TrustedProxies {
  const ranges = list
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [base, bits] = entry.split('/');
      return {
        base: stripV4Mapping(base),
        bits: bits === undefined ? null : Number(bits),
      };
    });
  return address => {
    const ip = stripV4Mapping(address);
    if (ip === '::1' || (isIP(ip) === 4 && ip.startsWith('127.'))) return true;
    return ranges.some(({ base, bits }) => {
      if (bits === null || isIP(ip) !== 4 || isIP(base) !== 4) {
        return ip.toLowerCase() === base.toLowerCase();
      }
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (ipv4Number(ip) & mask) >>> 0 === (ipv4Number(base) & mask) >>> 0;
    });
  };
}

/**
 * The client a request counts against. A connection from anything but a
 * trusted proxy is the client, whatever it sends in X-Forwarded-For. From
 * a trusted proxy (Apache, nginx, a TLS proxy before them), each hop appended
 * the address it was reached from, so the client is the last address there
 * that is not itself a trusted proxy.
 */
export function clientAddress(
  request: Request,
  socketAddress: string | null,
  isTrusted: TrustedProxies = trustedProxies(),
): string {
  const peer = socketAddress ?? 'unknown';
  if (peer === 'unknown' || !isTrusted(peer)) return peer;
  const forwarded = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map(a => a.trim())
    .filter(a => isIP(stripV4Mapping(a)) !== 0);
  const client = [...forwarded].reverse().find(a => !isTrusted(a));
  return client ?? forwarded[0] ?? peer;
}
