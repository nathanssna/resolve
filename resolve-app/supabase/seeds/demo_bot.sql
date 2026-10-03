-- =============================================================================
-- Robô de DEMONSTRAÇÃO: responde no chat pelos profissionais demo
-- (raw_app_meta_data.demo = true), até existir o modo profissional (etapa F).
--
-- Mesma lógica da antiga simulação do app (src/state/app.tsx):
--   pedido            → saudação + proposta com valor de exemplo
--   texto com valor   → nova proposta com esse valor ("faz por 120?"),
--                       no pedido em aberto mais recente da conversa
--   outro texto       → pede um valor (ou, já combinado, responde cordialmente)
--   aceite / recusa / conclusão / cancelamento → resposta curta
--
-- Só age em conversas com profissional demo e nunca impede a mensagem do
-- cliente de ser gravada (erros viram warning). Respostas chegam na hora.
-- Para remover: supabase/demo_cleanup.sql
-- =============================================================================

-- Valor de exemplo da primeira proposta, por serviço.
create or replace function private.demo_quote(p_service_id text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_service_id
    when 'informatica' then 150
    when 'encanador' then 120
    when 'eletricista' then 130
    when 'montagem-moveis' then 180
    when 'pintor' then 450
    when 'limpeza' then 220
    when 'ar-condicionado' then 350
    when 'chaveiro' then 90
    else 150
  end;
$$;

-- Valor em reais num texto, com as mesmas regras de parseAmount do app:
-- "faz por 120?" → 120 · "R$ 1.500,50" → 1500.50 · "pode vir às 14h?" → null
create or replace function private.demo_parse_amount(p_text text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := regexp_replace(lower(coalesce(p_text, '')), '(\d)\.(\d{3})(?!\d)', '\1\2', 'g');
  num constant text := '(\d{2,5})(?:,(\d{1,2}))?(?![\d:h])';
  m text[];
begin
  m := regexp_match(t, 'r\$\s*(\d{1,5})(?:,(\d{1,2}))?');
  if m is null then
    m := regexp_match(t, num || '\s*(?:reais|conto|pila)\y');
  end if;
  if m is null then
    m := regexp_match(t, '\y(?:por|faz|fecha|fechar|pago|valor|ofereço|ofereco|consigo)\s+(?:uns\s+|de\s+)?' || num);
  end if;
  if m is null then
    return null;
  end if;
  return round(m[1]::numeric + coalesce(rpad(m[2], 2, '0')::numeric / 100, 0), 2);
end;
$$;

create or replace function private.demo_bot_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
  v_request public.requests;
  v_name text;
  v_reply text;
  v_amount numeric;
  v_when text;
begin
  begin
    select * into v_conv from public.conversations where id = new.conversation_id;

    -- Só conversas com profissional demo, e só reage ao cliente ou ao sistema.
    if not exists (
      select 1 from auth.users u
      where u.id = v_conv.professional_id and u.raw_app_meta_data ->> 'demo' = 'true'
    ) then
      return null;
    end if;
    if new.sender_id is not null and new.sender_id <> v_conv.client_id then
      return null;
    end if;

    select split_part(p.full_name, ' ', 1) into v_name from public.profiles p where p.id = v_conv.professional_id;

    if new.kind = 'request' then
      select * into v_request from public.requests where id = new.request_id;
      v_reply := case
        when exists (select 1 from public.requests r where r.conversation_id = v_conv.id and r.id <> v_request.id)
          then 'Oi de novo! Vi seu novo pedido e consigo te ajudar.'
        else format('Oi! Aqui é %s. Vi seu pedido e consigo te ajudar.', coalesce(v_name, 'o profissional'))
      end;
      insert into public.messages (conversation_id, sender_id, kind, body)
      values (v_conv.id, v_conv.professional_id, 'text', v_reply);

      insert into public.proposals (conversation_id, request_id, professional_id, amount, scheduled_label, note)
      values (
        v_conv.id, v_request.id, v_conv.professional_id, private.demo_quote(v_request.service_id),
        case when new.request_when = 'O quanto antes' then 'Hoje, 16h' else coalesce(new.request_when, 'Amanhã, 14h') end,
        'Valor com a visita inclusa. Materiais à parte, se precisar.'
      );
      return null;
    end if;

    if new.kind = 'system' then
      v_reply := case
        when new.body like 'Serviço combinado%' then 'Perfeito, combinado! Te aviso por aqui quando estiver a caminho.'
        when new.body = 'Proposta recusada' then 'Sem problemas. Me diz um valor que fique bom pra você.'
        when new.body = 'Serviço concluído' then 'Obrigado! Se puder, deixe sua avaliação no app.'
        when new.body = 'Serviço cancelado pelo cliente' then 'Tudo bem, cancelado. Se precisar de novo, é só chamar.'
      end;
    elsif new.kind = 'text' then
      -- Valor no texto vale para o pedido em aberto mais recente.
      select r.* into v_request
      from public.requests r
      where r.conversation_id = v_conv.id
        and not exists (select 1 from public.orders o where o.request_id = r.id)
      order by r.created_at desc
      limit 1;

      if not found then
        v_reply := 'Combinado! Qualquer coisa é só chamar por aqui.';
      else
        v_amount := private.demo_parse_amount(new.body);
        if v_amount is not null and v_amount > 0 then
          insert into public.messages (conversation_id, sender_id, kind, body)
          values (v_conv.id, v_conv.professional_id, 'text', 'Consigo fazer por esse valor. Te mandei a proposta atualizada.');

          select p.scheduled_label into v_when
          from public.proposals p
          where p.request_id = v_request.id
          order by p.created_at desc
          limit 1;

          -- O trigger de proposals substitui a pendente anterior.
          insert into public.proposals (conversation_id, request_id, professional_id, amount, scheduled_label)
          values (v_conv.id, v_request.id, v_conv.professional_id, v_amount, coalesce(v_when, 'Amanhã, 14h'));
          return null;
        end if;
        v_reply := 'Entendi! Se quiser, me fala um valor e eu vejo se consigo.';
      end if;
    end if;

    if v_reply is not null then
      insert into public.messages (conversation_id, sender_id, kind, body)
      values (v_conv.id, v_conv.professional_id, 'text', v_reply);
    end if;
  exception when others then
    -- O robô nunca bloqueia a mensagem do cliente.
    raise warning 'demo_bot_reply: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.demo_quote(text) from public, anon, authenticated;
revoke all on function private.demo_parse_amount(text) from public, anon, authenticated;
revoke all on function private.demo_bot_reply() from public, anon, authenticated;

drop trigger if exists demo_bot_reply on public.messages;
create trigger demo_bot_reply
  after insert on public.messages
  for each row execute function private.demo_bot_reply();
