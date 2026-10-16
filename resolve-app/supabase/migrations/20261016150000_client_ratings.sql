-- =============================================================================
-- Profissional avalia o cliente (como no Uber).
--
--   * Depois do serviço concluído, o profissional dá de 1 a 5 estrelas ao cliente
--     (rate_client), uma vez por serviço.
--   * O cliente nunca vê a nota de cada profissional: só a própria média
--     (my_client_rating), e só a partir de 3 avaliações.
--   * Os profissionais veem a mesma média no histórico do cliente
--     (client_track_record), com a mesma regra das 3 avaliações.
--   * Cada profissional lê só as notas que ele mesmo deu (para o app saber o que já avaliou).
-- =============================================================================

create table public.client_reviews (
  order_id uuid primary key references public.orders (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create index client_reviews_client_idx on public.client_reviews (client_id);
create index client_reviews_professional_idx on public.client_reviews (professional_id);

alter table public.client_reviews enable row level security;

create policy "client_reviews: profissional lê as que deu" on public.client_reviews
  for select to authenticated
  using (professional_id = (select auth.uid()));

revoke all on public.client_reviews from anon, authenticated;
grant select on public.client_reviews to authenticated;

-- Média só com 3 avaliações ou mais (com menos, daria para saber a nota de alguém).
create function private.client_rating(p_client_id uuid)
returns table (rating numeric, reviews integer)
language sql
stable
set search_path = ''
as $$
  select case when count(*) >= 3 then round(avg(r.rating), 1) end, count(*)::integer
  from public.client_reviews r
  where r.client_id = p_client_id;
$$;

revoke all on function private.client_rating(uuid) from public, anon, authenticated;

create function public.rate_client(p_order_id uuid, p_rating integer)
returns public.client_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_review public.client_reviews;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'A nota deve ser de 1 a 5' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.professional_id <> v_uid then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  if v_order.status <> 'concluido' then
    raise exception 'Só dá para avaliar um serviço concluído' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.client_reviews where order_id = p_order_id) then
    raise exception 'Este cliente já foi avaliado neste serviço' using errcode = 'P0001';
  end if;

  insert into public.client_reviews (order_id, client_id, professional_id, rating)
  values (p_order_id, v_order.client_id, v_uid, p_rating)
  returning * into v_review;
  return v_review;
end;
$$;

create function public.my_client_rating()
returns table (rating numeric, reviews integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.client_rating((select auth.uid()));
$$;

-- Histórico do cliente para o profissional: + média como cliente.
drop function public.client_track_record(uuid);

create function public.client_track_record(p_client_id uuid)
returns table (done integer, late_cancels integer, has_phone boolean, identity_verified boolean, wrong_contests integer, rating numeric, ratings integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.done, r.late_cancels, r.has_phone, r.identity_verified, r.wrong_contests, cr.rating, cr.reviews
  from (
    select
      (select count(*) from public.orders o where o.client_id = p_client_id and o.status = 'concluido')::integer as done,
      (select count(*) from public.orders o where o.client_id = p_client_id and o.canceled_late and o.canceled_by = o.client_id)::integer as late_cancels,
      coalesce(btrim(p.phone), '') <> '' as has_phone,
      p.identity_verified_at is not null as identity_verified,
      (select count(*) from public.orders o where o.client_id = p_client_id and o.client_contest_wrong)::integer as wrong_contests
    from public.profiles p
    where p.id = p_client_id
  ) r
  cross join private.client_rating(p_client_id) cr
  where exists (
    select 1 from public.conversations c
    where c.client_id = p_client_id and c.professional_id = (select auth.uid())
  );
$$;

revoke execute on function public.rate_client(uuid, integer) from public, anon;
revoke execute on function public.my_client_rating() from public, anon;
revoke execute on function public.client_track_record(uuid) from public, anon;
grant execute on function public.rate_client(uuid, integer) to authenticated;
grant execute on function public.my_client_rating() to authenticated;
grant execute on function public.client_track_record(uuid) to authenticated;
