# extension-platform

The agentage extension `platform`: the account API at `platform.<fqdn>/api/v1`. Parts api and
store (postgres). Routes: `/machines` (the cli's machines), `/installations/{target}` (one document per machine or cloud host). Scopes `platform:read`,
`platform:write`, `platform:admin`.

```bash
npm ci && npm run verify                   # type-check, lint, format, tests, build
npx agentage extension check               # the kit's conformance rules
```

## The one page

[CLAUDE.md](CLAUDE.md): what an extension is, how to write parts, the loop on a laptop, release,
the estate row, how to operate it and what the platform promises.
