# CLAUDE.md - the one page

Read this page first. It is the only page you need to ship this extension to `next` in one day.
The deployed proof of the same shape is [agentage/extension-probe](https://github.com/agentage/extension-probe).
The kit rules are in the READMEs of [`@agentage/extension`](https://www.npmjs.com/package/@agentage/extension)
and [`@agentage/widget`](https://www.npmjs.com/package/@agentage/widget).

## 1. What an extension is

- An extension is one npm package. The `agentage` block of `package.json` is its manifest: the
  id, the parts, the commands, the settings and the secrets.
- A part is one folder in `src/`. Each exports `create(ctx)` only; the ui part exports `widgets`.
- The kit owns the server, `/health`, auth, the store pool, the scheduler and the images. You
  write only the part code.

| Part  | Folder        | What it does here                                             |
| ----- | ------------- | ------------------------------------------------------------- |
| api   | `src/api`     | `/api/v1/machines` (C3): list, register, seen, rename, forget |
| store | `migrations/` | postgres; the `machines` table                                |

## 2. Start

```bash
agentage extension create <id> [part...]   # no part = all seven
cd extension-<id> && npm ci && npm run build && agentage extension check
git init -b master && git add -A && git commit -m "feat: <id> extension"
```

- The id has lowercase letters, digits and `-`. It starts with a letter. It is not a part name.
- Keep at least one of pages, ui, api or mcp.
- `create` deletes the folders and contracts of the parts you do not keep. It writes your id into every file.
- Push to a new public repo `agentage/extension-<id>`, default branch `master`.
- Edit to the parts you kept: the table of section 1, the README, `description` in `package.json`
  and `MIN_EXECUTED` in `ci.yml` (the gate's floor: 25 fits all seven parts).

## 3. Write parts

- A part imports only its own folder and `src/lib/`. Each image carries `dist/{part}` and
  `dist/lib` only. `src/manifest.test.ts` refuses a cross-part import.
- Put code in `src/lib/` only when every kept part can use it.
- Never use `listen()`, the `process` global, a token check or an absolute agentage URL in `src/`.
- Each part has its tests beside it in `src/{part}/`. One part can go without breaking another.
- Test only the lines you wrote: `check` and the kit's own tests cover the rest.
- api: declare each route with `route(method, path, { summary, scope?, input?, output? }, handler)`.
  The scope is `read` (the default), `write`, `admin` or `public` (anonymous). `input` is read
  from the query on get and delete and from the body otherwise: use `z.coerce` for numbers.
  The handler returns the data; the kit answers `ok(...)`.
- mcp: give each tool a `scope` beside its schemas. The kit names it `{id}__{name}`.
- store: add a numbered file in `migrations/`. Never edit a migration that ran.
- `openapi.json` and `platform.mcpc.json` are committed contracts, generated from the routes and
  tools. `check` compares them to the code. After a change, run `npm run build`,
  `npx agentage extension check --write`, then `npm run format`.

## 4. The loop on a laptop

You need Node 22+, npm 10+, Docker, `git` and `jq`.

```bash
npm run verify                                  # type-check, lint, format, tests, build
npx agentage extension check                    # PASS {id} {version} conforms (6 rules)
npx agentage extension up                       # ready    N parts healthy    <n> s (each /health body checked)
npm run test:e2e                                # the widget in a browser, axe WCAG A/AA
T=$(npx agentage extension token --scope platform:read)
curl -s -H "Authorization: Bearer $T" "localhost:4280/api/v1/machines"
npx agentage extension down                     # removes this working copy's containers
```

- `up` runs the release images, postgres with your migrations, a dev issuer (4281) and a gateway
  (4280) laid out like `next`.
- `up` writes `.agentage/` (ignored). From cli 0.43, `build` needs a commit.
- CI runs the same steps, then the e2e gate on local: `npm run e2e -- platform gate local` in
  agentage/e2e. The gate needs your row in its `extensions.json` (section 6). It never retries.

## 5. Release

- Bump the version in `package.json`, run `npx agentage extension check --write`, commit, and
  push the tag `v{version}` on that commit on master.
- `release.yml` (`agentage extension release`) then pushes the part images, attaches
  `agentage-extension.json` to the GitHub release and publishes to npm. The first publish of a
  new npm name waits for the owner's approval; then add `release.yml` as the trusted publisher
  on npmjs.com.
- A re-run only retries npm; a moved tag is refused. A fix is a new version. Never move a `v*` tag.
- `agentage extension release` refuses the id of the repo this one was copied from, and passes for every other id.

## 6. The estate row

These touches are outside this repo. Each is one small PR or one owner action.

| Where                                 | What                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------- |
| agentage/estate `estate.yaml`         | `extensions.{id}: { version, parts: { api: api, ... } }`                  |
| agentage/e2e `extensions.json`        | `{ "id": "{id}", "token": "GATE_TOKENS", "targets": ["local", "next"] }`  |
| the `GATE_TOKENS` secret (owner)      | a `"{id}"` entry: the bearer your gate sends on `next`                    |
| agentage/auth `pat-scopes.ts` (owner) | the id in `EXTENSION_IDS`: the routes declare `platform:read` and `write` |

- Pools: `web` for pages and ui, `api` for api, mcp and worker, `data` for store. Host: `{id}.next.agentage.io`.

## 7. Operate

- A merge to estate master deploys `next`. The deploy applies the stacks, checks each part's
  `/health`, then runs your gate: `npm run e2e -- {id} gate next`.
- Read a red run on the Actions tab of agentage/estate. The run names the part and the check.
  A part logs JSON lines with the request's `agcid`: search for it.
- To change what runs, release a new version and change the version in the estate row.

## 8. What the platform promises

- The kit checks the token and the declared scope before your route or tool runs.
- The gateway serves `/`, `/ui/{version}/`, `/api/v1/` and `/mcp`. It drops the `Cookie` header.
- The estate runs the migrations as a job before the rollout. A release never restarts the store.
- The same smoke and contract gate runs for every extension in the e2e registry.
- A kit minor reaches this repo through the Friday Dependabot group PR. Merge it when CI is green.
