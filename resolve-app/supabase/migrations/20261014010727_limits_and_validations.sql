-- =============================================================================
-- Validações e limites para o uso real.
--
-- Proposta: valor até R$ 50.000; dia e período que ainda não passaram e nos
--   próximos 90 dias. Pendente cuja data passou vence ('expired').
-- Pedido sem nenhuma resposta do profissional (nem proposta, nem mensagem)
--   fecha sozinho em 3 dias (24 h se for "O quanto antes").
-- Contra bots e spam: cliente com até 5 pedidos em aberto e 10 pedidos em
--   24 h; até 30 mensagens de texto por minuto por pessoa; e-mail descartável não cria
--   conta (o app consulta is_disposable_email antes de mandar o código).
-- =============================================================================

alter type public.proposal_status add value if not exists 'expired';

-- -----------------------------------------------------------------------------
-- Proposta
-- -----------------------------------------------------------------------------

create function private.check_proposal_values()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount > 50000 then
    raise exception 'O valor máximo de uma proposta é R$ 50.000,00' using errcode = 'P0001';
  end if;
  if new.scheduled_at is not null then
    -- O período dura umas 4 horas a partir do começo (scheduled_at).
    if new.scheduled_at + interval '4 hours' < now() then
      raise exception 'Escolha um dia e um período que ainda não passaram' using errcode = 'P0001';
    end if;
    if new.scheduled_at > now() + interval '90 days' then
      raise exception 'Escolha uma data nos próximos 90 dias' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.check_proposal_values() from public, anon, authenticated;

create trigger proposals_check_values before insert on public.proposals
  for each row execute function private.check_proposal_values();

-- -----------------------------------------------------------------------------
-- Limites contra spam
-- -----------------------------------------------------------------------------

create function private.check_request_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_open integer;
  v_day integer;
begin
  select c.client_id into v_client from public.conversations c where c.id = new.conversation_id;

  select
    count(*) filter (where r.closed_at is null and not exists (select 1 from public.orders o where o.request_id = r.id)),
    count(*) filter (where r.created_at > now() - interval '24 hours')
  into v_open, v_day
  from public.requests r
  join public.conversations c on c.id = r.conversation_id
  where c.client_id = v_client;

  if v_open >= 5 then
    raise exception 'Você tem 5 pedidos em aberto. Espere as respostas ou cancele algum antes de pedir outro.' using errcode = 'P0001';
  end if;
  if v_day >= 10 then
    raise exception 'Você já fez 10 pedidos hoje. Tente de novo amanhã.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.check_request_limits() from public, anon, authenticated;

create trigger requests_limits before insert on public.requests
  for each row execute function private.check_request_limits();

