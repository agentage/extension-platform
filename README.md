# extension-platform

An agentage extension with one of every part: pages, ui, api, mcp, worker, store and cli. Start a
new extension from it, keep the parts you need, and ship it to `next` in one day.

## Start

```bash
agentage extension create <id> [part...]   # no part = all seven
cd extension-<id> && npm ci && npm run build && agentage extension check
npm run verify                             # type-check, lint, format, tests, build
```

## The one page

[CLAUDE.md](CLAUDE.md): what an extension is, how to write parts, the loop on a laptop, release,
the estate row, how to operate it and what the platform promises.
