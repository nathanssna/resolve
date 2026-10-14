-- =============================================================================
-- Painel de moderação, versão 2: organizado pelo que precisa de decisão.
--
--   admin_overview       + requests_converted (pedidos do período que viraram serviço)
--   admin_people         + denúncias recebidas e foto (para a busca do painel)
--   admin_verifications  + profissão
--   admin_report(id)     tudo para decidir uma denúncia numa tela: quem, o que,
--                        a denúncia anterior contra a mesma pessoa e o trecho
--                        da conversa até a denúncia (a leitura fica registrada)
--   admin_person         denúncias com quem denunciou e a decisão; serviços
--                        com a conclusão e se foi a própria pessoa que cancelou
-- Mesmas regras: administrador + segundo fator a cada chamada.
-- =============================================================================

create or replace function public.admin_overview(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := case
    when coalesce(p_days, 7) <= 1 then date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    else now() - make_interval(days => p_days)
  end;
begin
  perform private.require_admin();
  return jsonb_build_object(
    'since', v_since,
    'clients_new', (select count(*) from public.profiles p where p.role = 'cliente' and p.deleted_at is null and p.created_at >= v_since),
    'pros_new', (select count(*) from public.profiles p where p.role = 'profissional' and p.deleted_at is null and p.created_at >= v_since),
    'clients_total', (select count(*) from public.profiles p where p.role = 'cliente' and p.deleted_at is null),
    'pros_total', (select count(*) from public.profiles p where p.role = 'profissional' and p.deleted_at is null),
    'requests', (select count(*) from public.requests r where r.created_at >= v_since),
    'requests_converted', (
      select count(*) from public.requests r
      where r.created_at >= v_since and exists (select 1 from public.orders o where o.request_id = r.id)
    ),
    'orders_combined', (select count(*) from public.orders o where o.created_at >= v_since),
    'orders_done', (select count(*) from public.orders o where o.status = 'concluido' and o.completed_at >= v_since),
    'volume_done', (select coalesce(sum(o.amount), 0) from public.orders o where o.status = 'concluido' and o.completed_at >= v_since),
    'orders_canceled', (select count(*) from public.orders o where o.status = 'cancelado' and o.canceled_at >= v_since),
    'orders_canceled_late', (select count(*) from public.orders o where o.status = 'cancelado' and o.canceled_late and o.canceled_at >= v_since),
    'reviews', (select count(*) from public.reviews rv where rv.created_at >= v_since),
    'rating', (select round(avg(rv.rating), 1) from public.reviews rv where rv.created_at >= v_since),
    'verifications_pending', (select count(*) from public.verifications v where v.status = 'pending'),
    'reports_open', (select count(*) from public.reports r where r.resolved_at is null),
    'suspended', (select count(*) from public.profiles p where p.suspended_until > now())
  );
end;
$$;

drop function public.admin_people(text, text, integer);

create function public.admin_people(p_query text default '', p_filter text default 'todos', p_limit integer default 50)
returns table (
  id uuid, name text, email text, role public.user_role, avatar_url text, role_title text, created_at timestamptz,
  deleted boolean, suspended_until timestamptz, verified boolean, paused boolean, reports_received bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  perform private.require_admin();
  return query
  select p.id, p.full_name, u.email::text, p.role, p.avatar_url, pr.role_title, p.created_at, p.deleted_at is not null,
    p.suspended_until, coalesce(pr.verified, false), coalesce(pr.paused, false),
    (select count(*) from public.reports r where r.reported_id = p.id)
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.professionals pr on pr.id = p.id and p.role = 'profissional'
  where (v_q = '' or p.full_name ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%')
    and case p_filter
      when 'clientes' then p.role = 'cliente'
      when 'profissionais' then p.role = 'profissional'
      when 'suspensos' then coalesce(p.suspended_until > now(), false)
      else true
    end
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

drop function public.admin_verifications();

create function public.admin_verifications()
returns table (
  id uuid, professional_id uuid, name text, email text, role_title text, created_at timestamptz,
  document_path text, selfie_path text, rejected_before bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select v.id, v.professional_id, p.full_name, u.email::text, pr.role_title, v.created_at, v.document_path, v.selfie_path,
    (select count(*) from public.verifications x where x.professional_id = v.professional_id and x.status = 'rejected')
  from public.verifications v
  join public.profiles p on p.id = v.professional_id
  left join public.professionals pr on pr.id = v.professional_id
  left join auth.users u on u.id = v.professional_id
  where v.status = 'pending'
  order by v.created_at;
end;
$$;

-- Uma denúncia, com o que é preciso para decidir.
create function public.admin_report(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports;
  v jsonb;
begin
  select * into v_report from public.reports r where r.id = p_id;
  if not found then
    raise exception 'Denúncia não encontrada' using errcode = 'P0002';
  end if;
  if v_report.conversation_id is not null then
    perform private.admin_audit(v_admin, 'ver_conversa', v_report.conversation_id, jsonb_build_object('report', p_id));
  end if;

  select jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'details', r.details, 'created_at', r.created_at,
    'resolved_at', r.resolved_at, 'resolution', r.resolution,
    'reporter', jsonb_build_object('id', r.reporter_id, 'name', rp.full_name),
    'reported', jsonb_build_object('id', r.reported_id, 'name', rd.full_name, 'suspended_until', rd.suspended_until),
    'reported_total', (select count(*) from public.reports x where x.reported_id = r.reported_id),
    'previous', (
      select jsonb_build_object('reason', x.reason, 'created_at', x.created_at, 'resolution', x.resolution)
      from public.reports x
      where x.reported_id = r.reported_id and x.id <> r.id and x.created_at <= r.created_at
      order by x.created_at desc
      limit 1
    ),
    'conversation_id', r.conversation_id,
    'messages_total', (select count(*) from public.messages m where m.conversation_id = r.conversation_id),
    -- As últimas mensagens até a denúncia (o contexto do que foi denunciado).
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'created_at', m.created_at, 'sender_name', coalesce(nullif(btrim(pr.full_name), ''), 'Resolve'),
        'from_reported', m.sender_id = r.reported_id, 'kind', m.kind, 'body', m.body
      ) order by m.created_at)
      from (
        select * from public.messages x
        where x.conversation_id = r.conversation_id and x.created_at <= r.created_at
        order by x.created_at desc
        limit 8
      ) m
      left join public.profiles pr on pr.id = m.sender_id
    ), '[]'::jsonb)
  )
  into v
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles rd on rd.id = r.reported_id
  where r.id = p_id;

  return v;
