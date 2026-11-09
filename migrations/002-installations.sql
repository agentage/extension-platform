-- One document per target: a machine's under its account, a cloud host's under owner ''.
create table if not exists installations (
  owner      text not null,
  target     text not null,
  document   jsonb not null,
  etag       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner, target),
  constraint installations_target_format check (target ~ '^(m_[0-9a-f]{8}|h_[0-9a-z-]{1,63})$')
);
