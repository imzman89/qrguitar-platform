-- Apply the five-free owned-Profile allowance to future creation only.
-- Existing Profiles and the paid-credit ledger are not rewritten.
begin;

do $$
declare
  credited_source text;
  status_source text;
  old_quota text := '(select count(*) from public.guitars where owner_id=p_owner_id)>=25';
  new_quota text := '(select count(*) from public.guitars where owner_id=p_owner_id)>=5';
begin
  credited_source := pg_get_functiondef('public.create_instrument_profile_credited(uuid,text,text,jsonb,boolean,text,text)'::regprocedure);
  status_source := pg_get_functiondef('public.billing_account_status(uuid,text)'::regprocedure);

  if position(new_quota in credited_source) > 0
     and position(old_quota in credited_source) = 0
     and position('''freeLimit'',5' in status_source) > 0
     and position('greatest(5-owned,0)' in status_source) > 0
     and position('''freeLimit'',25' in status_source) = 0 then
    null; -- Exact retry after a completed transition.
  elsif (length(credited_source)-length(replace(credited_source,old_quota,'')))/length(old_quota) = 1
     and position(new_quota in credited_source) = 0
     and (length(status_source)-length(replace(status_source,'''freeLimit'',25','')))/length('''freeLimit'',25') = 1
     and (length(status_source)-length(replace(status_source,'greatest(25-owned,0)','')))/length('greatest(25-owned,0)') = 1
     and position('''freeLimit'',5' in status_source) = 0
     and position('greatest(5-owned,0)' in status_source) = 0 then
    execute replace(credited_source,old_quota,new_quota);
    execute replace(
      replace(status_source,'''freeLimit'',25','''freeLimit'',5'),
      'greatest(25-owned,0)',
      'greatest(5-owned,0)'
    );
  else
    raise exception 'The billing allowance functions are mixed or unrecognized; review the five-free migration.';
  end if;
end;
$$;

notify pgrst,'reload schema';
commit;