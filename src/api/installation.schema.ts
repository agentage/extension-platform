import { z } from 'zod';

export const LIMIT_BYTES = 256 * 1024;
export const ETAG = /^"[A-Za-z0-9_-]{8,64}"$/;
// m_ a machine, h_ a cloud host; p_ (profiles, layered under machine overlays) is reserved.
const TARGET = /^(m_[0-9a-f]{8}|h_[0-9a-z-]{1,63})$/;
const Target = z.string().regex(TARGET, 'a target is m_<8 hex> or h_<host>; p_ is reserved');

export const TargetParamsSchema = z.object({ target: Target });

const Deployment = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, 'an extension id'),
  url: z.url({ protocol: /^https?$/ }),
});

const Node = z.looseObject({ kind: z.string().min(1).max(64) });

// Not strict: an unknown top-level field is dropped, so later fields stay additive.
export const InstallationSchema = z.object({
  target: Target,
  deployments: z.array(Deployment).max(256),
  routes: z.record(z.string().regex(/^\/\S*$/, 'a route path'), Node),
});

export type Installation = z.infer<typeof InstallationSchema>;
