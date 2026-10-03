-- =============================================================================
-- Excluir conta, bloquear e denunciar (exigências das lojas para apps com chat).
--
-- Excluir conta (delete_my_account):
--   * apaga o login (auth.users), endereços, favoritos, tokens de push,
--     endereços privados dos pedidos e a ficha de profissional;
--   * cancela serviços em andamento e encerra pedidos abertos, avisando o outro lado;
--   * o profile vira "Conta excluída" (sem foto e telefone) e fica só para o
--     outro lado não perder conversas, serviços e avaliações.
--   As fotos (avatar e pedidos) são apagadas pelo app, pela API do Storage,
--   antes de chamar a RPC.
--
-- Por isso profiles deixa de ter FK para auth.users. Quem apagar um usuário
-- direto no painel (ou pelos scripts de limpeza) continua apagando tudo em
-- cascata, como antes (trigger on_auth_user_deleted).
--
-- Bloquear: blocks (quem bloqueou → quem foi bloqueado). Com bloqueio em
-- qualquer direção, ninguém abre conversa, faz pedido, manda proposta ou
-- mensagem entre os dois.
--
-- Denunciar: reports. Só quem denunciou lê a própria denúncia; a análise é
-- feita no painel do Supabase (tabela public.reports).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conta excluída
-- -----------------------------------------------------------------------------

alter table public.profiles add column deleted_at timestamptz;
grant select (deleted_at) on public.profiles to anon, authenticated;

alter table public.profiles drop constraint profiles_id_fkey;

create function private.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Conta excluída pelo app já foi anonimizada e fica; o resto sai em cascata.
  delete from public.profiles where id = old.id and deleted_at is null;
  return old;
end;
$$;

revoke all on function private.handle_deleted_user() from public, anon, authenticated;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function private.handle_deleted_user();

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order record;
  v_request record;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  -- Serviços em andamento: cancelados, com aviso para o outro lado.
  for v_order in
    select o.id, o.conversation_id, o.request_id
    from public.orders o
    where v_uid in (o.client_id, o.professional_id) and o.status = 'combinado'
    for update
  loop
    update public.orders
    set status = 'cancelado', canceled_at = now(), canceled_by = v_uid
    where id = v_order.id;
    insert into public.messages (conversation_id, sender_id, kind, request_id, body)
    values (v_order.conversation_id, null, 'system', v_order.request_id, 'Serviço cancelado: a conta foi excluída');
  end loop;

  -- Pedidos abertos: encerrados.
  for v_request in
    select r.id, r.conversation_id
    from public.requests r
    join public.conversations c on c.id = r.conversation_id
    where v_uid in (c.client_id, c.professional_id)
      and r.closed_at is null
      and not exists (select 1 from public.orders o where o.request_id = r.id)
    for update of r
  loop
    update public.proposals set status = 'declined', responded_at = now()
    where request_id = v_request.id and status = 'pending';
    update public.requests set closed_at = now(), closed_by = v_uid where id = v_request.id;
    insert into public.messages (conversation_id, sender_id, kind, request_id, body)
    values (v_request.conversation_id, null, 'system', v_request.id, 'Pedido encerrado: a conta foi excluída');
  end loop;

  -- Dados pessoais.
  delete from public.request_addresses ra
  using public.requests r, public.conversations c
  where ra.request_id = r.id and r.conversation_id = c.id and c.client_id = v_uid;
  delete from public.addresses where user_id = v_uid;
  delete from public.favorites where user_id = v_uid;
  delete from public.push_tokens where user_id = v_uid;
  delete from public.blocks where v_uid in (blocker_id, blocked_id);
  delete from public.professional_services where professional_id = v_uid;
  update public.professionals
  set role_title = '', bio = '', tags = '{}', base_area = '', latitude = null, longitude = null, verified = false
  where id = v_uid;
  update public.profiles
  set full_name = 'Conta excluída', avatar_url = null, phone = null, deleted_at = now()
  where id = v_uid;

  -- Por último, o login.
  delete from auth.users where id = v_uid;
end;
$$;

-- Avaliação de conta excluída fica sem nome.
create or replace function public.get_professional_reviews(p_professional_id uuid, p_limit integer default 20)
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
         case when pr.deleted_at is null then nullif(split_part(btrim(pr.full_name), ' ', 1), '') end as client_first_name
  from public.reviews r
  join public.orders o on o.id = r.order_id
  left join public.profiles pr on pr.id = r.client_id
  where r.professional_id = p_professional_id
  order by (r.comment is null), r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- -----------------------------------------------------------------------------
-- Bloqueios
-- -----------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
revoke update on public.blocks from anon, authenticated;

create policy "blocks: o dono vê" on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "blocks: o dono bloqueia" on public.blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "blocks: o dono desbloqueia" on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Há bloqueio (em qualquer direção) entre os dois?
create function private.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create function private.conversation_blocked(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and private.is_blocked(c.client_id, c.professional_id)
  );
$$;

revoke all on function private.is_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.conversation_blocked(uuid) from public, anon, authenticated;
grant execute on function private.conversation_blocked(uuid) to authenticated;

-- Nada novo entre quem se bloqueou: conversa, pedido, proposta, mensagem.
create function private.check_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocked boolean;
begin
  -- Campos diferentes por tabela: o PL/pgSQL não deixa ler new.conversation_id em conversations.
  if tg_table_name = 'conversations' then
    v_blocked := private.is_blocked(new.client_id, new.professional_id);
  else
    v_blocked := private.conversation_blocked(new.conversation_id);
  end if;
  if v_blocked then
    raise exception 'Não é possível falar com esta pessoa' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.check_not_blocked() from public, anon, authenticated;

create trigger conversations_not_blocked before insert on public.conversations
  for each row execute function private.check_not_blocked();
create trigger requests_not_blocked before insert on public.requests
  for each row execute function private.check_not_blocked();
-- Depois de proposals_before_insert (ordem alfabética), que define a conversa pelo pedido.
create trigger proposals_z_not_blocked before insert on public.proposals
  for each row execute function private.check_not_blocked();

drop policy "messages: participantes escrevem" on public.messages;
create policy "messages: participantes escrevem" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_participant(conversation_id)
    and not private.conversation_blocked(conversation_id)
    and kind = 'text'
    and request_id is null
    and cardinality(photos) = 0
  );

-- -----------------------------------------------------------------------------
-- Denúncias
-- -----------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  reason text not null check (reason in ('golpe', 'assedio', 'conteudo', 'pagamento', 'outro')),
  details text check (char_length(details) <= 1000),
  -- Preenchido por quem analisa (painel do Supabase).
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

comment on table public.reports is 'Denúncias do app. Analise pelo painel; marque resolved_at ao concluir.';

create index reports_open_idx on public.reports (created_at) where resolved_at is null;
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_reported_idx on public.reports (reported_id);
create index reports_conversation_idx on public.reports (conversation_id);

alter table public.reports enable row level security;
revoke update, delete on public.reports from anon, authenticated;
revoke insert on public.reports from anon, authenticated;
grant insert (reported_id, conversation_id, reason, details) on public.reports to authenticated;

create policy "reports: quem denunciou vê" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "reports: usuário denuncia" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (conversation_id is null or private.is_conversation_participant(conversation_id))
  );

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
