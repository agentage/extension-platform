# CLAUDE.md - extension-platform

For an agent that changes this repo. What it is, how to run it and how to release it: [README.md](README.md). The kit rules are in the README of [`@agentage/extension`](https://www.npmjs.com/package/@agentage/extension). A deployed example of the same shape is [agentage/extension-probe](https://github.com/agentage/extension-probe).

## Where things are

| Part  | Folder        | What it does here                                       |
| ----- | ------------- | ------------------------------------------------------- |
| api   | `src/api`     | `/api/v1/machines` and `/api/v1/installations/{target}` |
| store | `migrations/` | postgres; the tables `machines` and `installations`     |

- Routes: `src/api/machines.routes.ts` and `src/api/installations.routes.ts`. Schemas: `machine.schema.ts` and `installation.schema.ts` in the same folder.
- The contract is `openapi.json`. This repo has no mcp or ui part, so there is no `*.mcpc.json`.
- The extension id is `platform`. It has no settings and no secrets.

## Rules

- A part imports only its own folder and `src/lib/`. `src/manifest.test.ts` refuses a cross-part import.
- In `src/` never use `listen()`, the `process` global, a token check or an absolute agentage URL. The kit owns them.
- Declare a route with `route(method, path, { summary, scope, input, output }, handler)`. The scope is `read` (the default), `write`, `admin`, `public` or `optional`.
- Account rows are keyed by the caller's id (`caller.sub`). A route must never return a row of another account. Host documents (`h_...`) belong to no account.
- Add a numbered file in `migrations/` for a schema change. Never edit a migration that ran. Write each one so a second run does nothing: `if not exists`, or a `do` block that catches `duplicate_object`.
- Tests sit beside the code as `src/**/*.test.ts`. Coverage floor: 70 on all four metrics (`vitest.config.ts`). `npm run test:e2e` finds no `*.spec.ts` file here and passes with no tests.
- After a route change run `npm run build`, `npx agentage extension check --write`, then `npm run format`. `check` compares `openapi.json` with the code.
- Do not move a `v*` tag. Do not publish from a laptop.

## Commands that prove a change

`npm run verify` runs in this order: type-check, lint, format check, tests with coverage, build. Run it first, then `npx agentage extension check`.

CI (`.github/workflows/ci.yml`) runs the same two steps. Its `local` job then runs `up` and the gate: `npm run e2e -- platform gate local` in agentage/e2e.

- The gate never retries. A gate that runs fewer checks than `MIN_EXECUTED` is red. The floor is set in `ci.yml` (the step "Assert the gate was not vacuous"). Raise it when the gate grows.
- The gate needs a `platform` row in agentage/e2e `extensions.json`. The id must also be in the auth service's list of extension ids, so a token can carry `platform:*` scopes.

## After a release

- A merge to the estate (agentage/estate) master deploys `next`. The deploy applies the stacks, checks each part's `/health`, then runs `npm run e2e -- platform gate next`.
- The `version` field of the `platform` row in `estate.yaml` sets which release runs. To change what runs, release a new version and change that field.
- Read a red deploy on the Actions tab of agentage/estate. It names the part and the check. Search the part's logs for the request's `agcid`.
- The estate runs the migrations as a job before the rollout. A release never restarts the store.
- A kit minor reaches this repo through the Friday Dependabot group PR. Merge it when CI is green.
