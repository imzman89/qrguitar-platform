-- Reconcile the legacy serial-alias routine with the reviewed Serial Number contract.
-- Earlier installations used Serial / Build ID in two validation messages.
-- Replacing this routine does not update instrument identifiers or stored aliases.
create or replace function public.sync_guitar_serial_alias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  existing_guitar_id uuid;
begin
  if new.serial_number is null or trim(new.serial_number) = '' then
    update public.guitar_serial_aliases
      set is_current = false
      where guitar_id = new.id and is_current = true;
    return null;
  end if;

  normalized := public.normalize_instrument_serial(new.serial_number);
  if length(normalized) < 4 then
    raise exception 'Serial Number must contain at least four letters or numbers.';
  end if;

  select guitar_id into existing_guitar_id
  from public.guitar_serial_aliases
  where serial_normalized = normalized
  limit 1;

  if existing_guitar_id is not null and existing_guitar_id <> new.id then
    raise exception 'An existing QRguitar Profile already uses this Serial Number.';
  end if;

  update public.guitar_serial_aliases
    set is_current = false
    where guitar_id = new.id and serial_normalized <> normalized and is_current = true;

  insert into public.guitar_serial_aliases (
    guitar_id, serial_normalized, serial_display, is_current, source, created_by
  ) values (
    new.id, normalized, new.serial_number, true,
    case when tg_op = 'INSERT' then 'profile_creation' else 'serial_correction' end,
    new.owner_id
  )
  on conflict (serial_normalized) do update
    set serial_display = excluded.serial_display,
        is_current = true
    where public.guitar_serial_aliases.guitar_id = excluded.guitar_id;

  return null;
end;
$$;
