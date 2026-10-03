-- =============================================================================
-- Uma conversa por cliente e profissional, com vários pedidos dentro.
--
-- Antes: cada pedido abria uma conversa nova (conversa = pedido).
-- Agora:
--   * conversations: uma por par cliente ↔ profissional (sem service_id);
--   * requests: cada pedido de orçamento (serviço) dentro da conversa;
--   * proposals, orders, request_addresses e as mensagens do pedido apontam
--     para o pedido (request_id); cada pedido tem no máximo um serviço combinado;
--   * o pedido nasce pelas RPCs open_conversation + create_request.
--
-- Dados existentes: cada conversa antiga vira um pedido com o MESMO id, e
-- conversas do mesmo par são juntadas na mais antiga. As fotos antigas seguem
-- na pasta da conversa antiga; quem lê a mensagem continua vendo as fotos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  service_id text not null references public.services (id),
  created_at timestamptz not null default now()
);

create index requests_conversation_idx on public.requests (conversation_id, created_at);
create index requests_service_idx on public.requests (service_id);

-- Cada conversa antiga era um pedido: mesmo id, para as referências baterem.
insert into public.requests (id, conversation_id, service_id, created_at)
select c.id, c.id, c.service_id, c.created_at
from public.conversations c;

alter table public.messages add column request_id uuid references public.requests (id) on delete cascade;
alter table public.proposals add column request_id uuid references public.requests (id) on delete cascade;
alter table public.orders add column request_id uuid references public.requests (id) on delete cascade;

update public.messages set request_id = conversation_id where kind <> 'text';
update public.proposals set request_id = conversation_id;
update public.orders set request_id = conversation_id;

alter table public.proposals alter column request_id set not null;
alter table public.orders alter column request_id set not null;
alter table public.orders add constraint orders_request_id_key unique (request_id);
alter table public.orders drop constraint orders_conversation_id_key;

-- Pedido e proposta sempre sabem a que pedido pertencem; um pedido por mensagem de pedido.
alter table public.messages
  add constraint messages_request_id_required check (kind not in ('request', 'proposal') or request_id is not null);
create unique index messages_one_request_idx on public.messages (request_id) where kind = 'request';
create index messages_request_idx on public.messages (request_id);

create index proposals_request_idx on public.proposals (request_id, created_at);
drop index public.proposals_one_pending_idx;
create unique index proposals_one_pending_idx on public.proposals (request_id) where status = 'pending';
create index orders_conversation_idx on public.orders (conversation_id);

-- Endereço completo: por pedido.
drop policy "request_addresses: cliente da conversa grava" on public.request_addresses;
drop policy "request_addresses: cliente da conversa lê" on public.request_addresses;
alter table public.request_addresses add column request_id uuid references public.requests (id) on delete cascade;
update public.request_addresses set request_id = conversation_id;
alter table public.request_addresses drop constraint request_addresses_pkey;
alter table public.request_addresses drop column conversation_id;
alter table public.request_addresses alter column request_id set not null;
alter table public.request_addresses add primary key (request_id);

-- -----------------------------------------------------------------------------
-- Junta as conversas do mesmo par na mais antiga
-- -----------------------------------------------------------------------------

create temporary table _merge as
select c.id as old_id,
       first_value(c.id) over (partition by c.client_id, c.professional_id order by c.created_at, c.id) as keep_id
from public.conversations c;
delete from _merge where old_id = keep_id;

update public.requests r set conversation_id = m.keep_id from _merge m where r.conversation_id = m.old_id;
update public.messages x set conversation_id = m.keep_id from _merge m where x.conversation_id = m.old_id;
update public.proposals x set conversation_id = m.keep_id from _merge m where x.conversation_id = m.old_id;
update public.orders x set conversation_id = m.keep_id from _merge m where x.conversation_id = m.old_id;

-- Leitura: o mais antigo dos "lido até" (nada lido some como lido).
update public.conversations k
set last_message_at = s.last_message_at,
    client_last_read_at = s.client_last_read_at,
    professional_last_read_at = s.professional_last_read_at
from (
  select g.keep_id,
         max(c.last_message_at) as last_message_at,
         min(c.client_last_read_at) as client_last_read_at,
         min(c.professional_last_read_at) as professional_last_read_at
  from (select keep_id, old_id as id from _merge union select keep_id, keep_id from _merge) g
  join public.conversations c on c.id = g.id
  group by g.keep_id
) s
where k.id = s.keep_id;

delete from public.conversations c using _merge m where c.id = m.old_id;
drop table _merge;

-- -----------------------------------------------------------------------------
-- Conversas: uma por par, abertas só pela RPC
-- -----------------------------------------------------------------------------

drop policy "conversations: cliente abre" on public.conversations;
alter table public.conversations drop column service_id;
alter table public.conversations add constraint conversations_pair_key unique (client_id, professional_id);
revoke insert on public.conversations from anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS e privilégios
-- -----------------------------------------------------------------------------

alter table public.requests enable row level security;
revoke insert, update, delete on public.requests from anon, authenticated;
revoke insert, update, delete on public.request_addresses from anon, authenticated;

