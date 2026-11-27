-- Phase 7: remember which members were reminded for which meeting date.
alter table public.reminder_log add column for_date date;
create index reminder_log_group_date on public.reminder_log (group_id, for_date);
-- Only officials send reminders, always in their own name.
drop policy reminder_log_insert on public.reminder_log;
create policy reminder_log_insert on public.reminder_log for insert to authenticated
  with check (private.is_group_official(group_id) and sent_by = (select auth.uid()));
revoke update on public.reminder_log from authenticated;
