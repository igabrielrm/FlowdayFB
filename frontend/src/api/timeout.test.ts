import { describe, expect, it } from 'vitest';
import { withTimeout } from './timeout';

describe('withTimeout', () => {
  it('rejects when the promise does not resolve before the timeout', async () => {
    const pending = new Promise<Response>(() => undefined);
    await expect(withTimeout(pending, 10)).rejects.toThrow('timeout');
  });

  it('returns the original response when it resolves first', async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(withTimeout(Promise.resolve(response), 100)).resolves.toBe(response);
  });
});
