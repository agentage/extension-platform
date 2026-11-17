import { describe, expect, it } from 'vitest';
import { dataOf, doc, H, installationsSuite, M } from './installations.test-support.js';
import { errorOf, send, WRITE } from './servers.test-support.js';

const { ctx, as, read, put, seedHost } = installationsSuite();

describe('GET /api/platform/installations/{target}', () => {
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

  it('platform:write alone reads: the kit ranks write above read', async () => {
    await put(doc());
    expect((await read(M, WRITE)).status).toBe(200);
  });

  it('401 anonymous on a machine target', async () => {
    expect((await read(M, null)).status).toBe(401);
  });

  it('an old cloud host document reads anonymous', async () => {
    await seedHost();
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

describe('PUT /api/platform/installations/{target} - writes', () => {
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

  it('two writers under one etag at once: exactly one wins, the other gets 412', async () => {
    const etag = (await put(doc())).headers.get('etag') ?? '';
    const both = await Promise.all([1, 2].map(() => put(doc(), { 'if-match': etag })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 412]);
  });

  it('the store refuses an installation for a machine not on the account', async () => {
    const sql = `insert into installations (owner, target, document, etag) values ($1, $2, '{}', 'x')`;
    await expect(ctx.store.query(sql, ['usr_b', M])).rejects.toMatchObject({ code: '23503' });
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
