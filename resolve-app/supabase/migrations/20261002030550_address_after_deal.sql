-- =============================================================================
-- Endereço completo só depois de combinar.
--
-- Antes: o pedido levava rua e número para qualquer profissional contatado.
-- Agora:
--   * a mensagem do pedido guarda só apelido, bairro, cidade e UF (o banco
--     descarta o resto, mesmo que o app mande);
--   * o endereço completo fica em request_addresses, que só o cliente lê;
--   * accept_proposal copia o endereço completo para o pedido (orders.address),
--     que os dois participantes veem.
-- Pedidos antigos não são alterados.
-- =============================================================================

create table public.request_addresses (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  address jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.request_addresses enable row level security;

create policy "request_addresses: cliente da conversa grava" on public.request_addresses
  for insert to authenticated
  with check (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.client_id = (select auth.uid()))
  );

-- O profissional não lê esta tabela: recebe o endereço no pedido, depois do aceite.
create policy "request_addresses: cliente da conversa lê" on public.request_addresses
  for select to authenticated
  using (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.client_id = (select auth.uid()))
  );

-- Mensagem do pedido: só a parte pública do endereço.
create function private.public_request_address()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'request' and new.request_address is not null then
    new.request_address := jsonb_strip_nulls(jsonb_build_object(
      'label', new.request_address -> 'label',
      'area', new.request_address -> 'area',
      'city', new.request_address -> 'city',
      'state', new.request_address -> 'state'
    ));
  end if;
  return new;
end;
$$;

revoke all on function private.public_request_address() from public, anon, authenticated;

create trigger messages_public_request_address
  before insert on public.messages
  for each row execute function private.public_request_address();

-- accept_proposal: o pedido recebe o endereço completo.
create or replace function public.accept_proposal(p_proposal_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.proposals;
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

  -- Trava a conversa: dois aceites ao mesmo tempo viram um só pedido.
  select * into v_conversation
  from public.conversations
  where id = v_proposal.conversation_id
  for update;

  if v_conversation.client_id <> v_uid then
    raise exception 'Só o cliente pode aceitar a proposta' using errcode = '42501';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id;
  if v_proposal.status <> 'pending' then
    raise exception 'Esta proposta não está mais disponível' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.orders where conversation_id = v_conversation.id) then
    raise exception 'Esta conversa já tem um serviço combinado' using errcode = 'P0001';
  end if;

  update public.proposals
  set status = 'accepted', responded_at = now()
  where id = p_proposal_id;

  -- Endereço completo (privado do cliente até aqui); pedidos antigos usam o da mensagem.
  select ra.address into v_address from public.request_addresses ra where ra.conversation_id = v_conversation.id;
  if v_address is null then
    select m.request_address into v_address
    from public.messages m
    where m.conversation_id = v_conversation.id and m.kind = 'request'
    order by m.created_at desc
    limit 1;
  end if;

  insert into public.orders (
    conversation_id, proposal_id, client_id, professional_id, service_id,
    amount, scheduled_label, scheduled_at, address
  )
  values (
    v_conversation.id, v_proposal.id, v_conversation.client_id, v_conversation.professional_id,
    v_conversation.service_id, v_proposal.amount, v_proposal.scheduled_label,
    v_proposal.scheduled_at, v_address
  )
  returning * into v_order;

  insert into public.messages (conversation_id, sender_id, kind, body)
  values (
    v_conversation.id, null, 'system',
    format('Serviço combinado · %s · %s', private.format_brl(v_proposal.amount), v_proposal.scheduled_label)
  );

  return v_order;
end;
$$;
