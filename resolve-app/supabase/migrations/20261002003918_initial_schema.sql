-- =============================================================================
-- Resolve · schema inicial
--
-- Fluxo (igual ao protótipo em src/state/app.tsx):
--   cliente abre uma conversa com um profissional e manda o pedido (mensagem
--   'request') → profissional manda propostas → cliente aceita/recusa via RPC →
--   aceitar cria o pedido (orders) e uma mensagem de sistema → pedido é
--   concluído/cancelado via RPC → cliente avalia via RPC.
--
-- Regras de acesso:
--   * RLS ativo em todas as tabelas.
--   * Catálogo (services) e profissionais são públicos para leitura.
--   * Conversas, mensagens, propostas e pedidos: só os dois participantes.
--   * Endereços, favoritos e push tokens: só o dono.
--   * Mudanças de estado (aceitar, concluir, cancelar, avaliar) só por RPC.
--   * O telefone em profiles não é legível pela API: use get_my_profile() e
--     get_contact_phone() (este só depois do serviço combinado).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type public.user_role as enum ('cliente', 'profissional');
create type public.message_kind as enum ('text', 'request', 'proposal', 'system');
-- 'superseded': substituída por uma proposta mais nova do profissional
create type public.proposal_status as enum ('pending', 'accepted', 'declined', 'superseded');
create type public.order_status as enum ('combinado', 'concluido', 'cancelado');

