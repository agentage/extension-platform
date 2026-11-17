import { afterAll, beforeEach } from 'vitest';
import { READ, send, testServers, WRITE } from './servers.test-support.js';

export const M = 'm_1a2b3c4d';
export const H = 'h_cloud-01';
export const doc = (target = M) => ({
  target,
  deployments: [{ id: 'probe', url: 'https://probe.example.test' }],
  routes: {
    '/': { kind: 'column', children: [{ kind: 'widget', deployment: 'probe', name: 'echo' }] },
  },
});
const REGISTER = { platform: 'linux-x64', cliVersion: '0.49.0', state: 'connected' };

// The installations routes on a fresh store with machine M registered for WRITE before each test.
export const installationsSuite = () => {
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
  // A host row written before D2 (the route refuses new ones).
  const seedHost = () =>
    ctx.store.query(
      `insert into installations (owner, target, document, etag) values ('', $1, $2, 'aaaaaaaaaaaa')`,
      [H, JSON.stringify(doc(H))]
    );
  return { ctx, as, path, read, put, seedHost };
};

export const dataOf = async (res: Response) => ((await res.json()) as { data: unknown }).data;
