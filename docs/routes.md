# Routes and scopes

The full list is [openapi.json](../openapi.json). It is generated: do not edit it by hand. These rules matter because a wrong guess costs something.

- Every route needs a token. The exception is `GET /installations/h_...`, which is open for a cloud host.
- Each route declares a scope in `src/api/*.routes.ts`:

  | Route                                         | Scope declared       | Also needed                                                                               |
  | --------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
  | `GET /machines`                               | `read` (the default) |                                                                                           |
  | `PUT`, `PATCH`, `DELETE /machines/{id}`       | `write`              |                                                                                           |
  | `POST /machines/{id}/seen`                    | `write`              |                                                                                           |
  | `GET /installations/{target}`                 | `optional`           | A machine target needs `platform:read` or higher, else 403. A host target needs no token. |
  | `PUT /installations/{target}`, machine target | `write`              |                                                                                           |
  | `PUT /installations/{target}`, host `h_...`   | `write`              | Also `platform:admin`, checked in the handler. Without it the answer is 403.              |

  A token you send to `GET /installations/h_...` is still checked.

- `PUT /machines/{id}` answers 201 for a new machine and 200 for an update.
- `PUT /machines/{id}` refuses `managed: true` with 403 `MANAGED_REQUIRES_INFRASTRUCTURE`. Only the infrastructure may set `managed`.
- `PUT /installations/{target}` takes `If-Match: <etag>` or `If-None-Match: *`, never both.
- If the etag does not match, the answer is 412. `details` holds the current document and its etag. Apply your change to that document and send it again.
- A machine only sees the rows of its own account.
