begin;

insert into public.guitar_timeline_events (
  guitar_id,
  event_date,
  date_precision,
  event_type,
  category,
  title,
  description,
  is_public,
  is_system,
  created_by_user_id,
  source_key,
  created_at,
  updated_at
)
select
  g.id,
  date '2026-06-20',
  'day',
  'setup',
  'Setup',
  'Setup completed',
  'Properly setup on 6/20/2026',
  true,
  false,
  g.owner_id,
  'migration:QRG-05068283:setup-2026-06-20',
  now(),
  now()
from public.guitars g
where upper(g.qr_code) = 'QRG-05068283'
on conflict (guitar_id, source_key) where source_key is not null do nothing;

delete from public.guitar_specs s
using public.guitars g
where s.guitar_id = g.id
  and upper(g.qr_code) = 'QRG-05068283'
  and lower(trim(s.label)) in ('specs notes', 'setup note', 'setup notes')
  and trim(s.value) = 'Properly setup on 6/20/2026'
  and exists (
    select 1
    from public.guitar_timeline_events e
    where e.guitar_id = g.id
      and e.source_key = 'migration:QRG-05068283:setup-2026-06-20'
  );

commit;
