-- The account's agentage cli installs: the web columns, keyed by account and machine id.
create table if not exists machines (
  user_id       text not null,
  id            text not null,
  name          text not null,
  platform      text not null,
  cli_version   text not null,
  managed       boolean not null default false,
  state         text not null default 'connected',
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (user_id, id),
  constraint machines_id_format check (id ~ '^m_[0-9a-f]{8}$'),
  constraint machines_state_check check (state in ('connected', 'disconnected'))
);
create index if not exists machines_user_last_seen on machines (user_id, last_seen_at desc, id);
