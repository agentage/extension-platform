-- Applied in order by the api image's migrate job, before the rollout; GET /api/v1/ping counts the rows.
create table if not exists pings (
  id         bigint generated always as identity primary key,
  pinged_at  timestamptz not null default now()
);
