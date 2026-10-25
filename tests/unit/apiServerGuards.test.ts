/**
 * The server's per-client rate limit and request log helpers.
 */
import { describe, expect, it } from 'vitest';
import { clientAddress, RateLimiter } from '../../src/api/rateLimit';
import { logLine, mcpCallError, mcpToolName } from '../../src/api/requestLog';

describe('RateLimiter', () => {
  it('allows a burst, then refuses with the seconds until the next request', () => {
    let now = 0;
    const limiter = new RateLimiter(60, 3, () => now);
    expect([1, 2, 3].map(() => limiter.take('a'))).toEqual([0, 0, 0]);
    expect(limiter.take('a')).toBe(1);
    // Another client has its own bucket.
    expect(limiter.take('b')).toBe(0);
    now += 1000;
    expect(limiter.take('a')).toBe(0);
    expect(limiter.take('a')).toBe(1);
  });

  it('refills to the burst and no further', () => {
    let now = 0;
    const limiter = new RateLimiter(60, 2, () => now);
    limiter.take('a');
    limiter.take('a');
    now += 60_000;
    expect([1, 2].map(() => limiter.take('a'))).toEqual([0, 0]);
    expect(limiter.take('a')).toBeGreaterThan(0);
  });
});

describe('clientAddress', () => {
  const request = (forwarded?: string) =>
    new Request('http://x/', {
      headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
    });

  it('takes a public socket address as the client, whatever the header says', () => {
    expect(clientAddress(request('1.2.3.4'), '203.0.113.9')).toBe(
      '203.0.113.9',
    );
  });

  it('takes the last outside address a proxy forwarded', () => {
    // A spoofed first entry, the client, then a TLS proxy before nginx.
    expect(
      clientAddress(request('9.9.9.9, 198.51.100.7, 10.0.0.2'), '172.18.0.3'),
    ).toBe('198.51.100.7');
    expect(clientAddress(request('198.51.100.7'), '::ffff:127.0.0.1')).toBe(
      '198.51.100.7',
    );
  });

  it('falls back to the first hop when every one is internal', () => {
    expect(clientAddress(request('10.1.2.3, 10.0.0.2'), '127.0.0.1')).toBe(
      '10.1.2.3',
    );
    expect(clientAddress(request(), '127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('request log', () => {
  const rpc = (body: unknown) =>
    new Request('http://x/mcp', { method: 'POST', body: JSON.stringify(body) });
  const event = (message: unknown) =>
    new Response(`event: message\ndata: ${JSON.stringify(message)}\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });

  it('names the tool a tools/call request calls, and nothing else', async () => {
    expect(
      await mcpToolName(
        rpc({ method: 'tools/call', params: { name: 'get_course' } }),
      ),
    ).toBe('get_course');
    expect(await mcpToolName(rpc({ method: 'tools/list' }))).toBeNull();
    expect(await mcpToolName(new Request('http://x/mcp'))).toBeNull();
  });

  it("reads a tool call's error from its event, and none from a success", async () => {
    expect(
      await mcpCallError(
        event({
          result: { content: [{ text: 'No course CS 9999' }], isError: true },
        }),
      ),
    ).toBe('No course CS 9999');
    expect(
      await mcpCallError(event({ result: { content: [{ text: 'ok' }] } })),
    ).toBeNull();
  });

  it('keeps an error to one quoted line', () => {
    const line = logLine({
      method: 'POST',
      path: '/mcp',
      status: 200,
      ms: 12.4,
      tool: 'get_course',
      error: 'two\nlines',
    });
    expect(line).toMatch(
      / POST \/mcp 200 12ms tool=get_course error="two lines"$/,
    );
  });
});
