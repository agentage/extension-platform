import { PageQuerySchema } from '@agentage/extension';
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

// The list keyset: last_seen_at to the microsecond (equal to the stored value), then the id.
const At = z.tuple([z.iso.datetime(), z.string().regex(MACHINE_ID)]);
const Cursor = PageQuerySchema.shape.cursor.unwrap().transform((c) => c.split(' '));
export const MachineListQuerySchema = PageQuerySchema.extend({
  cursor: Cursor.pipe(At).optional(),
});

export const MachineSchema = MachineUpsertSchema.extend({
  id: z.string().regex(MACHINE_ID),
  name: MachineName,
  managed: z.boolean(),
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
});

export type Machine = z.infer<typeof MachineSchema>;
export type MachineInput = Omit<z.infer<typeof MachineUpsertSchema>, 'managed'>;
export type MachinePatch = z.infer<typeof MachinePatchSchema>;
