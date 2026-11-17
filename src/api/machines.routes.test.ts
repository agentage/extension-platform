import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MachineSchema } from './machine.schema.js';
import { errorOf, READ, send, testServers, WRITE } from './servers.test-support.js';

const REGISTER = {
  name: 'server-01',
  platform: 'linux-x64',
  cliVersion: '0.40.0',
  state: 'connected',
};
const ID = 'm_8f2a91c0';
const ListSchema = z.strictObject({
  success: z.literal(true),
  data: z.array(MachineSchema),
  meta: z.strictObject({
    pagination: z.strictObject({
      limit: z.int(),
      total: z.int(),
      nextCursor: z.string().optional(),
    }),
  }),
});

const { ctx, as, close } = testServers();
beforeEach(async () => void (await ctx.store.query('delete from machines')), 30_000);
afterAll(close);
const put = async (id = ID, body: unknown = REGISTER) =>
  send(await as(WRITE), `/machines/${id}`, 'PUT', body);
const list = async (query = '') =>
  ListSchema.parse(await (await send(await as(READ), `/machines${query}`, 'GET')).json());

describe('PUT /api/platform/machines/{id}', () => {
  it('201 registers with the contract body, 200 refreshes without renaming', async () => {
    const first = await put();
    expect([first.status, first.headers.get('cache-control')]).toEqual([201, 'no-store']);
    const record = MachineSchema.parse(((await first.json()) as { data: unknown }).data);
    expect(record).toMatchObject({ id: ID, name: 'server-01', managed: false, state: 'connected' });
    const again = await put(ID, { ...REGISTER, name: 'other', cliVersion: '0.41.0' });
    expect(again.status).toBe(200);
    const data = ((await again.json()) as { data: unknown }).data;
    expect(data).toMatchObject({ name: 'server-01', cliVersion: '0.41.0' });
  });

  it('defaults the name to the id', async () => {
    const noName: Record<string, unknown> = { ...REGISTER };
    delete noName['name'];
    expect(((await (await put(ID, noName)).json()) as { data: { name: string } }).data.name).toBe(
      ID
    );
  });

  it('403 MANAGED_REQUIRES_INFRASTRUCTURE for managed: true; false is a no-op', async () => {
    const res = await put(ID, { ...REGISTER, managed: true });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toMatchObject({
      code: 'MANAGED_REQUIRES_INFRASTRUCTURE',
      message: 'managed is set by infrastructure only',
    });
    expect((await put(ID, { ...REGISTER, managed: false })).status).toBe(201);
  });

  it('400 for a bad id before the store, 400 VALIDATION_ERROR for a bad body', async () => {
    const bad = await put('4d0f7f6e-3c39-4a64');
    expect([bad.status, (await errorOf(bad)).code]).toEqual([400, 'VALIDATION_ERROR']);
    const body = await put(ID, { ...REGISTER, state: 'gone' });
    expect(body.status).toBe(400);
    expect(await errorOf(body)).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'state' }],
    });
  });

  it('refuses unknown keys, control characters and a bad platform', async () => {
    for (const body of [
      { ...REGISTER, extra: 1 },
      { ...REGISTER, name: 'a\u0007b' },
      { ...REGISTER, platform: 'linux' },
    ])
      expect((await put(ID, body)).status).toBe(400);
  });

  it('403 without platform:write', async () => {
    expect((await send(await as(READ), `/machines/${ID}`, 'PUT', REGISTER)).status).toBe(403);
  });
});

describe('POST /api/platform/machines/{id}/seen', () => {
  it('404 MACHINE_NOT_FOUND for an unknown machine', async () => {
    const res = await send(await as(WRITE), `/machines/${ID}/seen`, 'POST');
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({
      code: 'MACHINE_NOT_FOUND',
      message: `no machine ${ID} on this account`,
    });
  });

  it('204 and takes cliVersion from X-Agentage-CLI-Version when it is semver', async () => {
    await put();
    const seen = (version: string) =>
      as(WRITE).then((s) =>
        send(s, `/machines/${ID}/seen`, 'POST', undefined, { 'x-agentage-cli-version': version })
      );
    const res = await seen('0.42.1');
    expect([res.status, await res.text()]).toEqual([204, '']);
    await seen('garbage');
    expect((await list()).data[0]?.cliVersion).toBe('0.42.1');
  });
});

describe('PATCH /api/platform/machines/{id}', () => {
  it('renames or disconnects; 404 when unknown; 400 when empty', async () => {
    const patch = async (body: unknown) => send(await as(WRITE), `/machines/${ID}`, 'PATCH', body);
    expect((await patch({ name: 'x' })).status).toBe(404);
    await put();
    const res = await patch({ state: 'disconnected' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toMatchObject({ state: 'disconnected' });
    expect((await patch({})).status).toBe(400);
  });
});
