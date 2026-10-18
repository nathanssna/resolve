-- =============================================================================
-- Aulas da Rezolveaê: 4º passo obrigatório da entrada do profissional.
--
-- O conteúdo das aulas fica no app (src/content/lessons.ts); aqui ficam só os ids
-- e quem concluiu cada uma. Liberado agora = identidade + teste aprovado + todas as aulas.
-- =============================================================================

create table public.lessons (
  id text primary key,
  sort_order integer not null default 0,
  active boolean not null default true
);

comment on table public.lessons is 'Aulas obrigatórias (ids iguais aos de src/content/lessons.ts).';

alter table public.lessons enable row level security;
revoke insert, update, delete, truncate on public.lessons from anon, authenticated;
create policy "lessons: leitura pública" on public.lessons for select to anon, authenticated using (true);

insert into public.lessons (id, sort_order) values
  ('orcamento', 1), ('fotos', 2), ('chat', 3), ('data', 4), ('mei', 5);

create table public.lesson_progress (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  lesson_id text not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (professional_id, lesson_id)
);

alter table public.lesson_progress enable row level security;
revoke insert, update, delete, truncate on public.lesson_progress from anon, authenticated;
create policy "lesson_progress: o próprio lê" on public.lesson_progress
  for select to authenticated
  using (professional_id = (select auth.uid()));

-- Concluiu todas as aulas ativas (fica no profissional para a regra de quem aparece ser simples).
alter table public.professionals add column lessons_done_at timestamptz;
comment on column public.professionals.lessons_done_at is 'Quando concluiu todas as aulas da Rezolveaê.';
grant select (lessons_done_at) on public.professionals to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Regra de liberação: + aulas
-- -----------------------------------------------------------------------------

create or replace function private.serves(p_pro uuid, p_service text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.qualification_skipped() or exists (
    select 1
    from public.professional_services ps
    join public.professionals p on p.id = ps.professional_id
    where ps.professional_id = p_pro and ps.service_id = p_service and ps.approved_at is not null
      and p.verified and p.lessons_done_at is not null
  )
$$;

create or replace function private.released(p_pro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.qualification_skipped() or exists (
    select 1
    from public.professional_services ps
    join public.professionals p on p.id = ps.professional_id
    where ps.professional_id = p_pro and ps.approved_at is not null and p.verified and p.lessons_done_at is not null
  )
$$;

create or replace function private.refresh_release(p_pro uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_services text;
begin
  if not exists (
    select 1 from public.professional_services ps join public.professionals p on p.id = ps.professional_id
    where ps.professional_id = p_pro and ps.approved_at is not null and p.verified and p.lessons_done_at is not null
  ) then
    return false;
  end if;
  update public.professionals set released_at = now() where id = p_pro and released_at is null;
  if not found then
    return false;
  end if;
  select string_agg(s.title, ', ' order by s.sort_order) into v_services
  from public.professional_services ps join public.services s on s.id = ps.service_id
  where ps.professional_id = p_pro and ps.approved_at is not null;
  perform private.push_to_user(p_pro, 'Pronto, você foi liberado', format('Seu perfil já aparece para clientes de %s.', v_services), '/inicio');
  return true;
end;
$$;

drop policy "professional_services: leitura pública" on public.professional_services;
create policy "professional_services: leitura pública" on public.professional_services
  for select to anon, authenticated
  using (
    professional_id = (select auth.uid())
    or (
      approved_at is not null
      and exists (
        select 1 from public.professionals p
        where p.id = professional_services.professional_id and p.verified and p.lessons_done_at is not null
      )
    )
    or (session_user = 'postgres' and coalesce(current_setting('rezolveae.skip_qualification', true), '') = 'on')
  );

-- Identidade aprovada sem os outros passos: o aviso aponta para o que falta.
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
        if private.refresh_release(new.user_id) then
          return new;
        end if;
      end if;
      perform private.push_to_user(
        new.user_id,
        'Identidade confirmada',
        case when v_pro then 'Falta pouco: veja no Início o que ainda falta para aparecer aos clientes.' else 'Obrigado. Você já pode usar a Rezolveaê normalmente.' end,
        case when v_pro then '/inicio' else '/verificacao' end
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

-- -----------------------------------------------------------------------------
-- Concluir uma aula (o app confere as perguntas; aqui fica o registro)
-- -----------------------------------------------------------------------------

create function public.complete_lesson(p_lesson_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_done integer;
  v_total integer;
  v_released boolean := false;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  if not exists (select 1 from public.professionals where id = v_uid) then
    raise exception 'Só profissionais fazem as aulas' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.lessons where id = p_lesson_id and active) then
    raise exception 'Aula não encontrada' using errcode = 'P0002';
  end if;

  insert into public.lesson_progress (professional_id, lesson_id) values (v_uid, p_lesson_id)
  on conflict do nothing;

  select count(*) filter (where lp.lesson_id is not null), count(*) into v_done, v_total
  from public.lessons l
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.professional_id = v_uid
  where l.active;

  if v_done = v_total then
    update public.professionals set lessons_done_at = now() where id = v_uid and lessons_done_at is null;
    v_released := private.refresh_release(v_uid);
  end if;

  return jsonb_build_object('done', v_done, 'total', v_total, 'released', v_released);
end;
$$;

revoke all on function public.complete_lesson(text) from public, anon;
grant execute on function public.complete_lesson(text) to authenticated;
