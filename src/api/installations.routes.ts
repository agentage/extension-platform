import { fail, reply, type ApiContext, type Caller } from '@agentage/extension';
import {
  ETAG,
  InstallationSchema as output,
  LIMIT_BYTES,
  TargetParamsSchema as params,
  type Installation,
} from './installation.schema.js';
import { type InstallationsStore, type Precondition } from './installations.store.js';
import { machineNotFound } from './machines.routes.js';
import { type MachinesStore } from './machines.store.js';

interface Stores {
  installations: InstallationsStore;
  machines: MachinesStore;
}

// Host documents belong to no account.
const HOST = '';
const isHost = (target: string) => target.startsWith('h_');

const readerOf = (target: string, caller: Caller | null): string => {
  if (isHost(target)) return HOST;
  if (!caller) throw fail('UNAUTHORIZED', 'Missing token');
  return caller.sub;
};

const writerOf = async (target: string, caller: Caller, machines: MachinesStore) => {
  if (!isHost(target)) {
    if (!(await machines.exists(caller.sub, target))) throw machineNotFound(target);
    return caller.sub;
  }
  if (!caller.scopes.includes('platform:admin')) throw fail('FORBIDDEN', 'Needs platform:admin');
  return HOST;
};

const BAD = 'send at most one of If-Match: <etag> or If-None-Match: *';

const preconditionOf = (ifMatch?: string, ifNoneMatch?: string): Precondition => {
  const [match, noneMatch] = [ifMatch?.trim(), ifNoneMatch?.trim()];
  if (match === undefined && noneMatch === undefined) return { kind: 'any' };
  if (match === undefined && noneMatch === '*') return { kind: 'create' };
  if (noneMatch === undefined && match && ETAG.test(match)) return { kind: 'match', etag: match };
  throw fail('VALIDATION_ERROR', BAD);
};

const checked = (doc: Installation, target: string): Installation => {
  if (doc.target !== target) {
    const details = [{ field: 'target', message: 'equals the target in the path' }];
    throw fail('VALIDATION_ERROR', 'Invalid body', { details });
  }
  if (Buffer.byteLength(JSON.stringify(doc)) <= LIMIT_BYTES) return doc;
  const message = `installation above ${LIMIT_BYTES} bytes`;
  throw fail('PAYLOAD_TOO_LARGE', message, { details: { limitBytes: LIMIT_BYTES } });
};

const stale = (sent: Precondition, current: { document: Installation; etag: string } | null) => {
  const message =
    sent.kind === 'create'
      ? 'an installation exists; adopt the current document'
      : current
        ? 'the installation changed; replay on the current document'
        : 'no installation is stored; create it without If-Match';
  const details = { current: current?.document ?? null, etag: current?.etag ?? null };
  return fail('PRECONDITION_FAILED', message, { details });
};

const get = ({ route }: ApiContext, { installations }: Stores) => {
  const spec = {
    summary: 'Read an installation',
    scope: 'optional',
    params,
    output,
    etag: true,
  } as const;
  route('get', '/installations/{target}', spec, async ({ params, caller }) => {
    const stored = await installations.get(readerOf(params.target, caller), params.target);
    const code = 'INSTALLATION_NOT_FOUND';
    if (!stored) throw fail('NOT_FOUND', `no installation for ${params.target}`, { code });
    return reply(stored.document, { etag: stored.etag });
  });
};

const put = ({ route }: ApiContext, { installations, machines }: Stores) => {
  const input = output;
  const spec = {
    summary: 'Replace an installation',
    scope: 'write',
    input,
    params,
    output,
    etag: true,
  } as const;
  route(
    'put',
    '/installations/{target}',
    spec,
    async ({ input, params, caller, ifMatch, header }) => {
      const sent = preconditionOf(ifMatch, header('if-none-match'));
      const doc = checked(input, params.target);
      const owner = await writerOf(params.target, caller, machines);
      const written = await installations.put(owner, params.target, doc, sent);
      if (!written) throw stale(sent, await installations.get(owner, params.target));
      return reply(doc, { etag: written.etag, status: written.created ? 201 : 200 });
    }
  );
};

export const installationsRoutes = (ctx: ApiContext, stores: Stores) => {
  get(ctx, stores);
  put(ctx, stores);
};
