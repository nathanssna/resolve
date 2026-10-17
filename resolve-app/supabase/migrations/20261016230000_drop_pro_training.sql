-- =============================================================================
-- Desfaz 20261016220000_pro_training: o treino do profissional foi descartado pelo
-- usuário (o cadastro do profissional segue direto para a ficha). Tira as colunas,
-- a função e volta o painel de moderação como era.
-- =============================================================================

drop function public.record_training(text);

alter table public.profiles
  drop column training_status,
  drop column training_at;

create or replace function public.admin_overview(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := case
    when coalesce(p_days, 7) <= 1 then date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    else now() - make_interval(days => p_days)
  end;
begin
  perform private.require_admin();
  return jsonb_build_object(
    'since', v_since,
    'clients_new', (select count(*) from public.profiles p where p.role = 'cliente' and p.deleted_at is null and p.created_at >= v_since),
    'pros_new', (select count(*) from public.profiles p where p.role = 'profissional' and p.deleted_at is null and p.created_at >= v_since),
    'clients_total', (select count(*) from public.profiles p where p.role = 'cliente' and p.deleted_at is null),
    'pros_total', (select count(*) from public.profiles p where p.role = 'profissional' and p.deleted_at is null),
    'requests', (select count(*) from public.requests r where r.created_at >= v_since),
    'requests_converted', (
      select count(*) from public.requests r
      where r.created_at >= v_since and exists (select 1 from public.orders o where o.request_id = r.id)
    ),
    'orders_combined', (select count(*) from public.orders o where o.created_at >= v_since),
    'orders_done', (select count(*) from public.orders o where o.status = 'concluido' and o.completed_at >= v_since),
    'volume_done', (select coalesce(sum(o.amount), 0) from public.orders o where o.status = 'concluido' and o.completed_at >= v_since),
    'orders_canceled', (select count(*) from public.orders o where o.status = 'cancelado' and o.canceled_at >= v_since),
    'orders_canceled_late', (select count(*) from public.orders o where o.status = 'cancelado' and o.canceled_late and o.canceled_at >= v_since),
    'reviews', (select count(*) from public.reviews rv where rv.created_at >= v_since),
    'rating', (select round(avg(rv.rating), 1) from public.reviews rv where rv.created_at >= v_since),
    'verifications_pending', (select count(*) from public.verifications v where v.status = 'pending'),
    'reports_open', (select count(*) from public.reports r where r.resolved_at is null),
    'suspended', (select count(*) from public.profiles p where p.suspended_until > now())
  );
end;
$$;
