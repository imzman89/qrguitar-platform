-- Restore the user-approved allowance of 25 free owned Profiles.
-- This is forward-only: existing Profiles and paid-credit ledger rows are unchanged.
begin;

do $$
declare
  credited_source text;
  status_source text;
  five_quota text := '(select count(*) from public.guitars where owner_id=p_owner_id)>=5';
  twenty_five_quota text := '(select count(*) from public.guitars where owner_id=p_owner_id)>=25';
  credited_is_five boolean;
  credited_is_twenty_five boolean;
  status_is_five boolean;
  status_is_twenty_five boolean;
begin
  credited_source := pg_get_functiondef('public.create_instrument_profile_credited(uuid,text,text,jsonb,boolean,text,text)'::regprocedure);
  status_source := pg_get_functiondef('public.billing_account_status(uuid,text)'::regprocedure);

  credited_is_five :=
    (length(credited_source)-length(replace(credited_source,five_quota,'')))/length(five_quota) = 1
    and position(twenty_five_quota in credited_source) = 0;
  credited_is_twenty_five :=
    (length(credited_source)-length(replace(credited_source,twenty_five_quota,'')))/length(twenty_five_quota) = 1
    and position(five_quota in credited_source) = 0;
  status_is_five :=
    (length(status_source)-length(replace(status_source,'''freeLimit'',5','')))/length('''freeLimit'',5') = 1
    and (length(status_source)-length(replace(status_source,'greatest(5-owned,0)','')))/length('greatest(5-owned,0)') = 1
    and position('''freeLimit'',25' in status_source) = 0
    and position('greatest(25-owned,0)' in status_source) = 0;
  status_is_twenty_five :=
    (length(status_source)-length(replace(status_source,'''freeLimit'',25','')))/length('''freeLimit'',25') = 1
    and (length(status_source)-length(replace(status_source,'greatest(25-owned,0)','')))/length('greatest(25-owned,0)') = 1
    and position('''freeLimit'',5' in status_source) = 0
    and position('greatest(5-owned,0)' in status_source) = 0;

  if credited_is_twenty_five and status_is_twenty_five then
    -- A migration retry after the reviewed transition is an exact no-op.
    null;
  elsif credited_is_five and status_is_five then
    -- Checkout has never been enabled in production. Refuse the transition if that
    -- operational premise is false rather than silently stranding consumed credits.
    if exists(select 1 from public.billing_credit_consumptions) then
      raise exception using
        errcode='55000',
        message='Cannot raise the free Profile allowance while paid Profile credit consumptions exist.';
    end if;
    execute replace(credited_source,five_quota,twenty_five_quota);
    execute replace(
      replace(status_source,'''freeLimit'',5','''freeLimit'',25'),
      'greatest(5-owned,0)',
      'greatest(25-owned,0)'
    );
  else
    raise exception 'The billing allowance functions are mixed or unrecognized; review the 25-free migration.';
  end if;
end;
$$;

notify pgrst,'reload schema';
commit;
