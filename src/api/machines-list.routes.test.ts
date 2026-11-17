import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MachineSchema } from './machine.schema.js';
import { errorOf, OTHER, READ, send, testServers, WRITE } from './servers.test-support.js';

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

describe('GET /api/platform/machines', () => {
  // Set times: the order is neither the id order nor its reverse, and a tie spans a page edge.
  const seenAt = async (times: Record<string, string>) => {
    for (const [id, at] of Object.entries(times)) {
      await put(id);
      await ctx.store.query('update machines set last_seen_at = $1 where id = $2', [at, id]);
    }
  };
  const walk = async (limit: number) => {
    const ids: string[] = [];
    let cursor = '';
    do {
      const page = await list(`?limit=${limit}${cursor && `&cursor=${cursor}`}`);
      ids.push(...page.data.map((m) => m.id));
      cursor = page.meta.pagination.nextCursor ?? '';
    } while (cursor);
    return ids;
  };

  it('lists newest first with cursor paging', async () => {
    const at = (s: number) => `2026-11-01T00:00:0${s}.123456Z`;
    await seenAt({ m_00000001: at(1), m_00000002: at(3), m_00000003: at(2) });
    const first = await list('?limit=2');
    expect(first.data.map((m) => m.id)).toEqual(['m_00000002', 'm_00000003']);
    expect(first.meta.pagination).toMatchObject({ limit: 2, total: 3 });
    const second = await list(`?limit=2&cursor=${first.meta.pagination.nextCursor ?? ''}`);
    expect(second.data.map((m) => m.id)).toEqual(['m_00000001']);
    expect(second.meta.pagination.nextCursor).toBeUndefined();
  });

  it('pages through machines seen at the same microsecond by id, none twice', async () => {
    const tie = '2026-11-01T00:00:00.123456Z';
    await seenAt({ m_00000003: tie, m_00000001: tie, m_00000002: tie });
    expect(await walk(1)).toEqual(['m_00000001', 'm_00000002', 'm_00000003']);
  });

  it('400 VALIDATION_ERROR for a garbled cursor or an out-of-range limit', async () => {
    const garbled = Buffer.from('x m_3c19e7aa').toString('base64url');
    for (const query of ['cursor=garbled', `cursor=${garbled}`, 'limit=0', 'limit=101']) {
      const res = await send(await as(READ), `/machines?${query}`, 'GET');
      expect([res.status, (await errorOf(res)).code]).toEqual([400, 'VALIDATION_ERROR']);
    }
  });

  it('platform:write alone lists: the cli PAT carries the strongest verb only', async () => {
    await put();
    expect((await send(await as(WRITE), '/machines', 'GET')).status).toBe(200);
  });

  it('401 anonymous', async () => {
    expect((await send(await as(null), '/machines', 'GET')).status).toBe(401);
  });
});

describe('DELETE /api/platform/machines/{id}', () => {
  it('204 forgets the record, then 404', async () => {
    await put();
    const gone = await send(await as(WRITE), `/machines/${ID}`, 'DELETE');
    expect([gone.status, await gone.text()]).toEqual([204, '']);
    expect((await list()).data).toEqual([]);
    const again = await send(await as(WRITE), `/machines/${ID}`, 'DELETE');
    expect([again.status, (await errorOf(again)).code]).toEqual([404, 'MACHINE_NOT_FOUND']);
  });
});

describe('own account only', () => {
  it('another account sees none of them and gets 404 on each verb', async () => {
    await put();
    const other = await as(OTHER);
    expect(
      ((await (await send(other, '/machines', 'GET')).json()) as { data: unknown[] }).data
    ).toEqual([]);
    for (const [path, method, body] of [
      [`/machines/${ID}/seen`, 'POST'],
      [`/machines/${ID}`, 'PATCH', { name: 'x' }],
      [`/machines/${ID}`, 'DELETE'],
    ] as const)
      expect((await send(other, path, method, body)).status).toBe(404);
    expect((await list()).data).toHaveLength(1);
  });
});
