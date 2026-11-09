import { createTestContext, startTestServer, type Caller } from '@agentage/extension';
import { create } from './index.js';

export const READ: Caller = { sub: 'usr_a', scopes: ['platform:read'] };
export const WRITE: Caller = { sub: 'usr_a', scopes: ['platform:write'] };
export const ADMIN: Caller = { sub: 'usr_admin', scopes: ['platform:admin'] };
export const OTHER: Caller = { sub: 'usr_b', scopes: ['platform:write'] };

type Server = Awaited<ReturnType<typeof startTestServer>>;

// One store, one server per caller: each request as that caller, scopes enforced.
export const testServers = () => {
  const ctx = createTestContext();
  const servers = new Map<Caller | null, Server>();
  const as = async (caller: Caller | null) => {
    const known = servers.get(caller);
    if (known) return known;
    const server = await startTestServer({ create, ctx, caller });
    servers.set(caller, server);
    return server;
  };
  const close = async () => {
    for (const server of servers.values()) await server.close();
    await ctx.close();
  };
  return { ctx, as, close };
};

export const send = (server: Server, path: string, method: string, body?: unknown, headers = {}) =>
  server.fetch(`/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; message: string; details?: unknown } }).error;
