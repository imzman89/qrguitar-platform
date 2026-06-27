-- QRguitar launch-safe Reptile demo cleanup.
-- Safe to rerun. It only updates the guarded public launch demo record.

with target as (
  select id
  from public.guitars
  where qr_code = 'QRG-PI260001'
    and serial_number = 'PI260001'
    and brand = 'Proper Instruments'
)
update public.guitars
set
  name = 'Reptile',
  brand = 'Proper Instruments',
  model = '1-of-1 Reptile',
  builder = 'Proper Instruments',
  location = 'Cranston, RI',
  year = '2026',
  visibility = 'public',
  status = 'verified',
  summary = 'Reptile is a one-of-one Proper Instruments build from Cranston, Rhode Island, equipped with Proper Passive tone controls, a Proper Pickups ''64 Closetcaster pickup set, a nitro-finished neck, and a permanent QRguitar record.',
  hero_image_path = '/media/reptile-hero.jpg',
  updated_at = now()
where id in (select id from target);

with target as (
  select id
  from public.guitars
  where qr_code = 'QRG-PI260001'
    and serial_number = 'PI260001'
    and brand = 'Proper Instruments'
)
delete from public.guitar_specs
where guitar_id in (select id from target);

insert into public.guitar_specs (guitar_id, label, value, sort_order)
select target.id, seed.label, seed.value, seed.sort_order
from (
  select id
  from public.guitars
  where qr_code = 'QRG-PI260001'
    and serial_number = 'PI260001'
    and brand = 'Proper Instruments'
) as target
cross join (
  values
    ('Condition', 'new', 1),
    ('Type', 'Electric guitar', 2),
    ('Electronics', 'Proper Passive tone controls', 3),
    ('Pickups', 'Proper Pickups ''64 Closetcaster pickup set', 4),
    ('Neck', 'Nitro-finished neck, slim ''60s C profile', 5),
    ('Fingerboard', 'Rosewood', 6),
    ('Radius', '9.5 inch', 7),
    ('Case', 'Hardshell case included', 8),
    ('QR Record', 'Lifetime QRguitar tracker', 9),
    ('Weight', '7.4 lbs', 10)
) as seed(label, value, sort_order);

select
  guitars.qr_code,
  guitars.name,
  guitars.brand,
  guitars.model,
  guitars.serial_number,
  guitars.builder,
  guitars.location,
  guitars.year,
  guitars.visibility,
  guitars.status,
  guitars.hero_image_path,
  count(guitar_specs.id) as spec_count
from public.guitars
left join public.guitar_specs on guitar_specs.guitar_id = guitars.id
where guitars.qr_code = 'QRG-PI260001'
  and guitars.serial_number = 'PI260001'
  and guitars.brand = 'Proper Instruments'
group by guitars.id;
