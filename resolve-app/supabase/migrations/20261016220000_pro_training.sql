-- =============================================================================
-- Treino do primeiro pedido (boas-vindas do profissional): concluiu ou pulou.
--
-- Só a primeira vez conta (refazer pela Ajuda não grava). O painel de moderação
-- mostra, entre os profissionais novos do período, quantos concluíram e quantos pularam,
-- para saber se o treino está funcionando.
-- =============================================================================

alter table public.profiles
  add column training_status text check (training_status in ('concluido', 'pulado')),
  add column training_at timestamptz;

comment on column public.profiles.training_status is 'Treino do primeiro pedido, na primeira vez: concluido ou pulado (null = não passou por ele).';

create function public.record_training(p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  if p_status is null or p_status not in ('concluido', 'pulado') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  update public.profiles
  set training_status = p_status, training_at = now()
  where id = auth.uid() and role = 'profissional' and training_status is null;
end;
$$;

revoke execute on function public.record_training(text) from public, anon;
grant execute on function public.record_training(text) to authenticated;

-- Painel: + quantos profissionais novos concluíram ou pularam o treino.
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
    'pros_trained', (select count(*) from public.profiles p where p.role = 'profissional' and p.deleted_at is null and p.created_at >= v_since and p.training_status = 'concluido'),
    'pros_skipped', (select count(*) from public.profiles p where p.role = 'profissional' and p.deleted_at is null and p.created_at >= v_since and p.training_status = 'pulado'),
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