create policy "requests: participantes leem" on public.requests
  for select to authenticated
  using (private.is_conversation_participant(conversation_id));

-- O profissional não lê esta tabela: recebe o endereço no pedido, depois do aceite.
create policy "request_addresses: cliente do pedido lê" on public.request_addresses
  for select to authenticated
  using (
    exists (
      select 1
      from public.requests r
      join public.conversations c on c.id = r.conversation_id
      where r.id = request_addresses.request_id and c.client_id = (select auth.uid())
    )
  );

-- Usuários escrevem só texto; pedido, proposta e sistema nascem das RPCs e triggers.
drop policy "messages: participantes escrevem" on public.messages;
create policy "messages: participantes escrevem" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_participant(conversation_id)
    and kind = 'text'
    and request_id is null
    and cardinality(photos) = 0
  );

-- Fotos: quem lê a mensagem do pedido vê as fotos dela (inclui as de conversas juntadas).
create index messages_photos_idx on public.messages using gin (photos) where cardinality(photos) > 0;

create policy "request-photos: quem lê o pedido vê" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'request-photos'
    and exists (
      select 1 from public.messages m
      where m.kind = 'request'
        and m.photos @> array[objects.name]
        and private.is_conversation_participant(m.conversation_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Triggers de proposta
-- -----------------------------------------------------------------------------

-- Valida o pedido e substitui a pendente anterior dele. Sem request_id (app
-- antigo), vale o pedido em aberto mais recente da conversa.
create or replace function private.before_proposal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
begin
  new.status := 'pending';
  new.responded_at := null;
  new.created_at := now();

  if new.request_id is null then
    select r.id into new.request_id
    from public.requests r
    where r.conversation_id = new.conversation_id
      and not exists (select 1 from public.orders o where o.request_id = r.id)
    order by r.created_at desc
    limit 1;
  end if;

  select * into v_request from public.requests where id = new.request_id for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  new.conversation_id := v_request.conversation_id;
  select c.professional_id into new.professional_id
  from public.conversations c
  where c.id = v_request.conversation_id;

  if exists (select 1 from public.orders o where o.request_id = new.request_id) then
    raise exception 'Este pedido já tem um serviço combinado' using errcode = 'P0001';
  end if;

  update public.proposals
  set status = 'superseded', responded_at = now()
  where request_id = new.request_id
    and status = 'pending';

  return new;
end;
$$;

create or replace function private.after_proposal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.messages (conversation_id, sender_id, kind, proposal_id, request_id, created_at)
  values (new.conversation_id, new.professional_id, 'proposal', new.id, new.request_id, new.created_at);
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Conversa do cliente logado com o profissional (cria se ainda não existe).
create function public.open_conversation(p_professional_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.conversations;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  if p_professional_id = v_uid then
    raise exception 'Você não pode pedir orçamento a si mesmo' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.professionals p where p.id = p_professional_id) then
    raise exception 'Profissional não encontrado' using errcode = 'P0002';
  end if;

  insert into public.conversations (client_id, professional_id)
  values (v_uid, p_professional_id)
  on conflict (client_id, professional_id) do nothing;

  select * into v_conversation
  from public.conversations
  where client_id = v_uid and professional_id = p_professional_id;

  return v_conversation;
end;
$$;

-- Novo pedido de orçamento na conversa. As fotos já devem estar no Storage,
-- na pasta da conversa. O endereço completo fica privado até o aceite.
create function public.create_request(
  p_conversation_id uuid,
  p_service_id text,
  p_description text,
  p_when text,
  p_address jsonb default null,
  p_photos text[] default '{}'
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.conversations;
  v_request_id uuid;
  v_message public.messages;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found or v_conversation.client_id <> v_uid then
    raise exception 'Conversa não encontrada' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.professional_services ps
    where ps.professional_id = v_conversation.professional_id and ps.service_id = p_service_id
  ) then
    raise exception 'Este profissional não atende esse serviço' using errcode = 'P0001';
  end if;

  if coalesce(char_length(btrim(p_description)), 0) = 0 or coalesce(char_length(btrim(p_when)), 0) = 0 then
    raise exception 'Conte o que precisa e quando' using errcode = '22023';
  end if;

  if p_address is not null and (jsonb_typeof(p_address) <> 'object' or pg_column_size(p_address) > 4000) then
    raise exception 'Endereço inválido' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_photos, '{}')) as p(path)
    where p.path not like p_conversation_id::text || '/%'
  ) then
    raise exception 'Foto fora da pasta da conversa' using errcode = '22023';
  end if;

  insert into public.requests (conversation_id, service_id)
  values (p_conversation_id, p_service_id)
  returning id into v_request_id;

  if p_address is not null then
    insert into public.request_addresses (request_id, address) values (v_request_id, p_address);
  end if;

  -- O trigger da mensagem guarda só a parte pública do endereço.
  insert into public.messages (conversation_id, sender_id, kind, request_id, body, request_when, request_address, photos)
  values (
    p_conversation_id, v_uid, 'request', v_request_id, btrim(p_description), btrim(p_when),
    p_address, coalesce(p_photos, '{}')
  )
  returning * into v_message;

  return v_message;