-- Funções internas (triggers e helpers de RLS) ficam fora do schema exposto pela API.
create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Helpers sem dependência de tabelas
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 220 → 'R$ 220,00' · 1500.5 → 'R$ 1.500,50' (mesmo formato de formatBRL no app)
create function private.format_brl(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R$ ' || translate(to_char(p_amount, 'FM999,999,990.00'), ',.', '.,');
$$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (char_length(phone) <= 30),
  avatar_url text check (char_length(avatar_url) <= 2048),
  role public.user_role not null default 'cliente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.profiles.phone is 'Não legível pela API. Leia com get_my_profile() / get_contact_phone().';

create table public.services (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  icon text not null,
  title text not null,
  short_title text not null,
  subtitle text not null default '',
  area text not null default '',
  description text not null default '',
  includes text[] not null default '{}',
  examples text[] not null default '{}',
  badge text,
  -- Nota e total exibidos no catálogo (valores de exemplo no seed).
  rating numeric(2, 1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  is_popular boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.professionals (
  id uuid primary key references public.profiles (id) on delete cascade,
  role_title text not null default '' check (char_length(role_title) <= 80),
  bio text not null default '' check (char_length(bio) <= 2000),
  years_experience integer not null default 0 check (years_experience between 0 and 80),
  reply_minutes integer not null default 30 check (reply_minutes between 1 and 1440),
  tags text[] not null default '{}',
  base_area text not null default '',
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  -- Campos abaixo são mantidos pelo sistema (sem grant de escrita para usuários).
  verified boolean not null default false,
  rating numeric(3, 2) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  jobs_count integer not null default 0 check (jobs_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professional_services (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id text not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (professional_id, service_id)
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label text not null default 'Casa' check (char_length(label) <= 40),
  line text not null check (char_length(line) <= 200),
  complement text check (char_length(complement) <= 120),
  area text not null default '' check (char_length(area) <= 120),
  city text not null default '' check (char_length(city) <= 120),
  state text not null default '' check (char_length(state) <= 2),
  postal_code text check (char_length(postal_code) <= 9),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  service_id text not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, service_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id text not null references public.services (id),
  -- Não lidas = mensagens depois do *_last_read_at (marque com mark_conversation_read).
  client_last_read_at timestamptz not null default now(),
  professional_last_read_at timestamptz not null default 'epoch',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> professional_id)
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  professional_id uuid not null default auth.uid() references public.professionals (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  -- Texto livre como no app ('Sábado, 9h'); scheduled_at é opcional.
  scheduled_label text not null check (char_length(scheduled_label) between 1 and 120),
  scheduled_at timestamptz,
  note text check (char_length(note) <= 1000),
  status public.proposal_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- null = mensagem de sistema
  sender_id uuid default auth.uid() references public.profiles (id) on delete cascade,
  kind public.message_kind not null default 'text',
  -- text/system: o texto · request: a descrição do problema
  body text check (char_length(body) <= 4000),
  -- kind = 'proposal'
  proposal_id uuid references public.proposals (id) on delete cascade,
  -- kind = 'request': quando e onde (cópia do endereço no momento do pedido)
  request_when text check (char_length(request_when) <= 120),
  request_address jsonb,
  created_at timestamptz not null default now(),
  check ((kind = 'proposal') = (proposal_id is not null)),
  check (
    case kind
      when 'text' then sender_id is not null and coalesce(char_length(btrim(body)), 0) > 0
      when 'system' then sender_id is null and coalesce(char_length(btrim(body)), 0) > 0
      when 'request' then sender_id is not null and coalesce(char_length(btrim(body)), 0) > 0 and request_when is not null
      when 'proposal' then sender_id is not null
    end
  )
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations (id) on delete cascade,
  proposal_id uuid not null unique references public.proposals (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id text not null references public.services (id),
  amount numeric(10, 2) not null check (amount > 0),
  scheduled_label text not null,
  scheduled_at timestamptz,
  -- Cópia do endereço do pedido (o endereço salvo pode mudar depois).
  address jsonb,
  status public.order_status not null default 'combinado',
  completed_at timestamptz,
  canceled_at timestamptz,
  canceled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Um aparelho pertence a um usuário por vez (troca via register_push_token).
  token text not null unique check (char_length(token) <= 512),
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------

create index professional_services_service_idx on public.professional_services (service_id);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default_idx on public.addresses (user_id) where is_default;
create index favorites_service_idx on public.favorites (service_id);
create index conversations_client_idx on public.conversations (client_id, last_message_at desc);
create index conversations_professional_idx on public.conversations (professional_id, last_message_at desc);
create index conversations_service_idx on public.conversations (service_id);
create index proposals_conversation_idx on public.proposals (conversation_id, created_at);
create index proposals_professional_idx on public.proposals (professional_id);
-- No máximo uma proposta pendente por conversa.
create unique index proposals_one_pending_idx on public.proposals (conversation_id) where status = 'pending';
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id);
create index messages_proposal_idx on public.messages (proposal_id);
create index orders_client_idx on public.orders (client_id, created_at desc);
create index orders_professional_idx on public.orders (professional_id, created_at desc);
create index orders_service_idx on public.orders (service_id);
create index orders_canceled_by_idx on public.orders (canceled_by);
create index reviews_professional_idx on public.reviews (professional_id, created_at desc);
create index reviews_client_idx on public.reviews (client_id);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- -----------------------------------------------------------------------------
-- Helpers de RLS (security definer para não cair em recursão de políticas)
-- -----------------------------------------------------------------------------

create function private.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (select auth.uid()) in (c.client_id, c.professional_id)
  );
$$;

-- O usuário logado tem alguma conversa com p_user_id?
create function private.shares_conversation_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where (c.client_id = (select auth.uid()) and c.professional_id = p_user_id)
       or (c.professional_id = (select auth.uid()) and c.client_id = p_user_id)
  );
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger professionals_updated_at before update on public.professionals
  for each row execute function private.set_updated_at();
create trigger addresses_updated_at before update on public.addresses
  for each row execute function private.set_updated_at();
create trigger conversations_updated_at before update on public.conversations
  for each row execute function private.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger push_tokens_updated_at before update on public.push_tokens
  for each row execute function private.set_updated_at();

-- Cria o profile quando alguém se cadastra. Metadados aceitos no signUp:
--   options.data = { full_name | name, avatar_url, phone, role: 'cliente' | 'profissional' }
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role public.user_role :=
    case when v_meta ->> 'role' = 'profissional' then 'profissional' else 'cliente' end;
begin
  insert into public.profiles (id, full_name, avatar_url, phone, role)
  values (
    new.id,
    left(coalesce(nullif(v_meta ->> 'full_name', ''), nullif(v_meta ->> 'name', ''), ''), 120),
    nullif(v_meta ->> 'avatar_url', ''),
    left(coalesce(nullif(new.phone, ''), nullif(v_meta ->> 'phone', '')), 30),
    v_role
  );

  -- Profissional já ganha a ficha (não verificada) para completar depois.
  if v_role = 'profissional' then
    insert into public.professionals (id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Nova mensagem → atualiza a ordem da lista de conversas.
create function private.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function private.touch_conversation();

-- Antes de gravar uma proposta: valida a conversa e substitui a pendente anterior.
create function private.before_proposal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'pending';
  new.responded_at := null;
  new.created_at := now();

  select c.professional_id into new.professional_id
  from public.conversations c
  where c.id = new.conversation_id
  for update;

  if exists (select 1 from public.orders o where o.conversation_id = new.conversation_id) then
    raise exception 'Esta conversa já tem um serviço combinado' using errcode = 'P0001';
  end if;

  update public.proposals
  set status = 'superseded', responded_at = now()
  where conversation_id = new.conversation_id
    and status = 'pending';

  return new;
end;
$$;

create trigger proposals_before_insert
  before insert on public.proposals
  for each row execute function private.before_proposal_insert();

-- Toda proposta aparece no chat como mensagem 'proposal'.
create function private.after_proposal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.messages (conversation_id, sender_id, kind, proposal_id, created_at)
  values (new.conversation_id, new.professional_id, 'proposal', new.id, new.created_at);
  return new;
end;
$$;

create trigger proposals_after_insert
  after insert on public.proposals
  for each row execute function private.after_proposal_insert();

-- Nota média e total de avaliações do profissional.
create function private.refresh_professional_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional_id uuid := coalesce(new.professional_id, old.professional_id);
begin
  update public.professionals p
  set rating = coalesce(s.avg_rating, 0),
      review_count = s.total
  from (
    select round(avg(r.rating), 2) as avg_rating, count(*)::integer as total
    from public.reviews r
    where r.professional_id = v_professional_id
  ) s
  where p.id = v_professional_id;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update of rating or delete on public.reviews
  for each row execute function private.refresh_professional_rating();

-- Mensagens criadas pelo usuário: horário sempre do servidor.
create function private.before_message_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.before_message_insert();

-- -----------------------------------------------------------------------------
-- Privilégios de coluna
--
-- O Supabase dá ALL nas tabelas de public para anon e authenticated; a RLS
-- filtra as linhas e estes grants limitam as colunas.
-- -----------------------------------------------------------------------------

-- profiles: telefone fora do select; role e datas fora do update.
revoke select, insert, update on public.profiles from anon, authenticated;
grant select (id, full_name, avatar_url, role, created_at, updated_at) on public.profiles to anon, authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- professionals: nota, total, serviços feitos e verificado são do sistema.
revoke insert, update on public.professionals from anon, authenticated;
grant insert (id, role_title, bio, years_experience, reply_minutes, tags, base_area, latitude, longitude)
  on public.professionals to authenticated;
grant update (role_title, bio, years_experience, reply_minutes, tags, base_area, latitude, longitude)
  on public.professionals to authenticated;

-- conversations: leitura marcada só por mark_conversation_read.
revoke update on public.conversations from anon, authenticated;

-- proposals, orders, reviews: mudanças só pelas RPCs.
revoke update on public.proposals from anon, authenticated;
revoke insert, update on public.orders from anon, authenticated;
revoke insert, update on public.reviews from anon, authenticated;

-- messages: imutáveis.
revoke update on public.messages from anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.professionals enable row level security;
alter table public.professional_services enable row level security;
alter table public.addresses enable row level security;
alter table public.favorites enable row level security;
alter table public.conversations enable row level security;
alter table public.proposals enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;
alter table public.reviews enable row level security;
alter table public.push_tokens enable row level security;

-- profiles: o próprio, qualquer profissional e quem conversa com você.
create policy "profiles: leitura" on public.profiles
  for select to anon, authenticated
  using (
    id = (select auth.uid())
    or exists (select 1 from public.professionals p where p.id = profiles.id)
    or private.shares_conversation_with(id)
  );

create policy "profiles: editar o próprio" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Catálogo público.
create policy "services: leitura pública" on public.services
  for select to anon, authenticated
  using (active);

create policy "professionals: leitura pública" on public.professionals
  for select to anon, authenticated
  using (true);

create policy "professionals: criar a própria ficha" on public.professionals
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid()) and pr.role = 'profissional'
    )
  );

create policy "professionals: editar a própria ficha" on public.professionals
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "professional_services: leitura pública" on public.professional_services
  for select to anon, authenticated
  using (true);

create policy "professional_services: incluir nos próprios" on public.professional_services
  for insert to authenticated
  with check (professional_id = (select auth.uid()));

create policy "professional_services: remover dos próprios" on public.professional_services
  for delete to authenticated
  using (professional_id = (select auth.uid()));

-- Endereços, favoritos e tokens: só o dono.
create policy "addresses: só o dono" on public.addresses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "favorites: só o dono" on public.favorites
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push_tokens: só o dono" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Conversas: participantes leem; o cliente abre com um profissional que atende o serviço.
create policy "conversations: participantes leem" on public.conversations
  for select to authenticated
  using ((select auth.uid()) in (client_id, professional_id));

create policy "conversations: cliente abre" on public.conversations
  for insert to authenticated
  with check (
    client_id = (select auth.uid())
    and exists (
      select 1 from public.professional_services ps
      where ps.professional_id = conversations.professional_id
        and ps.service_id = conversations.service_id
    )
  );

-- Mensagens: participantes leem; usuário escreve texto, e o cliente escreve o pedido.
-- 'proposal' e 'system' só nascem dos triggers e RPCs.
create policy "messages: participantes leem" on public.messages
  for select to authenticated
  using (private.is_conversation_participant(conversation_id));

create policy "messages: participantes escrevem" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_participant(conversation_id)
    and (
      kind = 'text'
      or (
        kind = 'request'
        and exists (
          select 1 from public.conversations c
          where c.id = messages.conversation_id and c.client_id = (select auth.uid())
        )
      )
    )
  );

-- Propostas: participantes leem; só o profissional da conversa envia.
create policy "proposals: participantes leem" on public.proposals
  for select to authenticated
  using (private.is_conversation_participant(conversation_id));

create policy "proposals: profissional envia" on public.proposals
  for insert to authenticated
  with check (
    professional_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = proposals.conversation_id and c.professional_id = (select auth.uid())
    )
  );

