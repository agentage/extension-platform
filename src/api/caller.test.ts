import { createTestContext, startTestServer, type Caller } from '@agentage/extension';
import { afterEach, describe, expect, it } from 'vitest';
import { create } from './index.js';

const PATH = '/api/platform/caller';
const read: Caller = { sub: 'usr_r', scopes: ['platform:read', 'other:admin'] };
let server: Awaited<ReturnType<typeof startTestServer>> | undefined;

const get = async (caller: Caller | null) => {
  server = await startTestServer({ create, ctx: createTestContext(), caller });
  return server.fetch(PATH);
};

afterEach(async () => {
  await server?.close();
});

describe('GET /api/platform/caller (the kit route, since 0.21.0)', () => {
  it('answers a read token with its subject and its own scopes only', async () => {
    const res = await get(read);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { sub: 'usr_r', scopes: ['platform:read'] },
    });
  });

  it('refuses a request with no token', async () => {
    expect((await get(null)).status).toBe(401);
  });
});
