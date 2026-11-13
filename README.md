# extension-platform

The agentage account API: the machines of an account and one installation document per machine or
cloud host. It is the `platform` extension (`@agentage/extension-platform`), served at
`platform.<host>/api/v1`. The agentage cli registers its machine here and sends a heartbeat. A cloud
host keeps its own installation document here.

```bash
npm ci && npx agentage extension up    # needs Node 22, Docker, git; serves http://localhost:4280
```

## What it holds

- **Machine**: one agentage cli install of an account. Id `m_` plus 8 hex digits. It has a name, a platform (`linux-x64`), the cli version and a state (`connected` or `disconnected`).
- **Installation**: one JSON document per target. It lists the extension deployments and routes of that target. A target is a machine (`m_...`) or a cloud host (`h_<host>`), and the document is at most 256 KiB.
- A machine and its installation live and die together: forgetting a machine deletes its installation.

## Words used here

- **Extension**: one npm package with a manifest in the `agentage` block of `package.json`. This repo is the extension `platform`. The repo `agentage/platform` is another thing: it holds the kit.
- **Part**: one folder of `src/` that agentage runs as its own container (here `api`, and `store` for the migrations).
- **Kit**: the library `@agentage/extension`. It owns the server, `/health`, auth and logs.
- **Gate**: the end-to-end suite in agentage/e2e (a private repo) that runs against a running copy.
- **next**: the staging environment at `next.agentage.io`.

## Run it locally

You need Node 22, npm 10, Docker and git. Ports 4280 and 4281 must be free: `up` refuses to start when another stack holds them.

1. `npm ci`
2. `npx agentage extension up`. It builds the images, starts postgres, a dev token issuer (port 4281) and a gateway (port 4280), and waits until every part is healthy.
3. Call the api with a token that has the route's scope:

   ```bash
   T=$(npx agentage extension token --scope platform:read)
   curl -H "Authorization: Bearer $T" localhost:4280/api/v1/machines   # 200
   ```

   A call without a token returns 401.

4. `npx agentage extension down` removes this working copy's containers, network and volume.

`up` writes `.agentage/` (git ignores it). A part logs JSON lines with an `agcid` for each request: find the container with `docker ps`, then `docker logs <container>`.

## Prove a change

```bash
npm run verify                    # type-check, lint, format check, tests with coverage, build
npx agentage extension check      # PASS platform <version> conforms
```

Coverage must stay at 70 percent or more on all four metrics.

## Release

1. Raise the version in `package.json`.
2. Run `npx agentage extension check --write` and commit.
3. Push the tag `v<version>` on that commit on master.

`release.yml` then pushes the part images, attaches `agentage-extension.json` to the GitHub release and publishes to npm. A re-run only retries npm. A moved tag is refused: a fix is a new version.

For the rules an agent must follow when it changes this repo, read [CLAUDE.md](CLAUDE.md).
