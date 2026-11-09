import { type ApiContext } from '@agentage/extension';
import { installationsRoutes } from './installations.routes.js';
import { createInstallationsStore } from './installations.store.js';
import { machinesRoutes } from './machines.routes.js';
import { createMachinesStore } from './machines.store.js';

// Mounted at /api/v1; openapi.json is generated from these routes.
export function create(ctx: ApiContext) {
  const machines = createMachinesStore(ctx.store);
  machinesRoutes(ctx, machines);
  installationsRoutes(ctx, { machines, installations: createInstallationsStore(ctx.store) });
}
