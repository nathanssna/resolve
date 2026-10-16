-- =============================================================================
-- Confirmar o serviço no dia, e lembrete agrupado.
--
--   * No dia do serviço, cliente e profissional podem confirmar (confirm_service_day).
--     O outro recebe no chat (e por push): "Ana confirmou: hoje à tarde."
--     Quem não confirma não sofre nada: é só um sinal para o outro.
--   * Se a data mudar (remarcação aceita), as confirmações voltam a zero.
--   * O lembrete das 7h passa a ser um por pessoa: com um serviço no dia, leva os
--     botões "Confirmar" e "Preciso remarcar" (categoryId 'lembrete'); com vários,
--     um resumo ("Hoje: 3 serviços") que abre a agenda.
-- =============================================================================

alter table public.orders
  add column client_confirmed_at timestamptz,
  add column pro_confirmed_at timestamptz;

comment on column public.orders.client_confirmed_at is 'Cliente confirmou o serviço no dia (zera se a data mudar).';
comment on column public.orders.pro_confirmed_at is 'Profissional confirmou o serviço no dia (zera se a data mudar).';

-- "de manhã" / "à tarde" / "à noite", pelo começo do período (horário de Brasília).
create function private.period_phrase(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(hour from p_at at time zone 'America/Sao_Paulo') < 12 then 'de manhã'
    when extract(hour from p_at at time zone 'America/Sao_Paulo') < 17 then 'à tarde'
    else 'à noite'
  end;
$$;

revoke all on function private.period_phrase(timestamptz) from public, anon, authenticated;

create function private.reset_day_confirmations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scheduled_at is distinct from old.scheduled_at then
    new.client_confirmed_at := null;
    new.pro_confirmed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.reset_day_confirmations() from public, anon, authenticated;

create trigger orders_reset_day_confirmations before update of scheduled_at on public.orders
  for each row execute function private.reset_day_confirmations();

create function public.confirm_service_day(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_is_client boolean;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_uid not in (v_order.client_id, v_order.professional_id) then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  if v_order.status <> 'combinado' or v_order.done_at is not null or v_order.disputed_at is not null then
    raise exception 'Este serviço não está mais combinado' using errcode = 'P0001';
  end if;
  if v_order.scheduled_at is null
    or (v_order.scheduled_at at time zone 'America/Sao_Paulo')::date <> (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Dá para confirmar só no dia do serviço' using errcode = 'P0001';
  end if;

  v_is_client := v_uid = v_order.client_id;
  if (v_is_client and v_order.client_confirmed_at is not null) or (not v_is_client and v_order.pro_confirmed_at is not null) then
    return v_order;
  end if;

  if v_is_client then
    update public.orders set client_confirmed_at = now() where id = p_order_id returning * into v_order;
  else
    update public.orders set pro_confirmed_at = now() where id = p_order_id returning * into v_order;
  end if;

  select split_part(btrim(p.full_name), ' ', 1) into v_name from public.profiles p where p.id = v_uid;
  insert into public.messages (conversation_id, request_id, sender_id, kind, body)
  values (v_order.conversation_id, v_order.request_id, null, 'system',
    coalesce(nullif(v_name, ''), case when v_is_client then 'O cliente' else 'O profissional' end)
      || ' confirmou: hoje ' || private.period_phrase(v_order.scheduled_at) || '.');

  return v_order;
end;
$$;

revoke execute on function public.confirm_service_day(uuid) from public, anon;
grant execute on function public.confirm_service_day(uuid) to authenticated;

-- Lembrete: um por pessoa.
create or replace function private.send_day_reminders()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ids uuid[];
  v_batch record;
  v_request bigint;
begin
  with due as (
    update public.orders o
    set reminded_at = now()
    where o.status = 'combinado'
      and o.reminded_at is null
      and o.scheduled_at is not null
      and (o.scheduled_at at time zone 'America/Sao_Paulo')::date = v_today
      and (o.created_at at time zone 'America/Sao_Paulo')::date < v_today
    returning o.id
  )
  select array_agg(id) into v_ids from due;
  if v_ids is null then
    return 0;
  end if;

  -- Até 100 notificações por envio (limite da Expo); `tokens` na mesma ordem, para a limpeza.
  for v_batch in
    with per_order as (
      -- Uma linha por pessoa e serviço, com o texto daquele serviço.
      select r.user_id, o.id as order_id, o.scheduled_at, s.title as service,
        case when r.is_client
          then 'Com ' || split_part(btrim(pp.full_name), ' ', 1) || ', ' || private.period_phrase(o.scheduled_at) || '.'
          else split_part(btrim(cp.full_name), ' ', 1) || ', ' || private.period_phrase(o.scheduled_at) || coalesce(' · ' || nullif(btrim(o.address ->> 'area'), ''), '') || '.'
        end as line,
        -- Para o resumo: "Ana de manhã" (cliente vê o profissional e vice-versa).
        split_part(btrim(case when r.is_client then pp.full_name else cp.full_name end), ' ', 1) || ' ' || private.period_phrase(o.scheduled_at) as who
      from public.orders o
      join public.services s on s.id = o.service_id
      join public.profiles cp on cp.id = o.client_id
      join public.profiles pp on pp.id = o.professional_id
      cross join lateral (values (o.client_id, true), (o.professional_id, false)) as r(user_id, is_client)
      left join public.notification_prefs np on np.user_id = r.user_id
      where o.id = any(v_ids)
        and coalesce(np.updates, true)
    ),
    per_user as (
      select p.user_id, count(*) as n,
        (array_agg(p.order_id order by p.scheduled_at, p.order_id))[1] as order_id,
        (array_agg(p.service order by p.scheduled_at, p.order_id))[1] as service,
        (array_agg(p.line order by p.scheduled_at, p.order_id))[1] as line,
        array_agg(p.who order by p.scheduled_at, p.order_id) as whos
      from per_order p
      group by p.user_id
    ),
    msgs as (
      select t.token,
        case when u.n = 1 then
          jsonb_build_object(
            'to', t.token,
            'title', 'Hoje: ' || u.service,
            'body', u.line,
            'sound', 'default',
            'channelId', 'mensagens',
            'categoryId', 'lembrete',
            'data', jsonb_build_object('url', '/pedido/' || u.order_id, 'orderId', u.order_id)
          )
        else
          jsonb_build_object(
            'to', t.token,
            'title', 'Hoje: ' || u.n || ' serviços',
            'body', case when u.n <= 3
              then array_to_string(u.whos[1:u.n - 1], ', ') || ' e ' || u.whos[u.n] || '.'
              else array_to_string(u.whos[1:2], ', ') || ' e mais ' || (u.n - 2) || '.'
            end,
            'sound', 'default',
            'channelId', 'mensagens',
            'data', jsonb_build_object('url', '/pedidos')
          )
        end as msg
      from per_user u
      join public.push_tokens t on t.user_id = u.user_id
    )
    select jsonb_agg(x.msg order by x.n) as payload, array_agg(x.token order by x.n) as tokens
    from (select row_number() over (order by m.token, m.msg::text) as n, m.token, m.msg from msgs m) x
    group by (x.n - 1) / 100
  loop
    v_request := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_batch.payload,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
    insert into private.push_sends (request_id, tokens) values (v_request, v_batch.tokens);
  end loop;

  return cardinality(v_ids);
end;
$$;
