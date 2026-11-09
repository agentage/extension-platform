import { type Store } from '@agentage/extension';
import {
  type Machine,
  type MachineCursor,
  type MachineInput,
  type MachinePatch,
} from './machine.schema.js';

const utc = (column: string, fraction: string) =>
  `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.${fraction}"Z"')`;
const COLUMNS = `id, name, platform, cli_version as "cliVersion", managed, state,
  ${utc('first_seen_at', 'MS')} as "firstSeenAt", ${utc('last_seen_at', 'MS')} as "lastSeenAt"`;

const UPSERT = `insert into machines (user_id, id, name, platform, cli_version, state)
  values ($1, $2, coalesce($3, $2), $4, $5, $6)
  on conflict (user_id, id) do update set platform = excluded.platform,
    cli_version = excluded.cli_version, state = excluded.state, last_seen_at = now()
  returning ${COLUMNS}, (xmax = 0) as created`;

// The cursor keeps microseconds: it must compare equal to the stored value.
const PAGE = `select ${COLUMNS}, ${utc('last_seen_at', 'US')} as cursor from machines
  where user_id = $1
  and ($2::timestamptz is null or last_seen_at < $2 or (last_seen_at = $2 and id > $3))
  order by last_seen_at desc, id asc limit $4`;

// Forget also drops the machine's installation.
const FORGET = `with gone as (delete from machines where user_id = $1 and id = $2 returning id),
  doc as (delete from installations where owner = $1 and target = $2)
  select id from gone`;

const COUNT = 'select count(*)::int as n from machines where user_id = $1';

export const createMachinesStore = (store: Store) => ({
  upsert: async (userId: string, id: string, input: MachineInput) => {
    const params = [userId, id, input.name ?? null, input.platform, input.cliVersion, input.state];
    const [row] = (await store.query<Machine & { created: boolean }>(UPSERT, params)).rows;
    const { created, ...machine } = row as Machine & { created: boolean };
    return { machine, created };
  },
  seen: async (userId: string, id: string, cliVersion?: string): Promise<boolean> => {
    const sql = `update machines set last_seen_at = now(), cli_version = coalesce($3, cli_version)
      where user_id = $1 and id = $2 returning id`;
    return (await store.query(sql, [userId, id, cliVersion ?? null])).rows.length > 0;
  },
  patch: async (userId: string, id: string, patch: MachinePatch): Promise<Machine | null> => {
    const sql = `update machines set name = coalesce($3, name), state = coalesce($4, state)
      where user_id = $1 and id = $2 returning ${COLUMNS}`;
    const params = [userId, id, patch.name ?? null, patch.state ?? null];
    return (await store.query<Machine>(sql, params)).rows[0] ?? null;
  },
  forget: async (userId: string, id: string): Promise<boolean> =>
    (await store.query(FORGET, [userId, id])).rows.length > 0,
  list: async (userId: string, limit: number, at?: MachineCursor) => {
    const params = [userId, at?.t ?? null, at?.id ?? '', limit + 1];
    const rows = (await store.query<Machine & { cursor: string }>(PAGE, params)).rows;
    const [{ n }] = (await store.query<{ n: number }>(COUNT, [userId])).rows as [{ n: number }];
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    const nextCursor = last ? { t: last.cursor, id: last.id } : undefined;
    const machines = rows.slice(0, limit).map(({ cursor: _cursor, ...machine }) => machine);
    return { machines, total: n, nextCursor };
  },
});

export type MachinesStore = ReturnType<typeof createMachinesStore>;
