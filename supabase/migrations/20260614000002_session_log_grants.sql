-- Hotfix: grant table-level privileges missing from 20260614000001 (migration up skips Supabase default grants)
grant select, insert on public.session_log to authenticated;
