-- =============================================================================
-- Área de moderação no app (/admin), só para administradores com MFA.
--
-- Administrador: uma linha em private.admins, gravada só por SQL no painel do
-- Supabase (nenhuma tela dá esse poder):
--   insert into private.admins (user_id)
--   select id from auth.users where email = 'fulano@exemplo.com';
-- As funções admin_* conferem, a cada chamada, que quem chama é administrador
-- E entrou com o segundo fator (aal2: código do app autenticador). Toda ação,
-- e toda leitura de conversa denunciada, fica em private.admin_log.
--
-- Suspensão: profiles.suspended_until (infinity = sem prazo). Suspensa, a
-- conta não abre conversa, não faz pedido, não manda mensagem nem proposta; o
-- profissional também fica pausado (fora das listas) até a data.
-- =============================================================================

create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table private.admin_log (
  id bigserial primary key,
  admin_id uuid not null,
  action text not null,
  target_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index admin_log_created_idx on private.admin_log (created_at desc);

-- Sem grant de leitura: só as funções admin_* e my_pause() leem.
alter table public.profiles add column suspended_until timestamptz;

comment on column public.profiles.suspended_until is 'Suspensa pela moderação até esta data (infinity = sem prazo).';

alter table public.reports
  add column resolution text check (char_length(resolution) <= 300),
  add column resolved_by uuid references public.profiles (id) on delete set null;

create index reports_resolved_by_idx on public.reports (resolved_by);

-- -----------------------------------------------------------------------------
-- Quem é administrador
-- -----------------------------------------------------------------------------

-- Para o app mostrar a entrada do painel (não exige o segundo fator).
create function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.admins a where a.user_id = (select auth.uid()));
$$;

-- Administrador com o segundo fator nesta sessão (usado em políticas).
create function private.is_admin_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.admins a where a.user_id = (select auth.uid()))
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

-- Barra quem não é administrador com o segundo fator; devolve o id dele.
create function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from private.admins a where a.user_id = v_uid) then
    raise exception 'Acesso restrito' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Confirme o código do app autenticador' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

create function private.admin_audit(p_admin uuid, p_action text, p_target uuid, p_details jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.admin_log (admin_id, action, target_id, details)
  values (p_admin, p_action, p_target, coalesce(p_details, '{}'));
$$;

-- -----------------------------------------------------------------------------
-- Leitura
-- -----------------------------------------------------------------------------

-- Números do período: 1 = hoje (desde 0h em Brasília); senão, os últimos N dias.
create function public.admin_overview(p_days integer default 7)
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

-- Pessoas, da mais recente; busca por nome ou e-mail.
create function public.admin_people(p_query text default '', p_filter text default 'todos', p_limit integer default 50)
returns table (
  id uuid, name text, email text, role public.user_role, created_at timestamptz,
  deleted boolean, suspended_until timestamptz, verified boolean, paused boolean
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
  select p.id, p.full_name, u.email::text, p.role, p.created_at, p.deleted_at is not null, p.suspended_until,
    coalesce(pr.verified, false), coalesce(pr.paused, false)
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.professionals pr on pr.id = p.id
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

-- Ficha de uma pessoa: conta, ficha de profissional, números, denúncias e últimos serviços.
create function public.admin_person(p_id uuid)
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
      select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'details', r.details, 'created_at', r.created_at, 'resolved_at', r.resolved_at) order by r.created_at desc)
      from (select * from public.reports x where x.reported_id = p.id order by x.created_at desc limit 5) r
    ), '[]'::jsonb),
    'orders_recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'service', s.title, 'other', op.full_name, 'amount', o.amount, 'status', o.status,
        'scheduled_at', o.scheduled_at, 'scheduled_label', o.scheduled_label, 'created_at', o.created_at, 'canceled_late', o.canceled_late
      ) order by o.created_at desc)
      from (select * from public.orders x where p.id in (x.client_id, x.professional_id) order by x.created_at desc limit 10) o
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

