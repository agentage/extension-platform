# extension-platform

The agentage account API: the `platform` extension (`@agentage/extension-platform`), served at `platform.<host>/api/v1`. It stores each account's machines, and the agentage cli registers its machine here and sends a heartbeat. It also stores one installation document per machine or cloud host (an `h_<host>` target). An installation document is a JSON document that lists the extension deployments and routes of that target.

```bash
npm ci && npx agentage extension up    # needs Node 22, Docker, git; serves http://localhost:4280
```

## What it holds

- **Machine**: one agentage cli install of an account. Its id is `m_` plus 8 hex digits. It has a name, a platform (`linux-x64`), the cli version and a state (`connected` or `disconnected`).
- **Installation**: one JSON document per target. It lists the extension deployments and routes of that target. A target is a machine (`m_...`) or a cloud host (`h_<host>`). A document is at most 256 KiB.
- A machine and its installation live and die together. Forgetting a machine deletes its installation.

## Routes and scopes

The full list is [openapi.json](openapi.json). It is generated, so do not edit it.

- Every route needs a token, except `GET /installations/h_...`.
- Read routes need `platform:read` or higher. Write routes need `platform:write` or higher.
- A write to a host installation also needs `platform:admin`.
- A machine only sees the rows of its own account.

More: [docs/routes.md](docs/routes.md)

## Words used here

- **Extension**: one npm package with a manifest in the `agentage` block of `package.json`.
- **Part**: one folder of `src/` that runs as its own container: `api`, and `store` for the migrations.
- **Kit**: the library `@agentage/extension`. It owns the server, `/health`, auth and logs. The repo `agentage/platform` holds the kit. It is not this repo.

## Run it locally

You need Node 22, npm 10, Docker and git. Ports 4280 and 4281 must be free, or `up` refuses to start.

1. `npm ci`
2. `npx agentage extension up`. It builds the images and starts postgres. It also starts a dev token issuer (port 4281) and a gateway (port 4280). It waits until every part is healthy.
3. Call the api with a token that has the scope of the route:

   ```bash
   T=$(npx agentage extension token --scope platform:read)
   curl -H "Authorization: Bearer $T" localhost:4280/api/v1/machines   # 200
   ```

   A call without a token returns 401.

4. `npx agentage extension down` removes the containers, network and volume of this working copy.

`up` writes `.agentage/` (git ignores it). Each part logs JSON lines with an `agcid` per request. Find the container with `docker ps`, then run `docker logs <container>`.

## Prove a change

```bash
npm run verify                    # type-check, lint, format check, tests with coverage, build
npx agentage extension check      # PASS platform <version> conforms
```

## Release

1. Raise the version in `package.json`.
2. Run `npx agentage extension check --write` and commit.
3. Push the tag `v<version>` on that commit on master.

`release.yml` then pushes the part images, attaches `agentage-extension.json` to the GitHub release and publishes to npm. A re-run only retries npm. A moved tag is refused, so a fix is a new version.

## Documentation

- [docs/routes.md](docs/routes.md): the scope of every route, the `managed` refusal and the etag rules.
- [CLAUDE.md](CLAUDE.md): the rules for an agent that changes this repo.

## License

MIT, see [LICENSE](LICENSE).
