# extension-platform

The agentage account API: the `platform` extension (`@agentage/extension-platform`, private), served at `<host>/api/platform`. It stores each account's machines, and the agentage cli registers its machine here and sends a heartbeat. It also stores one installation document per machine. It is for the cli and for the team that runs agentage.

## Quick start

You need Node 22, npm 10, Docker and git. Ports 4280 and 4281 must be free, or `up` refuses to start.

1. `npm ci`
2. `npx agentage extension up --docker`. It builds the images and starts postgres. It also starts a dev token issuer (port 4281) and a gateway (port 4280). It waits until every part is healthy.
3. Call the api with a token that has the scope of the route:

   ```bash
   T=$(npx agentage extension token --scope platform:read)
   curl -H "Authorization: Bearer $T" localhost:4280/api/platform/machines   # 200
   ```

   A call without a token returns 401.

4. `npx agentage extension down` removes the containers, network and volume of this working copy.

`up` writes `.agentage/` (git ignores it). Each part logs JSON lines with an `agcid` per request. Find the container with `docker ps`, then run `docker logs <container>`.

## What it serves

| Part  | Folder        | What it serves                                      |
| ----- | ------------- | --------------------------------------------------- |
| api   | `src/api`     | the routes below                                    |
| store | `migrations/` | postgres; the tables `machines` and `installations` |

It has no MCP tools and no app page.

| Route under `/api/platform`   | Scope            | What it does                                        |
| ----------------------------- | ---------------- | --------------------------------------------------- |
| `GET /machines`               | `platform:read`  | lists the machines of the account                   |
| `PUT /machines/{id}`          | `platform:write` | registers or updates a machine: 201 new, 200 update |
| `PATCH /machines/{id}`        | `platform:write` | renames or disconnects a machine                    |
| `DELETE /machines/{id}`       | `platform:write` | forgets a machine and its installation              |
| `POST /machines/{id}/seen`    | `platform:write` | the heartbeat                                       |
| `GET /installations/{target}` | `platform:read`  | reads an installation; a host target needs no token |
| `PUT /installations/{target}` | `platform:write` | writes the installation of a machine                |

The full list is [openapi.json](openapi.json). It is generated, so do not edit it. During the move to `/api/{id}` paths, the same routes also answer under `/api/v1`.

- A higher scope passes a route that needs a lower one. The order is `read`, `write`, `admin`.
- A machine only sees the rows of its own account.

More: [docs/routes.md](docs/routes.md)

### What it holds

- **Machine**: one agentage cli install of an account. Its id is `m_` plus 8 hex digits. It has a name, a platform (`linux-x64`), the cli version and a state (`connected` or `disconnected`).
- **Installation**: one JSON document per target. It lists the extension deployments and routes of that target. A target is a machine (`m_...`). A document is at most 256 KiB.
- An app host keeps its installation in a file, `<host>/installation.json` in agentage/apphosts. So a host target (`h_<host>`) is read-only here: a write answers 403 `HOST_INSTALLATION_IS_A_FILE`.
- A machine and its installation live and die together. Forgetting a machine deletes its installation.

### Words used here

- **Extension**: one npm package with a manifest in the `agentage` block of `package.json`.
- **Part**: one folder of `src/` with one job: `api`, and `store` for the migrations.
- **Kit**: the library `@agentage/extension`. It owns the server, `/health`, auth and logs. The repo `agentage/platform` holds the kit. It is not this repo.

## Verify

```bash
npm run verify                    # type-check, lint, format check, tests with coverage, build
npx agentage extension check      # PASS platform <version> conforms
```

## Release

1. Raise the version in `package.json`.
2. Run `npx agentage extension check --write` and commit.
3. Push the tag `v<version>` on that commit on master.

`release.yml` then pushes the images and attaches `agentage-container.json` and `agentage-extension.json` to the GitHub release. The package is private, so nothing goes to npm. A moved tag is refused, so a fix is a new version.

## Deploy

A release deploys nothing. Today the `platform` row in agentage/estate `estate.yaml` sets the version that runs on `next`, the staging environment, at `platform.next.agentage.io`. The move to the platform app host (a row in `platform/installation.json` of agentage/apphosts) is planned. More: [CLAUDE.md](CLAUDE.md#after-a-release).

## Documentation

- [docs/routes.md](docs/routes.md): the scope of every route, the `managed` refusal and the etag rules.
- [CLAUDE.md](CLAUDE.md): the rules for an agent that changes this repo.

## License

MIT, see [LICENSE](LICENSE).
