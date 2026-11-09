import { type Store } from '@agentage/extension';
import {
  type Machine,
  type MachineCursor,
  type MachineInput,
  type MachinePatch,
} from './machine.schema.js';

type MachineRow = {
  id: string;
  name: string;
  platform: string;
  cli_version: string;
  managed: boolean;
  state: Machine['state'];
  first_seen: string;
  last_seen: string;
  created?: boolean;
};

// Microseconds kept as text: the keyset cursor must compare equal to the stored value.
const US = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
const at = (column: string) => `to_char(${column} at time zone 'UTC', ${US})`;
const COLUMNS = `id, name, platform, cli_version, managed, state,
  ${at('first_seen_at')} as first_seen, ${at('last_seen_at')} as last_seen`;

const iso = (t: string): string => new Date(t).toISOString();

const toMachine = (row: MachineRow): Machine => ({
  id: row.id,
  name: row.name,
  platform: row.platform,
  cliVersion: row.cli_version,
  managed: row.managed,
  state: row.state,
  firstSeenAt: iso(row.first_seen),
  lastSeenAt: iso(row.last_seen),
});

const UPSERT = `insert into machines (user_id, id, name, platform, cli_version, state)
  values ($1, $2, coalesce($3, $2), $4, $5, $6)
  on conflict (user_id, id) do update set platform = excluded.platform,
    cli_version = excluded.cli_version, state = excluded.state, last_seen_at = now()
  returning ${COLUMNS}, (xmax = 0) as created`;

const PAGE = `select ${COLUMNS} from machines where user_id = $1
  and ($2::timestamptz is null or last_seen_at < $2 or (last_seen_at = $2 and id > $3))
  order by last_seen_at desc, id asc limit $4`;

export const createMachinesStore = (store: Store) => ({
  upsert: async (userId: string, id: string, input: MachineInput) => {
    const params = [userId, id, input.name ?? null, input.platform, input.cliVersion, input.state];
    const [row] = (await store.query<MachineRow>(UPSERT, params)).rows as [MachineRow];
    return { machine: toMachine(row), created: row.created === true };
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
    const [row] = (await store.query<MachineRow>(sql, params)).rows;
    return row ? toMachine(row) : null;
  },
  exists: async (userId: string, id: string): Promise<boolean> => {
    const sql = 'select 1 from machines where user_id = $1 and id = $2';
    return (await store.query(sql, [userId, id])).rows.length > 0;
  },
  forget: async (userId: string, id: string): Promise<boolean> => {
    const sql = 'delete from machines where user_id = $1 and id = $2 returning id';
    return (await store.query(sql, [userId, id])).rows.length > 0;
  },
  list: async (userId: string, limit: number, cursor?: MachineCursor) => {
    const params = [userId, cursor?.t ?? null, cursor?.id ?? '', limit + 1];
    const rows = (await store.query<MachineRow>(PAGE, params)).rows;
    const count = 'select count(*)::int as n from machines where user_id = $1';
    const [{ n }] = (await store.query<{ n: number }>(count, [userId])).rows as [{ n: number }];
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    const nextCursor = last ? { t: last.last_seen, id: last.id } : undefined;
    return { machines: rows.slice(0, limit).map(toMachine), total: n, nextCursor };
  },
});

export type MachinesStore = ReturnType<typeof createMachinesStore>;
