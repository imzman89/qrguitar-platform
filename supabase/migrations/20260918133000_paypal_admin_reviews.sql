-- Safe operator queue for automatic PayPal credit holds. The list projects only
-- allowlisted provider evidence; resolution delegates to the existing immutable,
-- idempotent billing_resolve_review contract and cannot create grants or payments.
begin;

create function public._billing_paypal_review_admin(p_operator_id uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.profiles where id=p_operator_id and role='admin' and account_status='active') then
    raise exception using errcode='42501',message='An active administrator must review PayPal holds.';
  end if;
end;$$;

create function public.billing_paypal_list_reviews(p_operator_id uuid,p_environment text,p_order_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_create_environment(p_environment);
  perform public._billing_paypal_review_admin(p_operator_id);
  return jsonb_build_object(
    'reviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId',q.event_id,
        'orderId',q.order_id,
        'ownerId',q.owner_id,
        'reference','QRG-'||q.order_id::text,
        'holdReason',q.hold_reason,
        'receiptKind',q.receipt_kind,
        'providerEventId',q.provider_event_id,
        'eventType',q.event_type,
        'eventCursor',q.event_cursor,
        'resourceKind',q.resource_kind,
        'resourceId',q.resource_id,
        'refundId',coalesce(q.refund_id,case when q.resource_kind='refund' then q.resource_id else null end),
        'disputeId',coalesce(q.dispute_id,case when q.resource_kind='dispute' then q.resource_id else null end),
        'caseId',q.case_id,
        'paypalOrderId',q.paypal_order_id,
        'captureId',q.capture_id,
        'providerStatus',q.provider_status,
        'amount',q.observed_amount,
        'currency',q.observed_currency,
        'expectedAmount',q.expected_amount,
        'expectedCurrency','USD',
        'credits',q.credits,
        'createdAt',q.created_at,
        'lastDecision',case when q.decision_action is null then null else jsonb_build_object(
          'action',q.decision_action,'reason',q.decision_reason,'createdAt',q.decision_created_at) end
      ) order by (q.decision_action is null) desc,coalesce(q.decision_created_at,q.created_at) desc,q.event_id)
      from (
        select h.event_id,h.owner_id,h.reason hold_reason,h.created_at,r.order_id,r.kind receipt_kind,
          coalesce(w.event_id,nullif(r.receipt#>>'{providerEvidence,paypalEventId}','')) provider_event_id,
          coalesce(w.event_type,nullif(r.receipt#>>'{providerEvidence,eventType}','')) event_type,
          coalesce(w.event_cursor,case when jsonb_typeof(r.receipt#>'{providerEvidence,cursor}')='number'
            and (r.receipt#>>'{providerEvidence,cursor}') ~ '^[0-9]{1,2}$' then (r.receipt#>>'{providerEvidence,cursor}')::integer else null end) event_cursor,
          coalesce(w.resource_kind,nullif(r.receipt#>>'{providerEvidence,resourceKind}','')) resource_kind,
          coalesce(w.resource_id,nullif(r.receipt#>>'{providerEvidence,resourceId}','')) resource_id,
          nullif(r.receipt#>>'{providerEvidence,refundId}','') refund_id,
          nullif(r.receipt#>>'{providerEvidence,disputeId}','') dispute_id,
          nullif(r.receipt#>>'{providerEvidence,caseId}','') case_id,
          coalesce(w.paypal_order_id,nullif(r.receipt#>>'{providerEvidence,paypalOrderId}',''),nullif(r.receipt->>'paypalOrderId',''),pb.paypal_order_id) paypal_order_id,
          coalesce(w.capture_id,nullif(r.receipt#>>'{providerEvidence,captureId}',''),nullif(r.receipt->>'captureId','')) capture_id,
          coalesce(w.provider_status,nullif(r.receipt#>>'{providerEvidence,providerStatus}',''),nullif(r.receipt->>'providerStatus',''),nullif(r.receipt->>'status','')) provider_status,
          coalesce(w.amount,case when jsonb_typeof(r.receipt#>'{providerEvidence,amount}')='number'
            and (r.receipt#>>'{providerEvidence,amount}') ~ '^[0-9]{1,9}$' then (r.receipt#>>'{providerEvidence,amount}')::integer else null end,
            case when jsonb_typeof(r.receipt->'amount')='number'
            and (r.receipt->>'amount') ~ '^[0-9]{1,9}$' then (r.receipt->>'amount')::integer else null end) observed_amount,
          coalesce(w.currency,case when r.receipt#>>'{providerEvidence,currency}'='USD' then 'USD' else null end,
            case when r.receipt->>'currency'='USD' then 'USD' else null end) observed_currency,
          (o.offer->>'amount')::integer expected_amount,(o.offer->>'credits')::integer credits,
          d.action decision_action,d.reason decision_reason,d.created_at decision_created_at
        from public.billing_credit_holds h
        join public.billing_receipts r on r.environment=h.environment and r.event_id=h.event_id and r.owner_id=h.owner_id
        join public.billing_orders o on o.id=r.order_id and o.owner_id=h.owner_id and o.environment=h.environment
        join public.billing_paypal_orders po on po.order_id=o.id and po.owner_id=o.owner_id and po.environment=o.environment
        left join public.billing_paypal_bindings pb on pb.order_id=o.id and pb.environment=o.environment
        left join lateral (
          select x.event_id,x.event_type,x.event_cursor,x.resource_kind,x.resource_id,x.paypal_order_id,x.capture_id,
            x.provider_status,x.amount,x.currency
          from public.billing_paypal_webhook_outcomes x
          where x.environment=h.environment and x.receipt_event_id=h.event_id
          order by x.created_at,x.event_id,x.event_cursor limit 1
        ) w on true
        left join lateral (
          select x.action,x.reason,x.created_at from public.billing_review_decisions x
          where x.environment=h.environment and x.event_id=h.event_id
          order by x.created_at desc,x.id desc limit 1
        ) d on true
        where h.environment=p_environment and (p_order_id is null or o.id=p_order_id)
          and not exists(select 1 from public.billing_review_decisions released
            where released.environment=h.environment and released.event_id=h.event_id and released.action='release')
        -- Fresh, unreviewed holds stay visible even when older retained holds
        -- remain active for a long-running provider case.
        order by (d.action is null) desc,coalesce(d.created_at,h.created_at) desc,h.event_id limit 100
      ) q
    ),'[]'::jsonb),
    'hasMore',p_order_id is null and (
      select count(*)>100
      from public.billing_credit_holds h
      join public.billing_receipts r on r.environment=h.environment and r.event_id=h.event_id and r.owner_id=h.owner_id
      join public.billing_paypal_orders po on po.order_id=r.order_id and po.owner_id=h.owner_id and po.environment=h.environment
      where h.environment=p_environment and not exists(select 1 from public.billing_review_decisions released
        where released.environment=h.environment and released.event_id=h.event_id and released.action='release')
    )
  );
end;$$;

create function public.billing_paypal_resolve_review(p_operator_id uuid,p_environment text,p_event_id text,p_order_id uuid,
  p_owner_id uuid,p_decision_id uuid,p_action text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare resolved jsonb;begin
  perform public._billing_create_environment(p_environment);
  perform public._billing_paypal_review_admin(p_operator_id);
  -- Validate the complete server-listed relation. The underlying resolver also
  -- locks the owner and checks the append-only hold and decision identities.
  if not exists(
    select 1 from public.billing_credit_holds h
    join public.billing_receipts r on r.environment=h.environment and r.event_id=h.event_id and r.owner_id=h.owner_id
    join public.billing_paypal_orders po on po.order_id=r.order_id and po.owner_id=h.owner_id and po.environment=h.environment
    where h.environment=p_environment and h.event_id=p_event_id and h.owner_id=p_owner_id and r.order_id=p_order_id
  ) then raise exception using errcode='P0002',message='PayPal billing review receipt was not found.';end if;
  resolved:=public.billing_resolve_review(p_owner_id,p_environment,p_event_id,p_operator_id,p_decision_id,p_action,p_reason);
  return jsonb_build_object('eventId',p_event_id,'orderId',p_order_id,'ownerId',p_owner_id,
    'decisionId',p_decision_id,'action',p_action,'hold',resolved->'hold');
end;$$;

revoke all on function public._billing_paypal_review_admin(uuid) from public,anon,authenticated,service_role;
revoke all on function public.billing_paypal_list_reviews(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.billing_paypal_resolve_review(uuid,text,text,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_paypal_list_reviews(uuid,text,uuid) to service_role;
grant execute on function public.billing_paypal_resolve_review(uuid,text,text,uuid,uuid,uuid,text,text) to service_role;

commit;