-- Serviços combinados, do mais recente (status opcional).
create function public.admin_orders(p_status public.order_status default null, p_limit integer default 50)
returns table (
  id uuid, service text, client_id uuid, client_name text, professional_id uuid, pro_name text, amount numeric,
  status public.order_status, scheduled_at timestamptz, scheduled_label text, created_at timestamptz,
  canceled_late boolean, cancel_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select o.id, s.title, o.client_id, c.full_name, o.professional_id, pp.full_name, o.amount, o.status,
    o.scheduled_at, o.scheduled_label, o.created_at, o.canceled_late, o.cancel_reason
  from public.orders o
  join public.services s on s.id = o.service_id
  join public.profiles c on c.id = o.client_id
  join public.profiles pp on pp.id = o.professional_id
  where p_status is null or o.status = p_status
  order by o.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Denúncias abertas (ou resolvidas), com quantas a pessoa denunciada já recebeu.
create function public.admin_reports(p_open boolean default true, p_limit integer default 50)
returns table (
  id uuid, reason text, details text, created_at timestamptz, resolved_at timestamptz, resolution text,
  reporter_id uuid, reporter_name text, reported_id uuid, reported_name text, conversation_id uuid, reported_total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select r.id, r.reason, r.details, r.created_at, r.resolved_at, r.resolution,
    r.reporter_id, rp.full_name, r.reported_id, rd.full_name, r.conversation_id,
    (select count(*) from public.reports x where x.reported_id = r.reported_id)
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles rd on rd.id = r.reported_id
  where (coalesce(p_open, true) and r.resolved_at is null) or (not coalesce(p_open, true) and r.resolved_at is not null)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- A conversa de uma denúncia (só por meio dela; a leitura fica registrada).
create function public.admin_report_conversation(p_report_id uuid)
returns table (id uuid, created_at timestamptz, sender_name text, from_reported boolean, kind text, body text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports;
begin
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found or v_report.conversation_id is null then
    raise exception 'Esta denúncia não tem conversa' using errcode = 'P0002';
  end if;
  perform private.admin_audit(v_admin, 'ver_conversa', v_report.conversation_id, jsonb_build_object('report', p_report_id));
  return query
  select m.id, m.created_at, coalesce(nullif(btrim(pr.full_name), ''), 'Resolve'), m.sender_id = v_report.reported_id, m.kind::text, m.body
  from public.messages m
  left join public.profiles pr on pr.id = m.sender_id
  where m.conversation_id = v_report.conversation_id
  order by m.created_at;
end;
$$;

-- Pedidos de selo esperando análise, do mais antigo.
create function public.admin_verifications()
returns table (
  id uuid, professional_id uuid, name text, email text, created_at timestamptz,
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
  select v.id, v.professional_id, p.full_name, u.email::text, v.created_at, v.document_path, v.selfie_path,
    (select count(*) from public.verifications x where x.professional_id = v.professional_id and x.status = 'rejected')
  from public.verifications v
  join public.profiles p on p.id = v.professional_id
  left join auth.users u on u.id = v.professional_id
  where v.status = 'pending'
  order by v.created_at;
end;
$$;

-- O administrador abre as fotos (URL assinada, que expira).
create policy "verification: administrador vê" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification' and private.is_admin_session());

-- -----------------------------------------------------------------------------
-- Ações
-- -----------------------------------------------------------------------------

create function public.admin_review_verification(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300);
begin
  if not p_approve and v_reason is null then
    raise exception 'Escreva o motivo da recusa' using errcode = 'P0001';
  end if;
  -- O trigger da verificação liga o selo e avisa o profissional.
  update public.verifications
  set status = case when p_approve then 'approved' else 'rejected' end::public.verification_status,
      reason = case when p_approve then null else v_reason end
  where id = p_id and status = 'pending';
  if not found then
    raise exception 'Esta verificação já foi analisada' using errcode = 'P0001';
  end if;
  perform private.admin_audit(v_admin, case when p_approve then 'aprovar_selo' else 'recusar_selo' end, p_id, jsonb_build_object('reason', v_reason));
end;
$$;

create function public.admin_resolve_report(p_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_resolution text := left(nullif(btrim(coalesce(p_resolution, '')), ''), 300);
begin
  update public.reports set resolved_at = now(), resolution = v_resolution, resolved_by = v_admin
  where id = p_id and resolved_at is null;
  if not found then
    raise exception 'Esta denúncia já foi resolvida' using errcode = 'P0001';
  end if;
  perform private.admin_audit(v_admin, 'resolver_denuncia', p_id, jsonb_build_object('resolution', v_resolution));
end;
$$;

-- Suspende por N dias (null = sem prazo). Devolve até quando.
create function public.admin_suspend(p_user uuid, p_days integer default null, p_reason text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_until timestamptz;
begin
  if p_user = v_admin then
    raise exception 'Você não pode suspender a própria conta' using errcode = 'P0001';
  end if;
  if p_days is not null and p_days < 1 then
    raise exception 'Escolha pelo menos 1 dia' using errcode = 'P0001';
  end if;
  v_until := case when p_days is null then 'infinity'::timestamptz else now() + make_interval(days => p_days) end;

  update public.profiles set suspended_until = v_until where id = p_user and deleted_at is null;
  if not found then
    raise exception 'Pessoa não encontrada' using errcode = 'P0002';
  end if;
  -- Profissional: fora das listas até a data (a pausa automática segura até lá).
  update public.professionals set paused = true, paused_until = v_until where id = p_user;

  perform private.admin_audit(v_admin, 'suspender', p_user, jsonb_build_object('days', p_days, 'reason', left(p_reason, 300)));
  perform private.push_to_user(
    p_user,
    'Sua conta foi suspensa',
    case when p_days is null then 'Fale com a gente pela Ajuda do app.'
      else 'Até ' || to_char(v_until at time zone 'America/Sao_Paulo', 'DD/MM') || '. Fale com a gente pela Ajuda do app.' end,
    '/ajuda'
  );
  return v_until;
end;
$$;

create function public.admin_unsuspend(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  update public.profiles set suspended_until = null where id = p_user and suspended_until is not null;
  if not found then
    raise exception 'Esta conta não está suspensa' using errcode = 'P0001';
  end if;
  update public.professionals set paused = false, paused_until = null where id = p_user;
  perform private.admin_audit(v_admin, 'reativar', p_user, '{}');
  perform private.push_to_user(p_user, 'Sua conta foi reativada', 'Você já pode usar o Resolve normalmente.', '/');
end;
$$;

-- -----------------------------------------------------------------------------
-- Conta suspensa não age
-- -----------------------------------------------------------------------------

create function private.check_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  -- Mensagens: só o que a própria pessoa escreve (avisos do sistema passam).
  if tg_table_name = 'messages' then
    if new.sender_id is distinct from (select auth.uid()) then
      return new;
    end if;
  end if;
  select p.suspended_until into v_until from public.profiles p where p.id = (select auth.uid());
  if v_until > now() then
    raise exception 'Sua conta está suspensa%. Fale com a gente pela Ajuda do app.',
      case when v_until = 'infinity' then '' else ' até ' || to_char(v_until at time zone 'America/Sao_Paulo', 'DD/MM') end
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger conversations_not_suspended before insert on public.conversations
  for each row execute function private.check_not_suspended();
create trigger requests_not_suspended before insert on public.requests
  for each row execute function private.check_not_suspended();
create trigger messages_not_suspended before insert on public.messages
  for each row execute function private.check_not_suspended();
create trigger proposals_not_suspended before insert on public.proposals
  for each row execute function private.check_not_suspended();

-- O profissional vê até quando está pausado e se é suspensão da moderação.
drop function public.my_pause_until();

create function public.my_pause()
returns table (until timestamptz, suspended boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.paused_until, coalesce(p.suspended_until > now(), false)
  from public.professionals pr
  join public.profiles p on p.id = pr.id
  where pr.id = (select auth.uid()) and pr.paused_until > now();
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

revoke all on function private.is_admin_session() from public, anon;
grant execute on function private.is_admin_session() to authenticated;
revoke all on function private.require_admin() from public, anon, authenticated;
revoke all on function private.admin_audit(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.check_not_suspended() from public, anon, authenticated;

revoke execute on function public.am_i_admin() from public, anon;
revoke execute on function public.admin_overview(integer) from public, anon;
revoke execute on function public.admin_people(text, text, integer) from public, anon;
revoke execute on function public.admin_person(uuid) from public, anon;
revoke execute on function public.admin_orders(public.order_status, integer) from public, anon;
revoke execute on function public.admin_reports(boolean, integer) from public, anon;
revoke execute on function public.admin_report_conversation(uuid) from public, anon;
revoke execute on function public.admin_verifications() from public, anon;
revoke execute on function public.admin_review_verification(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, text) from public, anon;
revoke execute on function public.admin_suspend(uuid, integer, text) from public, anon;
revoke execute on function public.admin_unsuspend(uuid) from public, anon;
revoke execute on function public.my_pause() from public, anon;

grant execute on function public.am_i_admin() to authenticated;
grant execute on function public.admin_overview(integer) to authenticated;
grant execute on function public.admin_people(text, text, integer) to authenticated;
grant execute on function public.admin_person(uuid) to authenticated;
grant execute on function public.admin_orders(public.order_status, integer) to authenticated;
grant execute on function public.admin_reports(boolean, integer) to authenticated;
grant execute on function public.admin_report_conversation(uuid) to authenticated;
grant execute on function public.admin_verifications() to authenticated;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
grant execute on function public.admin_suspend(uuid, integer, text) to authenticated;
grant execute on function public.admin_unsuspend(uuid) to authenticated;
grant execute on function public.my_pause() to authenticated;
