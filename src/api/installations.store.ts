import { randomBytes } from 'node:crypto';
import { type Store } from '@agentage/extension';
import { type Installation } from './installation.schema.js';

// match carries the bare tag, or * for any stored document.
export type Precondition = { kind: 'match'; etag: string } | { kind: 'create' } | { kind: 'any' };
type Stored = { document: Installation; etag: string };
type Written = { etag: string; created: boolean };

const quote = (etag: string) => `"${etag}"`;
const newEtag = () => randomBytes(12).toString('base64url');

// A machine target is written only while the machine is on the owner's account ($5: a host).
const INSERT = `insert into installations (owner, target, document, etag)
  select $1, $2, $3, $4
  where $5::boolean or exists (select 1 from machines where user_id = $1 and id = $2)`;

const WRITE: Record<Precondition['kind'], string> = {
  any: `${INSERT} on conflict (owner, target) do update set document = excluded.document,
      etag = excluded.etag, updated_at = now()
    returning etag, (xmax = 0) as created`,
  create: `${INSERT} on conflict (owner, target) do nothing returning etag, true as created`,
  match: `update installations set document = $3, etag = $4, updated_at = now()
    where owner = $1 and target = $2 and (etag = $5 or $5 = '*')
    returning etag, false as created`,
};

export const createInstallationsStore = (store: Store) => ({
  get: async (owner: string, target: string): Promise<Stored | null> => {
    const sql = 'select document, etag from installations where owner = $1 and target = $2';
    const [row] = (await store.query<Stored>(sql, [owner, target])).rows;
    return row ? { document: row.document, etag: quote(row.etag) } : null;
  },
  // null when nothing was written: a failed precondition, or a machine not on the account.
  put: async (owner: string, target: string, doc: Installation, sent: Precondition) => {
    const last = sent.kind === 'match' ? sent.etag : target.startsWith('h_');
    const params = [owner, target, JSON.stringify(doc), newEtag(), last];
    const [row] = (await store.query<Written>(WRITE[sent.kind], params)).rows;
    return row ? { etag: quote(row.etag), created: row.created } : null;
  },
});

export type InstallationsStore = ReturnType<typeof createInstallationsStore>;
