begin;

-- Manual mirror of 20260714203000_identity_model_correction.sql.
-- Safe to rerun. It preserves the older John profile URL through qr_redirects.

do $$
declare
  john_old_code constant text := 'QRG-E9DFA48DCC74';
  john_new_code constant text := 'QRG-SI98092154';
  john_guitar_id uuid;
  conflicting_guitar_id uuid;
begin
  select id into john_guitar_id
  from public.guitars
  where qr_code in (john_new_code, john_old_code)
  order by case when qr_code = john_new_code then 0 else 1 end
  limit 1;

  if john_guitar_id is not null then
    select id into conflicting_guitar_id
    from public.guitars
    where qr_code = john_new_code
      and id <> john_guitar_id;

    if conflicting_guitar_id is not null then
      raise exception 'Target QRguitar ID is already registered.';
    end if;

    insert into public.qr_redirects (guitar_id, old_path, active)
    values (john_guitar_id, '/i/' || john_old_code, true)
    on conflict (old_path) do update
    set guitar_id = excluded.guitar_id,
        active = true;

    update public.guitars
    set
      qr_code = john_new_code,
      permanent_path = '/i/' || john_new_code,
      serial_number = 'SI98092154',
      updated_at = now()
    where id = john_guitar_id;

    insert into public.site_content (content_key, content_value, updated_by, updated_at)
    select
      'record_trust:' || john_new_code,
      content_value,
      updated_by,
      now()
    from public.site_content
    where content_key = 'record_trust:' || john_old_code
    on conflict (content_key) do update
    set content_value = excluded.content_value,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

    delete from public.site_content
    where content_key = 'record_trust:' || john_old_code;
  end if;
end $$;

update public.guitars
set
  serial_number = case qr_code
    when 'QRG-05068283' then '05068283'
    when 'QRG-E985125' then 'E985125'
    else serial_number
  end,
  updated_at = now()
where qr_code in ('QRG-05068283', 'QRG-E985125')
  and (
    coalesce(serial_number, '') <> case qr_code
      when 'QRG-05068283' then '05068283'
      when 'QRG-E985125' then 'E985125'
      else coalesce(serial_number, '')
    end
  );

update public.guitar_specs
set value = 'Electric Guitar'
where lower(trim(label)) = 'type'
  and guitar_id in (
    select id from public.guitars
    where qr_code in ('QRG-SI98092154', 'QRG-05068283', 'QRG-E985125')
  )
  and coalesce(value, '') <> 'Electric Guitar';

insert into public.guitar_specs (guitar_id, label, value, sort_order)
select g.id, 'Type', 'Electric Guitar', 2
from public.guitars g
where g.qr_code in ('QRG-SI98092154', 'QRG-05068283', 'QRG-E985125')
  and not exists (
    select 1 from public.guitar_specs s
    where s.guitar_id = g.id
      and lower(trim(s.label)) = 'type'
  );

commit;
