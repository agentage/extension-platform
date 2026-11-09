import { fail, reply, type ApiContext } from '@agentage/extension';
import {
  CliVersion,
  MachineListQuerySchema,
  MachineParamsSchema as params,
  MachinePatchSchema,
  MachineSchema as output,
  MachineUpsertSchema,
  encodeCursor,
} from './machine.schema.js';
import { type MachinesStore } from './machines.store.js';

type Register = (ctx: ApiContext, machines: MachinesStore) => void;

export const machineNotFound = (id: string) =>
  fail('NOT_FOUND', `no machine ${id} on this account`, { code: 'MACHINE_NOT_FOUND' });

const ID = '/machines/{id}';
const write = { scope: 'write', params } as const;

const list: Register = ({ route }, machines) => {
  const spec = { summary: 'List machines', input: MachineListQuerySchema };
  route('get', '/machines', spec, async ({ input, caller }) => {
    const page = await machines.list(caller.sub, input.limit, input.cursor);
    const next = page.nextCursor ? { nextCursor: encodeCursor(page.nextCursor) } : {};
    const pagination = { limit: input.limit, total: page.total, ...next };
    return reply(page.machines, { meta: { pagination } });
  });
};

const upsert: Register = ({ route }, machines) => {
  const spec = {
    ...write,
    summary: 'Register',
    input: MachineUpsertSchema,
    output,
    status: 201,
  } as const;
  route('put', ID, spec, async ({ input: { managed, ...fields }, params, caller }) => {
    const code = 'MANAGED_REQUIRES_INFRASTRUCTURE';
    if (managed) throw fail('FORBIDDEN', 'managed is set by infrastructure only', { code });
    const { machine, created } = await machines.upsert(caller.sub, params.id, fields);
    return reply(machine, { status: created ? 201 : 200 });
  });
};

// No body: cliVersion comes from the header every cli request sends (absent or not semver = kept).
const seen: Register = ({ route }, machines) => {
  const spec = { ...write, summary: 'Heartbeat', status: 204 } as const;
  route('post', `${ID}/seen`, spec, async ({ params, caller, header }) => {
    const sent = CliVersion.safeParse(header('x-agentage-cli-version')?.trim());
    if (!(await machines.seen(caller.sub, params.id, sent.data))) throw machineNotFound(params.id);
    return reply(null, { status: 204 });
  });
};

const patch: Register = ({ route }, machines) => {
  const spec = { ...write, summary: 'Rename or disconnect', input: MachinePatchSchema, output };
  route('patch', ID, spec, async ({ input, params, caller }) => {
    const machine = await machines.patch(caller.sub, params.id, input);
    if (!machine) throw machineNotFound(params.id);
    return machine;
  });
};

const forget: Register = ({ route }, machines) => {
  route('delete', ID, { ...write, summary: 'Forget', status: 204 }, async ({ params, caller }) => {
    if (!(await machines.forget(caller.sub, params.id))) throw machineNotFound(params.id);
    return reply(null, { status: 204 });
  });
};

export const machinesRoutes: Register = (ctx, machines) => {
  for (const register of [list, upsert, seen, patch, forget]) register(ctx, machines);
};
