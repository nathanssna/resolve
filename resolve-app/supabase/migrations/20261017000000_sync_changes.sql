-- =============================================================================
-- Sincronizar só o que mudou.
--
-- Ao voltar para o app, ele buscava de novo todas as conversas com as mensagens
-- recentes. Agora busca só o que mudou desde a última vez: mensagens novas
-- (created_at) e pedidos, propostas, serviços e conversas alterados (updated_at).
-- Pedidos e propostas ainda não tinham updated_at; os índices deixam essas buscas
-- olharem só as linhas recentes.
-- =============================================================================

alter table public.proposals add column updated_at timestamptz not null default now();
alter table public.requests add column updated_at timestamptz not null default now();

create trigger proposals_updated_at before update on public.proposals
  for each row execute function private.set_updated_at();
create trigger requests_updated_at before update on public.requests
  for each row execute function private.set_updated_at();

create index messages_created_idx on public.messages (created_at);
create index proposals_updated_idx on public.proposals (updated_at);
create index requests_updated_idx on public.requests (updated_at);
create index orders_updated_idx on public.orders (updated_at);
create index conversations_updated_idx on public.conversations (updated_at);
create index reviews_created_idx on public.reviews (created_at);
create index client_reviews_created_idx on public.client_reviews (created_at);
