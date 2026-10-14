-- =============================================================================
-- Preferências de notificação e limpeza dos tokens de push que não valem mais.
--
-- Preferências: notification_prefs, uma linha por usuário (sem linha = tudo
--   ligado). `messages` = mensagens de texto do chat; `updates` = pedidos,
--   propostas e avisos do serviço (aceite, conclusão, cancelamento).
--
-- Limpeza: para cada envio, a API da Expo devolve um "ticket" por notificação;
--   uns 15 minutos depois, o "recibo" diz se a Apple/Google entregou. Quando um
--   dos dois responde DeviceNotRegistered (app desinstalado, token trocado), o
--   token sai de push_tokens. Um job do pg_cron faz isso a cada 10 minutos,
--   lendo as respostas que o pg_net guarda em net._http_response (por 6 h).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Preferências
-- -----------------------------------------------------------------------------

create table public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  messages boolean not null default true,
  updates boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.notification_prefs is 'O que o usuário quer receber por push. Sem linha = tudo ligado.';

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon;

create policy "notification_prefs: só o dono" on public.notification_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger notification_prefs_updated_at before update on public.notification_prefs
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Envios e tickets pendentes de conferência
-- -----------------------------------------------------------------------------

-- Envio à Expo esperando a resposta (os tickets vêm na mesma ordem de `tokens`).
create table private.push_sends (
  request_id bigint primary key,
  tokens text[] not null,
  created_at timestamptz not null default now()
);

-- Ticket aceito pela Expo esperando o recibo.
create table private.push_tickets (
  ticket_id text primary key,
  token text not null,
  created_at timestamptz not null default now(),
  -- Pedido de recibos já feito (null = ainda não pedido).
  receipt_request_id bigint
);

create index push_tickets_receipt_idx on private.push_tickets (receipt_request_id);
create index push_tickets_waiting_idx on private.push_tickets (created_at) where receipt_request_id is null;

-- JSON de uma resposta HTTP, ou null se não for JSON (ex.: página de erro).
create function private.try_jsonb(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::jsonb;
exception when others then
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Push: respeita as preferências e guarda o envio para conferir depois
-- -----------------------------------------------------------------------------

create or replace function private.push_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
  v_recipients uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
  v_tokens text[];
  v_request bigint;
begin
  begin
    select * into v_conv from public.conversations where id = new.conversation_id;

    if new.sender_id is not null then
      -- Mensagem de alguém: avisa o outro participante.
      v_recipients := array_remove(array[v_conv.client_id, v_conv.professional_id], new.sender_id);
      select nullif(btrim(p.full_name), '') into v_title from public.profiles p where p.id = new.sender_id;
    else
      -- Mensagem de sistema (aceite, conclusão…): avisa quem não fez a ação.
      v_recipients := array_remove(array[v_conv.client_id, v_conv.professional_id], auth.uid());
    end if;

    -- Quem desligou esse tipo de aviso em Perfil → Notificações não recebe.
    select array_agg(r.id) into v_recipients
    from unnest(v_recipients) as r(id)
    left join public.notification_prefs np on np.user_id = r.id
    where case when new.kind = 'text' then coalesce(np.messages, true) else coalesce(np.updates, true) end;

    v_body := case new.kind
      when 'text' then left(new.body, 180)
      when 'request' then 'Novo pedido de orçamento: ' || left(new.body, 140)
      when 'proposal' then (
        select 'Proposta: ' || private.format_brl(p.amount) || ' · ' || p.scheduled_label
        from public.proposals p where p.id = new.proposal_id
      )
      when 'system' then new.body
    end;

    select
      jsonb_agg(jsonb_build_object(
        'to', t.token,
        'title', coalesce(v_title, 'Resolve'),
        'body', coalesce(v_body, 'Nova mensagem'),
        'sound', 'default',
        'channelId', 'mensagens',
        'data', jsonb_build_object('url', '/chat/' || v_conv.id, 'conversationId', v_conv.id)
      ) order by t.token),
      array_agg(t.token order by t.token)
    into v_payload, v_tokens
    from public.push_tokens t
    where t.user_id = any(v_recipients);

    if v_payload is not null then
      v_request := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_payload,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
      );
      insert into private.push_sends (request_id, tokens) values (v_request, v_tokens);
    end if;
  exception when others then
    raise warning 'push_on_message: %', sqlerrm;
  end;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Limpeza (pg_cron, a cada 10 minutos)
