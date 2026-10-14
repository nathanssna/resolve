-- =============================================================================
-- Cancelamento em cima da hora.
--
-- Até 12 horas antes do começo do período combinado, cancelar não tem
-- consequência. Depois disso ainda dá para cancelar, mas com motivo (vai para
-- o chat) e o cancelamento fica marcado como "em cima da hora":
--   profissional: 3 em 30 dias → pausado automaticamente por 7 dias, sem poder
--     despausar antes; o perfil público mostra a taxa quando ela é alta;
--   cliente: o profissional com quem ele conversa vê o histórico dele.
-- Depois do dia do serviço, cancelar não conta (o serviço já passou: quem
-- faltou é outra história). Serviço sem data (propostas antigas) nunca conta.
-- =============================================================================

alter table public.orders
  add column canceled_late boolean not null default false,
  add column cancel_reason text check (char_length(cancel_reason) <= 300);

comment on column public.orders.canceled_late is 'Cancelado entre 12 h antes do começo do período combinado e o fim do dia do serviço.';

-- Sem grant de leitura: só o próprio profissional vê, por my_pause_until().
alter table public.professionals add column paused_until timestamptz;

comment on column public.professionals.paused_until is 'Pausa automática por cancelamentos em cima da hora: até quando (o profissional não despausa antes).';

-- -----------------------------------------------------------------------------
-- Cancelar
-- -----------------------------------------------------------------------------

drop function public.cancel_order(uuid);

create function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300);
  v_late boolean;
  v_by text;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_uid not in (v_order.client_id, v_order.professional_id) then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  if v_order.status <> 'combinado' then
    raise exception 'Este serviço não está mais em andamento' using errcode = 'P0001';
  end if;

  v_late := v_order.scheduled_at is not null
    and now() > v_order.scheduled_at - interval '12 hours'
    and (now() at time zone 'America/Sao_Paulo')::date <= (v_order.scheduled_at at time zone 'America/Sao_Paulo')::date;
  if v_late and v_reason is null then
    raise exception 'Conte o motivo do cancelamento' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'cancelado', canceled_at = now(), canceled_by = v_uid, canceled_late = v_late, cancel_reason = v_reason
  where id = p_order_id
  returning * into v_order;

  v_by := case when v_uid = v_order.client_id then 'pelo cliente' else 'pelo profissional' end;
  insert into public.messages (conversation_id, sender_id, kind, request_id, body)
  values (
    v_order.conversation_id, null, 'system', v_order.request_id,
    case
      when v_late then format('Serviço cancelado em cima da hora %s: %s', v_by, v_reason)
      when v_reason is not null then format('Serviço cancelado %s: %s', v_by, v_reason)
      else 'Serviço cancelado ' || v_by
    end
  );

  -- Profissional: 3 em cima da hora em 30 dias → pausa de 7 dias.
  if v_late and v_uid = v_order.professional_id and (
    select count(*) from public.orders o
    where o.professional_id = v_uid and o.canceled_by = v_uid and o.canceled_late
      and o.canceled_at > now() - interval '30 days'
  ) >= 3 then
    update public.professionals
    set paused = true, paused_until = greatest(coalesce(paused_until, now()), now() + interval '7 days')
    where id = v_uid;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Pausa automática
-- -----------------------------------------------------------------------------

-- Durante a pausa automática, o próprio profissional não volta a receber.
create function private.keep_suspension()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.paused_until > now() and not new.paused and (select auth.uid()) = new.id then
    raise exception 'Sua conta está pausada até % por cancelamentos em cima da hora',
      to_char(old.paused_until at time zone 'America/Sao_Paulo', 'DD/MM') using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.keep_suspension() from public, anon, authenticated;

create trigger professionals_keep_suspension before update of paused on public.professionals
  for each row execute function private.keep_suspension();

-- Fim da pausa automática (pg_cron, de hora em hora).
create function private.end_suspensions()
returns integer
language sql
set search_path = ''
as $$
  with done as (
    update public.professionals set paused = false, paused_until = null
    where paused_until <= now()
    returning 1
  )
  select count(*)::integer from done;
$$;

revoke all on function private.end_suspensions() from public, anon, authenticated;

select cron.schedule('fim-da-pausa', '0 * * * *', 'select private.end_suspensions()');

-- Até quando o profissional logado está pausado automaticamente (null = não está).
create function public.my_pause_until()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select p.paused_until from public.professionals p
  where p.id = (select auth.uid()) and p.paused_until > now();
$$;

revoke execute on function public.my_pause_until() from public, anon;
grant execute on function public.my_pause_until() to authenticated;

-- -----------------------------------------------------------------------------
-- Históricos
-- -----------------------------------------------------------------------------

-- Cliente, para o profissional com quem ele conversa: serviços concluídos e
-- cancelados em cima da hora pelo cliente (com qualquer profissional).
create function public.client_track_record(p_client_id uuid)
returns table (done integer, late_cancels integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.done, r.late_cancels
  from (
    select
      (count(*) filter (where o.status = 'concluido'))::integer as done,
      (count(*) filter (where o.canceled_late and o.canceled_by = o.client_id))::integer as late_cancels
    from public.orders o
    where o.client_id = p_client_id
  ) r
  where exists (
    select 1 from public.conversations c
    where c.client_id = p_client_id and c.professional_id = (select auth.uid())
  );
$$;

revoke execute on function public.client_track_record(uuid) from public, anon;
grant execute on function public.client_track_record(uuid) to authenticated;

-- Profissional, no perfil público: serviços combinados nos últimos 90 dias e
-- quantos ele cancelou em cima da hora (o app mostra só quando a taxa é alta).
create function public.professional_reliability(p_professional_id uuid)
returns table (orders_90d integer, late_cancels_90d integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::integer,
    (count(*) filter (where o.canceled_late and o.canceled_by = o.professional_id))::integer
  from public.orders o
  where o.professional_id = p_professional_id and o.created_at > now() - interval '90 days';
$$;

revoke execute on function public.professional_reliability(uuid) from public;
grant execute on function public.professional_reliability(uuid) to anon, authenticated;