-- Pedidos: participantes leem.
create policy "orders: participantes leem" on public.orders
  for select to authenticated
  using ((select auth.uid()) in (client_id, professional_id));

-- Avaliações: públicas (aparecem no perfil do profissional).
create policy "reviews: leitura pública" on public.reviews
  for select to anon, authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Cliente aceita a proposta → cria o pedido e a mensagem de sistema.
create function public.accept_proposal(p_proposal_id uuid)
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

  select m.request_address into v_address
  from public.messages m
  where m.conversation_id = v_conversation.id and m.kind = 'request'
  order by m.created_at desc
  limit 1;

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

-- Cliente recusa a proposta.
create function public.decline_proposal(p_proposal_id uuid)
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

  insert into public.messages (conversation_id, sender_id, kind, body)
  values (v_proposal.conversation_id, null, 'system', 'Proposta recusada');

  return v_proposal;
end;
$$;

-- Cliente ou profissional marca o serviço como concluído.
create function public.complete_order(p_order_id uuid)
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

  insert into public.messages (conversation_id, sender_id, kind, body)
  values (v_order.conversation_id, null, 'system', 'Serviço concluído');

  return v_order;
end;
$$;

-- Cliente ou profissional cancela um serviço combinado.
create function public.cancel_order(p_order_id uuid)
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

  insert into public.messages (conversation_id, sender_id, kind, body)
  values (
    v_order.conversation_id, null, 'system',
    case when v_uid = v_order.client_id then 'Serviço cancelado pelo cliente'
         else 'Serviço cancelado pelo profissional' end
  );

  return v_order;
