# Routes and scopes

The full list is [openapi.json](../openapi.json). It is generated: do not edit it by hand. Rules where a wrong guess costs something:

- Every route needs a token. The exception is `GET /installations/h_...`, which is open for a cloud host.
- Scopes, per route (declared in `src/api/*.routes.ts`):

  | Route                                         | Scope declared       | Also needed                                                                                            |
  | --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
  | `GET /machines`                               | `read` (the default) |                                                                                                        |
  | `PUT`, `PATCH`, `DELETE /machines/{id}`       | `write`              |                                                                                                        |
  | `POST /machines/{id}/seen`                    | `write`              |                                                                                                        |
  | `GET /installations/{target}`                 | `optional`           | `m_...`: `platform:read` or higher, else 403. `h_...`: no token; a token that is sent is still checked |
  | `PUT /installations/{target}`, machine target | `write`              |                                                                                                        |
  | `PUT /installations/{target}`, host `h_...`   | `write`              | and `platform:admin`, checked in the handler (403 without it)                                          |

- `PUT /machines/{id}` answers 201 for a new machine and 200 for an update. It refuses `managed: true` with 403 `MANAGED_REQUIRES_INFRASTRUCTURE`: only infrastructure sets it.
- `PUT /installations/{target}` takes `If-Match: <etag>` or `If-None-Match: *`, never both. A failed precondition answers 412 with the current document and its etag in `details`. Replay on that document.
- A machine only sees the rows of its own account.
