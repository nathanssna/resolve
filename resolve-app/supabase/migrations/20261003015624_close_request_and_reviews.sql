-- =============================================================================
-- Pedido encerrado sem serviço e avaliações escritas no perfil.
--
--   * close_request: o cliente cancela ou o profissional recusa um pedido que
--     ainda não tem serviço combinado. Propostas pendentes dele caem, e o
--     pedido não aceita propostas novas.
--   * get_professional_reviews: avaliações do profissional com o primeiro nome
--     de quem avaliou (o profile do cliente continua fechado).
-- =============================================================================

alter table public.requests
  add column closed_at timestamptz,
  add column closed_by uuid references public.profiles (id) on delete set null;

create index requests_closed_by_idx on public.requests (closed_by);

-- -----------------------------------------------------------------------------
-- Encerrar pedido
-- -----------------------------------------------------------------------------

create function public.close_request(p_request_id uuid)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.requests;
  v_conversation public.conversations;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  select * into v_conversation from public.conversations where id = v_request.conversation_id;
  if v_uid not in (v_conversation.client_id, v_conversation.professional_id) then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  if v_request.closed_at is not null then
    raise exception 'Este pedido já foi encerrado' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.orders o where o.request_id = p_request_id) then
    raise exception 'Este pedido já tem um serviço combinado. Cancele o serviço no pedido.' using errcode = 'P0001';
  end if;

  update public.proposals
  set status = 'declined', responded_at = now()
  where request_id = p_request_id and status = 'pending';

  update public.requests
  set closed_at = now(), closed_by = v_uid
  where id = p_request_id
  returning * into v_request;

  insert into public.messages (conversation_id, sender_id, kind, request_id, body)
  values (
    v_conversation.id, null, 'system', p_request_id,
    case when v_uid = v_conversation.client_id then 'Pedido cancelado pelo cliente'
         else 'O profissional não pode atender este pedido' end
  );

  return v_request;
end;
$$;

-- Proposta: pedido encerrado não recebe proposta (e não entra no "pedido em aberto").
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
      and r.closed_at is null
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

  if v_request.closed_at is not null then
    raise exception 'Este pedido foi encerrado' using errcode = 'P0001';
  end if;

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

revoke all on function private.before_proposal_insert() from public, anon, authenticated;
revoke execute on function public.close_request(uuid) from public, anon;
grant execute on function public.close_request(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Avaliações no perfil do profissional
-- -----------------------------------------------------------------------------

create function public.get_professional_reviews(p_professional_id uuid, p_limit integer default 20)
returns table (
  id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  service_id text,
  client_first_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.comment, r.created_at, o.service_id,
         nullif(split_part(btrim(pr.full_name), ' ', 1), '') as client_first_name
  from public.reviews r
  join public.orders o on o.id = r.order_id
  left join public.profiles pr on pr.id = r.client_id
  where r.professional_id = p_professional_id
  order by (r.comment is null), r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke execute on function public.get_professional_reviews(uuid, integer) from public;
grant execute on function public.get_professional_reviews(uuid, integer) to anon, authenticated;