-- -----------------------------------------------------------------------------

create function private.clean_push_tokens()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_send record;
  v_resp record;
  v_data jsonb;
  v_ids text[];
  v_request bigint;
begin
  -- 1. Tickets dos envios que já têm resposta. Token re-registrado depois do
  --    envio (updated_at mais novo) fica: o aparelho voltou a valer.
  for v_send in
    delete from private.push_sends s
    using net._http_response r
    where r.id = s.request_id
    returning s.tokens, s.created_at, r.content
  loop
    v_data := private.try_jsonb(v_send.content) -> 'data';
    continue when jsonb_typeof(v_data) is distinct from 'array';

    delete from public.push_tokens pt
    using jsonb_array_elements(v_data) with ordinality as t(ticket, n)
    where pt.token = v_send.tokens[t.n]
      and pt.updated_at <= v_send.created_at
      and t.ticket ->> 'status' = 'error'
      and t.ticket #>> '{details,error}' = 'DeviceNotRegistered';

    insert into private.push_tickets (ticket_id, token, created_at)
    select t.ticket ->> 'id', v_send.tokens[t.n], v_send.created_at
    from jsonb_array_elements(v_data) with ordinality as t(ticket, n)
    where t.ticket ->> 'status' = 'ok' and t.ticket ->> 'id' is not null and v_send.tokens[t.n] is not null
    on conflict (ticket_id) do nothing;
  end loop;

  -- 2. Recibos que chegaram.
  for v_resp in
    select r.id, r.content
    from net._http_response r
    where r.id in (select distinct receipt_request_id from private.push_tickets where receipt_request_id is not null)
  loop
    v_data := private.try_jsonb(v_resp.content) -> 'data';

    if jsonb_typeof(v_data) = 'object' then
      delete from public.push_tokens pt
      using private.push_tickets t
      where t.receipt_request_id = v_resp.id
        and pt.token = t.token
        and pt.updated_at <= t.created_at
        and v_data -> t.ticket_id ->> 'status' = 'error'
        and v_data -> t.ticket_id #>> '{details,error}' = 'DeviceNotRegistered';
      delete from private.push_tickets where receipt_request_id = v_resp.id;
    else
      -- Pedido de recibos falhou: tenta de novo na próxima rodada.
      update private.push_tickets set receipt_request_id = null where receipt_request_id = v_resp.id;
    end if;
  end loop;

  -- 3. A Expo guarda os recibos por 24 h, e o pg_net as respostas por 6 h:
  --    o que passou disso não tem mais como ser conferido.
  delete from private.push_tickets where created_at < now() - interval '20 hours';
  delete from private.push_sends where created_at < now() - interval '6 hours';
  delete from private.push_tickets t
  where t.receipt_request_id is not null
    and not exists (select 1 from net._http_response r where r.id = t.receipt_request_id)
    and t.created_at < now() - interval '6 hours';

  -- 4. Pede os recibos dos tickets com mais de 15 minutos (até 1000 por pedido).
  loop
    select array_agg(ticket_id) into v_ids
    from (
      select ticket_id from private.push_tickets
      where receipt_request_id is null and created_at < now() - interval '15 minutes'
      order by created_at
      limit 1000
    ) x;
    exit when v_ids is null;

    v_request := net.http_post(
      url := 'https://exp.host/--/api/v2/push/getReceipts',
      body := jsonb_build_object('ids', to_jsonb(v_ids)),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
    update private.push_tickets set receipt_request_id = v_request where ticket_id = any(v_ids);
  end loop;
end;
$$;

revoke all on function private.try_jsonb(text) from public, anon, authenticated;
revoke all on function private.clean_push_tokens() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('limpar-tokens-push', '*/10 * * * *', 'select private.clean_push_tokens()');
