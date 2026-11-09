import { fail, reply, type ApiContext } from '@agentage/extension';
import {
  MachineListQuerySchema,
  MachineParamsSchema as params,
  MachinePatchSchema,
  MachineSchema as output,
  MachineUpsertSchema,
  encodeCursor,
  isCliVersion,
} from './machine.schema.js';
import { type MachinesStore } from './machines.store.js';

type Register = (ctx: ApiContext, machines: MachinesStore) => void;

export const machineNotFound = (id: string) =>
  fail('NOT_FOUND', `no machine ${id} on this account`, { code: 'MACHINE_NOT_FOUND' });

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
  const input = MachineUpsertSchema;
  const spec = { summary: 'Register', scope: 'write', input, params, output, status: 201 } as const;
  route('put', '/machines/{id}', spec, async ({ input, params, caller }) => {
    const { managed, ...fields } = input;
    if (managed === true) {
      const code = 'MANAGED_REQUIRES_INFRASTRUCTURE';
      throw fail('FORBIDDEN', 'managed is set by infrastructure only', { code });
    }
    const { machine, created } = await machines.upsert(caller.sub, params.id, fields);
    return reply(machine, { status: created ? 201 : 200 });
  });
};

// No body: cliVersion comes from the header every cli request sends (absent or not semver = kept).
const seen: Register = ({ route }, machines) => {
  const spec = { summary: 'Heartbeat', scope: 'write', params, status: 204 } as const;
  route('post', '/machines/{id}/seen', spec, async ({ params, caller, header }) => {
    const sent = header('x-agentage-cli-version')?.trim();
    const version = isCliVersion(sent) ? sent : undefined;
    if (!(await machines.seen(caller.sub, params.id, version))) throw machineNotFound(params.id);
    return reply(null, { status: 204 });
  });
};

const patch: Register = ({ route }, machines) => {
  const input = MachinePatchSchema;
  const spec = { summary: 'Rename or disconnect', scope: 'write', input, params, output } as const;
  route('patch', '/machines/{id}', spec, async ({ input, params, caller }) => {
    const machine = await machines.patch(caller.sub, params.id, input);
    if (!machine) throw machineNotFound(params.id);
    return machine;
  });
};

const forget: Register = ({ route }, machines) => {
  const spec = { summary: 'Forget', scope: 'write', params, status: 204 } as const;
  route('delete', '/machines/{id}', spec, async ({ params, caller }) => {
    if (!(await machines.forget(caller.sub, params.id))) throw machineNotFound(params.id);
    return reply(null, { status: 204 });
  });
};

export const machinesRoutes: Register = (ctx, machines) => {
  for (const register of [list, upsert, seen, patch, forget]) register(ctx, machines);
};