end;
$$;

-- Cliente aceita a proposta → cria o pedido do serviço e a mensagem de sistema.
create or replace function public.accept_proposal(p_proposal_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.proposals;
  v_request public.requests;
  v_conversation public.conversations;
  v_address jsonb;
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id;
  if not found then
    raise exception 'Proposta não encontrada' using errcode = 'P0002';
  end if;

  -- Trava o pedido: dois aceites ao mesmo tempo viram um só serviço.
  select * into v_request from public.requests where id = v_proposal.request_id for update;
  select * into v_conversation from public.conversations where id = v_request.conversation_id;

  if v_conversation.client_id <> v_uid then
    raise exception 'Só o cliente pode aceitar a proposta' using errcode = '42501';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id;
  if v_proposal.status <> 'pending' then
    raise exception 'Esta proposta não está mais disponível' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.orders where request_id = v_request.id) then
    raise exception 'Este pedido já tem um serviço combinado' using errcode = 'P0001';
  end if;

  update public.proposals
  set status = 'accepted', responded_at = now()
  where id = p_proposal_id;

  -- Endereço completo (privado do cliente até aqui); pedidos antigos usam o da mensagem.
  select ra.address into v_address from public.request_addresses ra where ra.request_id = v_request.id;
  if v_address is null then
    select m.request_address into v_address
    from public.messages m
    where m.request_id = v_request.id and m.kind = 'request'
    limit 1;
  end if;

  insert into public.orders (
    conversation_id, request_id, proposal_id, client_id, professional_id, service_id,
    amount, scheduled_label, scheduled_at, address
  )
  values (
    v_conversation.id, v_request.id, v_proposal.id, v_conversation.client_id, v_conversation.professional_id,
    v_request.service_id, v_proposal.amount, v_proposal.scheduled_label,
    v_proposal.scheduled_at, v_address
  )
  returning * into v_order;

  insert into public.messages (conversation_id, sender_id, kind, request_id, body)
  values (
    v_conversation.id, null, 'system', v_request.id,
    format('Serviço combinado · %s · %s', private.format_brl(v_proposal.amount), v_proposal.scheduled_label)
  );

  return v_order;
end;
$$;

create or replace function public.decline_proposal(p_proposal_id uuid)
returns public.proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.proposals;
  v_client_id uuid;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Proposta não encontrada' using errcode = 'P0002';
  end if;

  select c.client_id into v_client_id from public.conversations c where c.id = v_proposal.conversation_id;
  if v_client_id <> v_uid then
    raise exception 'Só o cliente pode recusar a proposta' using errcode = '42501';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'Esta proposta não está mais disponível' using errcode = 'P0001';
  end if;

  update public.proposals
  set status = 'declined', responded_at = now()
  where id = p_proposal_id
  returning * into v_proposal;

  insert into public.messages (conversation_id, sender_id, kind, request_id, body)
  values (v_proposal.conversation_id, null, 'system', v_proposal.request_id, 'Proposta recusada');

  return v_proposal;
end;
$$;

create or replace function public.complete_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
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

  update public.orders
  set status = 'concluido', completed_at = now()
  where id = p_order_id
  returning * into v_order;

  update public.professionals
  set jobs_count = jobs_count + 1
  where id = v_order.professional_id;

  insert into public.messages (conversation_id, sender_id, kind, request_id, body)
  values (v_order.conversation_id, null, 'system', v_order.request_id, 'Serviço concluído');

  return v_order;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
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

  update public.orders
  set status = 'cancelado', canceled_at = now(), canceled_by = v_uid
  where id = p_order_id
  returning * into v_order;

  insert into public.messages (conversation_id, sender_id, kind, request_id, body)
  values (
    v_order.conversation_id, null, 'system', v_order.request_id,
    case when v_uid = v_order.client_id then 'Serviço cancelado pelo cliente'
         else 'Serviço cancelado pelo profissional' end
  );

  return v_order;
end;
$$;

-- Telefone do outro participante, com algum serviço combinado ou concluído na conversa.
create or replace function public.get_contact_phone(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.phone
  from public.conversations c
  join public.profiles pr
    on pr.id = case when c.client_id = (select auth.uid()) then c.professional_id else c.client_id end
  where c.id = p_conversation_id
    and (select auth.uid()) in (c.client_id, c.professional_id)
    and exists (
      select 1 from public.orders o
      where o.conversation_id = c.id and o.status in ('combinado', 'concluido')
    );
$$;

revoke all on function private.before_proposal_insert() from public, anon, authenticated;
revoke all on function private.after_proposal_insert() from public, anon, authenticated;
revoke execute on function public.open_conversation(uuid) from public, anon;
revoke execute on function public.create_request(uuid, text, text, text, jsonb, text[]) from public, anon;
grant execute on function public.open_conversation(uuid) to authenticated;
grant execute on function public.create_request(uuid, text, text, text, jsonb, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

alter publication supabase_realtime add table public.requests;
