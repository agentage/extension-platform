import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, errorOf, OTHER, READ, send, testServers, WRITE } from './servers.test-support.js';

const M = 'm_1a2b3c4d';
const H = 'h_cloud-01';
const doc = (target = M) => ({
  target,
  deployments: [{ id: 'probe', url: 'https://probe.next.agentage.io' }],
  routes: {
    '/': { kind: 'column', children: [{ kind: 'widget', deployment: 'probe', name: 'echo' }] },
  },
});
const REGISTER = { platform: 'linux-x64', cliVersion: '0.49.0', state: 'connected' };

const { ctx, as, close } = testServers();
beforeEach(async () => {
  await ctx.store.query('delete from installations; delete from machines');
  await send(await as(WRITE), `/machines/${M}`, 'PUT', REGISTER);
}, 30_000);
afterAll(close);

type Who = Parameters<typeof as>[0];
const path = (target: string) => `/installations/${target}`;
const read = async (target = M, who: Who = READ) => send(await as(who), path(target), 'GET');
const put = async (body: unknown, headers = {}, target = M, who: Who = WRITE) =>
  send(await as(who), path(target), 'PUT', body, headers);
const dataOf = async (res: Response) => ((await res.json()) as { data: unknown }).data;

describe('GET /api/v1/installations/{target}', () => {
  it('404 INSTALLATION_NOT_FOUND before one is stored, never cached', async () => {
    const res = await read();
    expect([res.status, (await errorOf(res)).code]).toEqual([404, 'INSTALLATION_NOT_FOUND']);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('200 with the stored document and its ETag', async () => {
    const etag = (await put(doc())).headers.get('etag');
    const res = await read();
    expect([res.status, res.headers.get('etag'), await dataOf(res)]).toEqual([200, etag, doc()]);
  });

  it('401 anonymous on a machine target', async () => {
    expect((await read(M, null)).status).toBe(401);
  });

  it('a cloud host document reads anonymous', async () => {
    await put(doc(H), {}, H, ADMIN);
    const res = await read(H, null);
    expect([res.status, await dataOf(res)]).toEqual([200, doc(H)]);
  });

  it.each(['p_00000001', 'm_XYZ', 'x_1', 'h_'])(
    '400 for target %s (p_ is reserved)',
    async (target) => {
      const res = await read(target);
      expect([res.status, (await errorOf(res)).code]).toEqual([400, 'VALIDATION_ERROR']);
    }
  );
});

describe('PUT /api/v1/installations/{target} - writes', () => {
  it('201 creates with If-None-Match: *, the ETag header set', async () => {
    const res = await put(doc(), { 'if-none-match': '*' });
    expect([res.status, await dataOf(res)]).toEqual([201, doc()]);
    expect(res.headers.get('etag')).toMatch(/^"[A-Za-z0-9_-]{16}"$/);
  });

  it('412 on a second create, carrying the stored document and its etag', async () => {
    const etag = (await put(doc())).headers.get('etag');
    const res = await put(doc(), { 'if-none-match': '*' });
    expect([res.status, (await errorOf(res)).details]).toEqual([412, { current: doc(), etag }]);
  });

  it('200 replaces under the current etag and mints a new one', async () => {
    const etag = (await put(doc())).headers.get('etag') ?? '';
    const res = await put({ ...doc(), deployments: [] }, { 'if-match': etag });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).not.toBe(etag);
    expect(await dataOf(await read())).toMatchObject({ deployments: [] });
  });

  it('412 under a stale etag, carrying the current document', async () => {
    const first = (await put(doc())).headers.get('etag') ?? '';
    const second = (await put({ ...doc(), deployments: [] }, { 'if-match': first })).headers.get(
      'etag'
    );
    const res = await put(doc(), { 'if-match': first });
    expect([res.status, (await errorOf(res)).details]).toEqual([
      412,
      { current: { ...doc(), deployments: [] }, etag: second },
    ]);
  });

  it('412 with null details when If-Match meets no stored document', async () => {
    const res = await put(doc(), { 'if-match': '"aaaaaaaaaaaa"' });
    expect([res.status, (await errorOf(res)).details]).toEqual([
      412,
      { current: null, etag: null },
    ]);
  });

  it('If-Match: * replaces any stored document, 412 when none; a weak tag matches', async () => {
    expect([(await put(doc(), { 'if-match': '*' })).status]).toEqual([412]);
    const etag = (await put(doc())).headers.get('etag') ?? '';
    expect((await put(doc(), { 'if-match': '*' })).status).toBe(200);
    const weak = (await read()).headers.get('etag') ?? '';
    expect(weak).not.toBe(etag);
    expect((await put(doc(), { 'if-match': `W/${weak}` })).status).toBe(200);
  });

  it('forgetting the machine drops its installation', async () => {
    await put(doc());
    expect((await send(await as(WRITE), `/machines/${M}`, 'DELETE')).status).toBe(204);
    expect((await read()).status).toBe(404);
  });

  it('no precondition header: creates 201, then overwrites 200', async () => {
    expect((await put(doc())).status).toBe(201);
    expect((await put(doc())).status).toBe(200);
  });

  it.each([
    [{ 'if-match': '"aaaaaaaaaaaa"', 'if-none-match': '*' }],
    [{ 'if-none-match': '"aaaaaaaaaaaa"' }],
    [{ 'if-match': 'not-quoted' }],
  ])('400 for preconditions %j', async (headers) => {
    expect((await put(doc(), headers)).status).toBe(400);
  });
});

describe('PUT /api/v1/installations/{target} - access', () => {
  it('403 without platform:write', async () => {
    expect((await put(doc(), {}, M, READ)).status).toBe(403);
  });

  it('404 MACHINE_NOT_FOUND for a machine of another account; accounts stay apart', async () => {
    await put(doc());
    const res = await put(doc(), {}, M, OTHER);
    expect([res.status, (await errorOf(res)).code]).toEqual([404, 'MACHINE_NOT_FOUND']);
    expect((await read(M, OTHER)).status).toBe(404);
  });

  it('a cloud host needs platform:admin', async () => {
    const res = await put(doc(H), {}, H, WRITE);
    expect([res.status, (await errorOf(res)).message]).toEqual([403, 'Needs platform:admin']);
    expect((await put(doc(H), {}, H, ADMIN)).status).toBe(201);
  });
});

describe('PUT /api/v1/installations/{target} - validation and size', () => {
  it('400 naming the failing path', async () => {
    const bad = { ...doc(), deployments: [{ id: 'probe', url: 'ftp://x' }] };
    const res = await put(bad);
    expect([res.status, (await errorOf(res)).details]).toEqual([
      400,
      [expect.objectContaining({ field: 'deployments.0.url' })],
    ]);
  });

  it('400 when the body target differs from the path', async () => {
    const res = await put(doc('m_00000000'));
    expect([res.status, (await errorOf(res)).details]).toEqual([
      400,
      [{ field: 'target', message: 'equals the target in the path' }],
    ]);
  });

  it('400 for a body that is not JSON', async () => {
    const server = await as(WRITE);
    const init = { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{' };
    expect((await server.fetch(`/api/v1${path(M)}`, init)).status).toBe(400);
  });

  it('413 PAYLOAD_TOO_LARGE above 256 KiB', async () => {
    const routes = Object.fromEntries(
      Array.from({ length: 3000 }, (_, i) => [`/r${i}`, { kind: 'text', body: 'x'.repeat(90) }])
    );
    const res = await put({ ...doc(), routes });
    expect([res.status, (await errorOf(res)).details]).toEqual([413, { limitBytes: 262144 }]);
  });

  it('accepts an unknown top-level field and does not store it', async () => {
    expect((await put({ ...doc(), overlays: { later: true } })).status).toBe(201);
    expect(await dataOf(await read())).toEqual(doc());
  });
});
