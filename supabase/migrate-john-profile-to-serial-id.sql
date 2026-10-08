-- One-time production-safe migration for the serial-based QRguitar ID rule.
-- Preserves the former profile path in qr_redirects before changing the canonical ID.

begin;

do $$
declare
  source_code constant text := 'QRG-E9DFA48DCC74';
  target_code constant text := 'QRG-SI98092154';
  source_guitar_id uuid;
  conflicting_guitar_id uuid;
begin
  select id into source_guitar_id
  from public.guitars
  where qr_code = source_code;

  if source_guitar_id is null then
    if exists (select 1 from public.guitars where qr_code = target_code) then
      return;
    end if;
    raise exception 'Source QRguitar Profile was not found.';
  end if;

  select id into conflicting_guitar_id
  from public.guitars
  where qr_code = target_code
    and id <> source_guitar_id;

  if conflicting_guitar_id is not null then
    raise exception 'Target QRguitar ID is already registered.';
  end if;

  insert into public.qr_redirects (guitar_id, old_path, active)
  values (source_guitar_id, '/i/' || source_code, true)
  on conflict (old_path) do update
  set guitar_id = excluded.guitar_id,
      active = true;

  update public.guitars
  set qr_code = target_code,
      permanent_path = '/i/' || target_code,
      updated_at = now()
  where id = source_guitar_id;

  insert into public.site_content (content_key, content_value, updated_by, updated_at)
  select
    'record_trust:' || target_code,
    content_value,
    updated_by,
    now()
  from public.site_content
  where content_key = 'record_trust:' || source_code
  on conflict (content_key) do update
  set content_value = excluded.content_value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  delete from public.site_content
  where content_key = 'record_trust:' || source_code;
end $$;

commit;
