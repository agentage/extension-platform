import { z } from 'zod';

export const MACHINE_ID = /^m_[0-9a-f]{8}$/;

const MachineName = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[^\u0000-\u001f\u007f]+$/, 'no control characters');
const Platform = z.string().regex(/^[a-z0-9]{2,16}-[a-z0-9]{2,16}$/, 'expected <platform>-<arch>');
export const CliVersion = z
  .string()
  .regex(
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
    'expected a semver version'
  );
const MachineState = z.enum(['connected', 'disconnected']);

export const MachineParamsSchema = z.object({
  id: z.string().regex(MACHINE_ID, 'id must match ^m_[0-9a-f]{8}$'),
});

export const MachineUpsertSchema = z.strictObject({
  name: MachineName.optional(),
  platform: Platform,
  cliVersion: CliVersion,
  managed: z.boolean().optional(),
  state: MachineState,
});

export const MachinePatchSchema = z
  .strictObject({ name: MachineName.optional(), state: MachineState.optional() })
  .refine((p) => p.name !== undefined || p.state !== undefined, 'send name or state');

export interface MachineCursor {
  t: string;
  id: string;
}

export const encodeCursor = (cursor: MachineCursor): string =>
  Buffer.from(JSON.stringify([cursor.t, cursor.id])).toString('base64url');

const decodeCursor = (raw: string): MachineCursor | null => {
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const [t, id] = Array.isArray(value) && value.length === 2 ? (value as unknown[]) : [];
    const ok = typeof t === 'string' && !Number.isNaN(Date.parse(t)) && typeof id === 'string';
    return ok && MACHINE_ID.test(id) ? { t, id } : null;
  } catch {
    return null;
  }
};

export const MachineListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined) return undefined;
      const cursor = decodeCursor(raw);
      if (!cursor) ctx.addIssue({ code: 'custom', message: 'not a cursor this list returned' });
      return cursor ?? undefined;
    }),
});

export const MachineSchema = z.strictObject({
  id: z.string().regex(MACHINE_ID),
  name: MachineName,
  platform: Platform,
  cliVersion: CliVersion,
  managed: z.boolean(),
  state: MachineState,
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
});

export type Machine = z.infer<typeof MachineSchema>;
export type MachineInput = Omit<z.infer<typeof MachineUpsertSchema>, 'managed'>;
export type MachinePatch = z.infer<typeof MachinePatchSchema>;
