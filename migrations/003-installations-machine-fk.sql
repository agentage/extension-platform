-- A machine's installation lives and dies with the machine, even when a write races a forget.
delete from installations i where target like 'm\_%'
  and not exists (select 1 from machines m where m.user_id = i.owner and m.id = i.target);
alter table installations add column if not exists machine_id text
  generated always as (case when target like 'm\_%' then target end) stored;
do $$ begin
  alter table installations add constraint installations_machine_fk foreign key (owner, machine_id)
    references machines (user_id, id) on delete cascade;
exception when duplicate_object then null;
end $$;