create function private.check_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Só texto do chat (pedidos têm limite próprio; propostas e avisos não são spam de chat).
  if new.kind = 'text' and new.sender_id is not null and (
    select count(*) from public.messages m
    where m.sender_id = new.sender_id and m.kind = 'text' and m.created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Muitas mensagens seguidas. Espere um pouco e tente de novo.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.check_message_rate() from public, anon, authenticated;

create trigger messages_rate before insert on public.messages
  for each row execute function private.check_message_rate();

-- A contagem por minuto usa remetente + data (o índice só de remetente fica redundante).
create index messages_sender_time_idx on public.messages (sender_id, created_at);
drop index public.messages_sender_idx;

-- -----------------------------------------------------------------------------
-- E-mail descartável
-- -----------------------------------------------------------------------------

create table private.disposable_domains (domain text primary key);

insert into private.disposable_domains (domain) values
  ('10minutemail.com'), ('10minutemail.net'), ('1secmail.com'), ('1secmail.net'), ('1secmail.org'),
  ('burnermail.io'), ('crazymailing.com'), ('discard.email'), ('dispostable.com'), ('emailfake.com'),
  ('emailondeck.com'), ('fakeinbox.com'), ('getnada.com'), ('grr.la'), ('guerrillamail.biz'),
  ('guerrillamail.com'), ('guerrillamail.de'), ('guerrillamail.info'), ('guerrillamail.net'), ('guerrillamail.org'),
  ('guerrillamailblock.com'), ('inboxkitten.com'), ('jetable.org'), ('mail.gw'), ('mail.tm'),
  ('mailcatch.com'), ('maildrop.cc'), ('mailinator.com'), ('mailinator.net'), ('mailnesia.com'),
  ('mintemail.com'), ('minuteinbox.com'), ('moakt.com'), ('mohmal.com'), ('mytemp.email'),
  ('nada.email'), ('pokemail.net'), ('sharklasers.com'), ('spam4.me'), ('spamgourmet.com'),
  ('tempail.com'), ('tempmail.com'), ('tempmail.net'), ('temp-mail.io'), ('temp-mail.org'),
  ('tempr.email'), ('throwawaymail.com'), ('tmpmail.net'), ('tmpmail.org'), ('trashmail.com'),
  ('trashmail.de'), ('yopmail.com'), ('yopmail.fr'), ('yopmail.net');

-- Domínio (ou um domínio acima dele: x.mailinator.com) está na lista?
create function public.is_disposable_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.disposable_domains d
    where lower(split_part(btrim(coalesce(p_email, '')), '@', 2)) = d.domain
       or lower(split_part(btrim(coalesce(p_email, '')), '@', 2)) like '%.' || d.domain
  );
$$;

revoke execute on function public.is_disposable_email(text) from public;
grant execute on function public.is_disposable_email(text) to anon, authenticated;

-- Garantia no banco: a conta nem é criada (e o código não é enviado).
create function private.block_disposable_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and public.is_disposable_email(new.email) then
    raise exception 'E-mail temporário não é aceito' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.block_disposable_email() from public, anon, authenticated;

create trigger before_auth_user_created_disposable
  before insert on auth.users
  for each row execute function private.block_disposable_email();

-- -----------------------------------------------------------------------------
-- Vencimentos (pg_cron, de hora em hora)
-- -----------------------------------------------------------------------------

create function private.expire_stale()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  -- Proposta pendente cuja data passou: vence; o profissional pode mandar outra.
  for v_row in
    update public.proposals p set status = 'expired', responded_at = now()
    where p.status = 'pending' and p.scheduled_at is not null and p.scheduled_at + interval '4 hours' < now()
    returning p.conversation_id, p.request_id
  loop
    insert into public.messages (conversation_id, sender_id, kind, request_id, body)
    values (v_row.conversation_id, null, 'system', v_row.request_id, 'Proposta vencida: a data passou sem resposta. O profissional pode enviar outra.');
    v_count := v_count + 1;
  end loop;

  -- Pedido sem nenhuma resposta do profissional: fecha (3 dias; "O quanto antes", 24 h).
  for v_row in
    update public.requests r set closed_at = now()
    from public.conversations c
    where c.id = r.conversation_id
      and r.closed_at is null
      and r.created_at < now() - case
        when exists (
          select 1 from public.messages m
          where m.request_id = r.id and m.kind = 'request' and m.request_when = 'O quanto antes'
        ) then interval '24 hours'
        else interval '3 days'
      end
      and not exists (select 1 from public.proposals p where p.request_id = r.id)
      and not exists (select 1 from public.orders o where o.request_id = r.id)
      and not exists (
        select 1 from public.messages m
        where m.conversation_id = r.conversation_id and m.sender_id = c.professional_id and m.created_at > r.created_at
      )
    returning r.id, r.conversation_id
  loop
    insert into public.messages (conversation_id, sender_id, kind, request_id, body)
    values (v_row.conversation_id, null, 'system', v_row.id, 'Pedido encerrado: o profissional não respondeu a tempo. Você pode pedir a outro profissional.');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.expire_stale() from public, anon, authenticated;

select cron.schedule('vencimentos', '15 * * * *', 'select private.expire_stale()');