end;
$$;

create or replace function public.admin_person(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_admin();
  select jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'email', u.email, 'phone', p.phone, 'role', p.role, 'avatar_url', p.avatar_url,
    'created_at', p.created_at, 'deleted_at', p.deleted_at, 'suspended_until', p.suspended_until,
    'pro', (
      select jsonb_build_object(
        'role_title', pr.role_title, 'verified', pr.verified, 'paused', pr.paused, 'paused_until', pr.paused_until,
        'rating', pr.rating, 'reviews', pr.review_count, 'jobs', pr.jobs_count, 'area', pr.base_area
      )
      from public.professionals pr where pr.id = p.id and p.role = 'profissional'
    ),
    'stats', jsonb_build_object(
      'requests', (select count(*) from public.requests r join public.conversations c on c.id = r.conversation_id where c.client_id = p.id),
      'orders', (select count(*) from public.orders o where p.id in (o.client_id, o.professional_id)),
      'done', (select count(*) from public.orders o where p.id in (o.client_id, o.professional_id) and o.status = 'concluido'),
      'canceled', (select count(*) from public.orders o where o.canceled_by = p.id),
      'canceled_late', (select count(*) from public.orders o where o.canceled_by = p.id and o.canceled_late),
      'reports_received', (select count(*) from public.reports r where r.reported_id = p.id),
      'reports_made', (select count(*) from public.reports r where r.reporter_id = p.id),
      'blocked_by', (select count(*) from public.blocks b where b.blocked_id = p.id)
    ),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reason', r.reason, 'details', r.details, 'created_at', r.created_at,
        'resolved_at', r.resolved_at, 'resolution', r.resolution, 'reporter', rp.full_name
      ) order by r.created_at desc)
      from (select * from public.reports x where x.reported_id = p.id order by x.created_at desc limit 10) r
      join public.profiles rp on rp.id = r.reporter_id
    ), '[]'::jsonb),
    'orders_recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'service', s.title, 'other', op.full_name, 'amount', o.amount, 'status', o.status,
        'scheduled_at', o.scheduled_at, 'scheduled_label', o.scheduled_label, 'created_at', o.created_at,
        'completed_at', o.completed_at, 'canceled_at', o.canceled_at, 'canceled_late', o.canceled_late,
        'canceled_by_self', o.canceled_by = p.id
      ) order by o.created_at desc)
      from (select * from public.orders x where p.id in (x.client_id, x.professional_id) order by x.created_at desc limit 5) o
      join public.services s on s.id = o.service_id
      join public.profiles op on op.id = case when o.client_id = p.id then o.professional_id else o.client_id end
    ), '[]'::jsonb)
  )
  into v
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_id;

  if v is null then
    raise exception 'Pessoa não encontrada' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

revoke execute on function public.admin_people(text, text, integer) from public, anon;
revoke execute on function public.admin_verifications() from public, anon;
revoke execute on function public.admin_report(uuid) from public, anon;
grant execute on function public.admin_people(text, text, integer) to authenticated;
grant execute on function public.admin_verifications() to authenticated;
grant execute on function public.admin_report(uuid) to authenticated;
