-- =============================================================================
-- Verificação de identidade para qualquer conta (antes, só profissionais).
--
-- verifications.professional_id vira user_id (qualquer perfil). Quem pode
-- enviar: profissional (para o selo) ou quem teve a verificação pedida pela
-- moderação (admin_require_verification). Aprovar marca
-- profiles.identity_verified_at; no profissional, liga também o selo.
--
-- Verificação pedida e ainda não aprovada: a conta não abre conversa nem faz
-- pedido ou proposta novos (o chat e o que já foi combinado continuam).
--
-- O profissional vê no pedido em aberto (client_track_record) se o cliente
-- informou telefone e se a identidade foi confirmada. Quando houver SMS,
-- "telefone informado" vira "telefone confirmado".
-- =============================================================================

alter table public.profiles
  add column identity_verified_at timestamptz,
  add column verification_required_at timestamptz;

comment on column public.profiles.identity_verified_at is 'Identidade confirmada pela moderação (documento + selfie).';
comment on column public.profiles.verification_required_at is 'A moderação pediu a verificação; até aprovar, sem pedidos e propostas novos.';

-- Quem já foi aprovado ganha a data.
update public.profiles p set identity_verified_at = v.reviewed_at
from public.verifications v
where v.professional_id = p.id and v.status = 'approved' and p.identity_verified_at is null;

alter table public.verifications rename column professional_id to user_id;
alter table public.verifications drop constraint verifications_professional_id_fkey;
alter table public.verifications add constraint verifications_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
alter index public.verifications_professional_idx rename to verifications_user_idx;

comment on table public.verifications is 'Verificações de identidade (documento + selfie). Revise no painel do app ou aqui: status approved/rejected (+ reason).';

-- Profissional, ou quem teve a verificação pedida (lê colunas sem grant: security definer).
create function private.may_send_verification()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.professionals pr where pr.id = (select auth.uid()))
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.verification_required_at is not null);
$$;

revoke all on function private.may_send_verification() from public, anon;
grant execute on function private.may_send_verification() to authenticated;

drop policy "verifications: o profissional envia" on public.verifications;
create policy "verifications: quem pode envia" on public.verifications
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.may_send_verification()
    and document_path like (select auth.uid())::text || '/%'
    and selfie_path like (select auth.uid())::text || '/%'
  );

create or replace function private.on_verification_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro boolean := exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'profissional');
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    new.reviewed_at := now();
    if new.status = 'approved' then
      update public.profiles set identity_verified_at = now(), verification_required_at = null where id = new.user_id;
      if v_pro then
        update public.professionals set verified = true where id = new.user_id;
      end if;
      perform private.push_to_user(
        new.user_id,
        'Identidade confirmada',
        case when v_pro then 'Seu perfil agora tem o selo Verificado.' else 'Obrigado. Você já pode usar o Resolve normalmente.' end,
        '/verificacao'
      );
    else
      perform private.push_to_user(
        new.user_id,
        'Não deu para confirmar sua identidade',
        coalesce(nullif(btrim(new.reason), ''), 'Veja o motivo no app e envie de novo.'),
        '/verificacao'
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.drop_verifications_of_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.verifications where user_id = new.id;
  end if;
  return null;
end;
$$;

-- Verificação pedida e não aprovada: sem conversa, pedido ou proposta novos.
create function private.check_verification_required()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.verification_required_at is not null and p.identity_verified_at is null
  ) then
    raise exception 'Confirme sua identidade para continuar: Perfil → Verificação de identidade.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.check_verification_required() from public, anon, authenticated;

create trigger conversations_verification_required before insert on public.conversations
  for each row execute function private.check_verification_required();
create trigger requests_verification_required before insert on public.requests
  for each row execute function private.check_verification_required();
create trigger proposals_verification_required before insert on public.proposals
  for each row execute function private.check_verification_required();

-- A própria pessoa: a verificação foi pedida? Já está confirmada?
create function public.my_verification()
returns table (required boolean, verified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.verification_required_at is not null and p.identity_verified_at is null, p.identity_verified_at is not null
  from public.profiles p where p.id = (select auth.uid());
$$;

-- Moderação pede (ou dispensa) a verificação de alguém.
create function public.admin_require_verification(p_user uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  update public.profiles set verification_required_at = now()
  where id = p_user and deleted_at is null and identity_verified_at is null and verification_required_at is null;
  if not found then
    raise exception 'Esta conta já está verificada ou já teve a verificação pedida' using errcode = 'P0001';
  end if;
  perform private.admin_audit(v_admin, 'pedir_verificacao', p_user, jsonb_build_object('reason', left(p_reason, 300)));
  perform private.push_to_user(p_user, 'Precisamos confirmar sua identidade', 'Envie um documento com foto e uma selfie para continuar pedindo serviços.', '/verificacao');
end;
$$;

create function public.admin_waive_verification(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  update public.profiles set verification_required_at = null where id = p_user and verification_required_at is not null;
  if not found then
    raise exception 'Esta conta não tem verificação pedida' using errcode = 'P0001';
  end if;
  perform private.admin_audit(v_admin, 'dispensar_verificacao', p_user, '{}');
end;
$$;

drop function public.admin_verifications();

create function public.admin_verifications()
returns table (
  id uuid, user_id uuid, role public.user_role, name text, email text, role_title text, created_at timestamptz,
  document_path text, selfie_path text, rejected_before bigint, required boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select v.id, v.user_id, p.role, p.full_name, u.email::text, pr.role_title, v.created_at, v.document_path, v.selfie_path,
    (select count(*) from public.verifications x where x.user_id = v.user_id and x.status = 'rejected'),
    p.verification_required_at is not null
  from public.verifications v
  join public.profiles p on p.id = v.user_id
  left join public.professionals pr on pr.id = v.user_id and p.role = 'profissional'
  left join auth.users u on u.id = v.user_id
  where v.status = 'pending'
  order by v.created_at;
end;
$$;

-- Para o profissional: o que se sabe do cliente.
drop function public.client_track_record(uuid);

create function public.client_track_record(p_client_id uuid)
returns table (done integer, late_cancels integer, has_phone boolean, identity_verified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.done, r.late_cancels, r.has_phone, r.identity_verified
  from (
    select
      (select count(*) from public.orders o where o.client_id = p_client_id and o.status = 'concluido')::integer as done,
      (select count(*) from public.orders o where o.client_id = p_client_id and o.canceled_late and o.canceled_by = o.client_id)::integer as late_cancels,
      coalesce(btrim(p.phone), '') <> '' as has_phone,
      p.identity_verified_at is not null as identity_verified
    from public.profiles p
    where p.id = p_client_id
  ) r
  where exists (
    select 1 from public.conversations c
    where c.client_id = p_client_id and c.professional_id = (select auth.uid())
  );
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
    'identity_verified_at', p.identity_verified_at, 'verification_required_at', p.verification_required_at,
    'verification_pending', exists (select 1 from public.verifications v where v.user_id = p.id and v.status = 'pending'),
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


revoke execute on function public.my_verification() from public, anon;
revoke execute on function public.admin_require_verification(uuid, text) from public, anon;
revoke execute on function public.admin_waive_verification(uuid) from public, anon;
revoke execute on function public.admin_verifications() from public, anon;
revoke execute on function public.client_track_record(uuid) from public, anon;
grant execute on function public.my_verification() to authenticated;
grant execute on function public.admin_require_verification(uuid, text) to authenticated;
grant execute on function public.admin_waive_verification(uuid) to authenticated;
grant execute on function public.admin_verifications() to authenticated;
grant execute on function public.client_track_record(uuid) to authenticated;
