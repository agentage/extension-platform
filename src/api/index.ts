import { type ApiContext } from '@agentage/extension';
import { machinesRoutes } from './machines.routes.js';
import { createMachinesStore } from './machines.store.js';

// Mounted at /api/v1; openapi.json is generated from these routes.
export function create(ctx: ApiContext) {
  machinesRoutes(ctx, createMachinesStore(ctx.store));
}
