import { describe, expect, it } from 'vitest';
import { dataOf, doc, H, installationsSuite, M } from './installations.test-support.js';
import { ADMIN, errorOf, OTHER, READ, WRITE } from './servers.test-support.js';

const { as, path, read, put, seedHost } = installationsSuite();

describe('PUT /api/platform/installations/{target} - access', () => {
  it('403 without platform:write', async () => {
    expect((await put(doc(), {}, M, READ)).status).toBe(403);
  });

  it('404 MACHINE_NOT_FOUND for a machine of another account; accounts stay apart', async () => {
    await put(doc());
    const res = await put(doc(), {}, M, OTHER);
    expect([res.status, (await errorOf(res)).code]).toEqual([404, 'MACHINE_NOT_FOUND']);
    expect((await read(M, OTHER)).status).toBe(404);
  });

  it.each([WRITE, ADMIN])(
    'a cloud host write is 403 HOST_INSTALLATION_IS_A_FILE (%s)',
    async (who) => {
      await seedHost();
      for (const headers of [{}, { 'if-match': '"aaaaaaaaaaaa"' }]) {
        const res = await put(doc(H), headers, H, who);
        expect([res.status, (await errorOf(res)).code]).toEqual([
          403,
          'HOST_INSTALLATION_IS_A_FILE',
        ]);
      }
      expect(await dataOf(await read(H, null))).toEqual(doc(H));
    }
  );
});

describe('PUT /api/platform/installations/{target} - validation and size', () => {
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
    expect((await server.fetch(`/api/platform${path(M)}`, init)).status).toBe(400);
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
