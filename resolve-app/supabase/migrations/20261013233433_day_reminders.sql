-- =============================================================================
-- Lembrete no dia do serviço: de manhã (Brasília), push para o cliente e o
-- profissional de cada serviço combinado para hoje ("Hoje: Encanador").
--
-- A data vem de orders.scheduled_at (a proposta agora tem dia e período).
-- Uma vez por serviço (reminded_at); serviço combinado no próprio dia não
-- recebe (está fresco). Respeita Perfil → Notificações (Pedidos e propostas).
-- O job roda de hora em hora das 7h às 11h: se uma rodada falhar, a próxima
-- tenta de novo.
-- =============================================================================

alter table public.orders add column reminded_at timestamptz;

comment on column public.orders.reminded_at is 'Quando o lembrete do dia do serviço foi enviado.';

-- Devolve quantos serviços foram lembrados.
create function private.send_day_reminders()
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
    select jsonb_agg(x.msg order by x.n) as payload, array_agg(x.token order by x.n) as tokens
    from (
      select row_number() over (order by m.token, m.msg::text) as n, m.token, m.msg
      from (
        select t.token, jsonb_build_object(
          'to', t.token,
          'title', 'Hoje: ' || s.title,
          'body', case when r.is_client
            then 'Com ' || split_part(btrim(pp.full_name), ' ', 1) || ', ' || w.at_period || '.'
            else split_part(btrim(cp.full_name), ' ', 1) || ', ' || w.at_period || coalesce(' · ' || nullif(btrim(o.address ->> 'area'), ''), '') || '.'
          end,
          'sound', 'default',
          'channelId', 'mensagens',
          'data', jsonb_build_object('url', '/pedido/' || o.id)
        ) as msg
        from public.orders o
        join public.services s on s.id = o.service_id
        join public.profiles cp on cp.id = o.client_id
        join public.profiles pp on pp.id = o.professional_id
        cross join lateral (
          select case
            when extract(hour from o.scheduled_at at time zone 'America/Sao_Paulo') < 12 then 'de manhã'
            when extract(hour from o.scheduled_at at time zone 'America/Sao_Paulo') < 17 then 'à tarde'
            else 'à noite'
          end as at_period
        ) w
        cross join lateral (values (o.client_id, true), (o.professional_id, false)) as r(user_id, is_client)
        join public.push_tokens t on t.user_id = r.user_id
        left join public.notification_prefs np on np.user_id = r.user_id
        where o.id = any(v_ids)
          and coalesce(np.updates, true)
      ) m
    ) x
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

revoke all on function private.send_day_reminders() from public, anon, authenticated;

-- 10h–14h UTC = 7h–11h em Brasília (sem horário de verão desde 2019).
select cron.schedule('lembrete-do-dia', '0 10-14 * * *', 'select private.send_day_reminders()');
