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

// Host documents belong to no account.
const HOST = '';
const PATH = '/installations/{target}';
const isHost = (target: string) => target.startsWith('h_');

const ownerOf = (target: string, caller: Caller | null, admin = false): string => {
  if (!caller && !isHost(target)) throw fail('UNAUTHORIZED', 'Missing token');
  if (admin && !caller?.scopes.includes('platform:admin'))
    throw fail('FORBIDDEN', 'Needs platform:admin');
  return isHost(target) ? HOST : (caller?.sub ?? HOST);
};

// A weak tag compares like a strong one: the document is JSON, byte-equal under one tag.
const preconditionOf = (ifMatch?: string, ifNoneMatch?: string): Precondition => {
  const [match, none] = [ifMatch?.trim().replace(/^W\//, ''), ifNoneMatch?.trim()];
  if (match === undefined && none === undefined) return { kind: 'any' };
  if (match === undefined && none === '*') return { kind: 'create' };
  if (none === undefined && match === '*') return { kind: 'match', etag: '*' };
  if (none === undefined && match && ETAG.test(match))
    return { kind: 'match', etag: match.slice(1, -1) };
  throw fail('VALIDATION_ERROR', 'send at most one of If-Match: <etag> or If-None-Match: *');
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

const stale = (current: { document: Installation; etag: string } | null) => {
  const details = { current: current?.document ?? null, etag: current?.etag ?? null };
  const message = 'the precondition does not hold; replay on the current document';
  return fail('PRECONDITION_FAILED', message, { details });
};

const get = ({ route }: ApiContext, installations: InstallationsStore) => {
  const spec = { summary: 'Read an installation', scope: 'optional', params, output } as const;
  route('get', PATH, spec, async ({ params: { target }, caller }) => {
    const stored = await installations.get(ownerOf(target, caller), target);
    const code = 'INSTALLATION_NOT_FOUND';
    if (!stored) throw fail('NOT_FOUND', `no installation for ${target}`, { code });
    return reply(stored.document, { etag: stored.etag });
  });
};

const put = ({ route }: ApiContext, installations: InstallationsStore) => {
  const spec = { summary: 'Replace an installation', scope: 'write', input: output } as const;
  const full = { ...spec, params, output, etag: true, status: 201 } as const;
  route('put', PATH, full, async ({ input, params: { target }, caller, ifMatch, header }) => {
    const sent = preconditionOf(ifMatch, header('if-none-match'));
    const owner = ownerOf(target, caller, isHost(target));
    const written = await installations.put(owner, target, checked(input, target), sent);
    if (written) return reply(input, { etag: written.etag, status: written.created ? 201 : 200 });
    const current = await installations.get(owner, target);
    if (!current && !isHost(target) && sent.kind !== 'match') throw machineNotFound(target);
    throw stale(current);
  });
};

export const installationsRoutes = (ctx: ApiContext, installations: InstallationsStore) => {
  get(ctx, installations);
  put(ctx, installations);
};