end;
$$;

-- Cliente avalia um serviço concluído (uma vez por pedido).
create function public.rate_order(p_order_id uuid, p_rating integer, p_comment text default null)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_review public.reviews;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'A nota deve ser de 1 a 5' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.client_id <> v_uid then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  if v_order.status <> 'concluido' then
    raise exception 'Só dá para avaliar um serviço concluído' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.reviews where order_id = p_order_id) then
    raise exception 'Este serviço já foi avaliado' using errcode = 'P0001';
  end if;

  insert into public.reviews (order_id, client_id, professional_id, rating, comment)
  values (p_order_id, v_uid, v_order.professional_id, p_rating, nullif(btrim(p_comment), ''))
  returning * into v_review;

  return v_review;
end;
$$;

-- Marca a conversa como lida para quem chamou.
create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  update public.conversations
  set client_last_read_at = case when client_id = v_uid then now() else client_last_read_at end,
      professional_last_read_at = case when professional_id = v_uid then now() else professional_last_read_at end
  where id = p_conversation_id
    and v_uid in (client_id, professional_id);
end;
$$;

-- Perfil completo do usuário logado (inclui o telefone).
create function public.get_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles where id = (select auth.uid());
$$;

-- Telefone do outro participante, só com serviço combinado ou concluído.
create function public.get_contact_phone(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.phone
  from public.conversations c
  join public.orders o on o.conversation_id = c.id and o.status in ('combinado', 'concluido')
  join public.profiles pr
    on pr.id = case when c.client_id = (select auth.uid()) then c.professional_id else c.client_id end
  where c.id = p_conversation_id
    and (select auth.uid()) in (c.client_id, c.professional_id);
$$;

-- Registra o token de push do aparelho (passa para o usuário logado se já existir).
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  insert into public.push_tokens (user_id, token, platform)
  values (v_uid, p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões das funções
-- -----------------------------------------------------------------------------

-- Funções internas: ninguém chama direto; os helpers de RLS precisam de execute.
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_conversation_participant(uuid) to anon, authenticated;
grant execute on function private.shares_conversation_with(uuid) to anon, authenticated;

-- RPCs: só usuários logados.
revoke execute on function public.accept_proposal(uuid) from public, anon;
revoke execute on function public.decline_proposal(uuid) from public, anon;
revoke execute on function public.complete_order(uuid) from public, anon;
revoke execute on function public.cancel_order(uuid) from public, anon;
revoke execute on function public.rate_order(uuid, integer, text) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.get_my_profile() from public, anon;
revoke execute on function public.get_contact_phone(uuid) from public, anon;
revoke execute on function public.register_push_token(text, text) from public, anon;

grant execute on function public.accept_proposal(uuid) to authenticated;
grant execute on function public.decline_proposal(uuid) to authenticated;
grant execute on function public.complete_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.rate_order(uuid, integer, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_contact_phone(uuid) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime (respeita a RLS: cada um só recebe o que pode ler)
-- -----------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.messages, public.proposals, public.orders, public.conversations;
