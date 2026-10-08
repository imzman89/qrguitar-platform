-- PROPOSAL ONLY; additive exact-source guard, no record backfill.
begin;
do $transfer_offer_migration$
declare
  v_body text;
  v_anchor text := $old_block$  return public.ownership_transfer_snapshot(t,g,false);$old_block$;
  v_replacement text := $first_acceptance$  -- First acceptance closes the prior owner's offer in the SAME transaction.
  -- Retain historical merchant mapping/specs/documents; only managed availability
  -- values change. The accepted replay branch above must never reach this block.
  update public.guitar_specs set value = 'not_for_sale'
    where guitar_id = g.id and lower(btrim(label)) in ('availability','sale status');
  return public.ownership_transfer_snapshot(t,g,false);$first_acceptance$;
begin
  select prosrc into v_body from pg_proc
    where oid = 'public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text)'::regprocedure;
  v_body := replace(v_body,E'\r\n',E'\n');
  if encode(sha256(convert_to(v_body,'UTF8')),'hex') is distinct from '95288614642a410c6e380ea5379d10157a54103680ce783298a33ba67a31e559'
      or (length(v_body)-length(replace(v_body,v_anchor,'')))/length(v_anchor) <> 1 then
    raise exception 'The reviewed transfer implementation changed. Review and regenerate this bounded integration; do not weaken the guard.';
  end if;
  v_body := replace(v_body,v_anchor,v_replacement);
  execute 'create or replace function public.complete_ownership_transfer(
    p_transfer_id uuid,p_new_owner_id uuid,p_buyer_code_hash text,
    p_order_reference_hash text,p_env_admin boolean,p_display_name text
  ) returns jsonb language plpgsql security definer set search_path=public,pg_temp as ' || quote_literal(v_body);
end;
$transfer_offer_migration$;
revoke all on function public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text) to service_role;
notify pgrst, 'reload schema';
commit;
