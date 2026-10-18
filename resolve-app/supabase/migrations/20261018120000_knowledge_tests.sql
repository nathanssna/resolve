-- =============================================================================
-- Teste de conhecimento por área + liberação do profissional.
--
-- O profissional só aparece para os clientes num serviço depois de:
--   1. passar no teste daquele serviço (professional_services.approved_at); e
--   2. ter a identidade confirmada (professionals.verified).
--
-- As questões ficam em private.quiz_questions (a primeira alternativa é a certa)
-- e nunca chegam ao app: start_quiz sorteia e embaralha, submit_quiz corrige.
-- O banco de questões é mantido em supabase/quiz/*.json → supabase/quiz.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Testes e questões
-- -----------------------------------------------------------------------------

create table public.quiz_tests (
  service_id text primary key references public.services (id) on delete cascade,
  draw integer not null check (draw > 0),
  pass integer not null check (pass > 0 and pass <= draw),
  minutes integer not null check (minutes > 0),
  retry_days integer not null default 3 check (retry_days >= 0)
);

comment on table public.quiz_tests is 'Regras do teste de cada serviço: questões sorteadas, acertos para passar, tempo e espera para tentar de novo.';

alter table public.quiz_tests enable row level security;
revoke insert, update, delete, truncate on public.quiz_tests from anon, authenticated;
create policy "quiz_tests: leitura pública" on public.quiz_tests
  for select to anon, authenticated
  using (true);

create table private.quiz_questions (
  id text primary key,
  service_id text not null references public.services (id) on delete cascade,
  topic text not null,
  question text not null,
  -- A primeira é a certa; start_quiz embaralha antes de mostrar.
  options text[] not null check (cardinality(options) = 4),
  why text not null default '',
  source text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index quiz_questions_service_idx on private.quiz_questions (service_id) where active;

create table private.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id text not null references public.services (id) on delete cascade,
  question_ids text[] not null,
  -- orders[i][j] = qual alternativa original aparece na posição j da questão i (0 = a certa).
  orders jsonb not null,
  answers smallint[],
  score integer,
  passed boolean,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  finished_at timestamptz
);

create index quiz_attempts_pro_idx on private.quiz_attempts (professional_id, service_id, started_at desc);

-- -----------------------------------------------------------------------------
-- Aprovação e liberação
-- -----------------------------------------------------------------------------

alter table public.professional_services add column approved_at timestamptz;
comment on column public.professional_services.approved_at is 'Quando passou no teste desse serviço. Sem isso o serviço não aparece para os clientes.';

alter table public.professionals add column released_at timestamptz;
comment on column public.professionals.released_at is 'Primeira vez que ficou liberado (identidade confirmada + algum teste aprovado).';
grant select (released_at) on public.professionals to anon, authenticated;

-- Os testes do banco (tests/db) ligam isto para as suítes antigas não dependerem do teste.
-- Só vale numa conexão direta como postgres; pelo app (authenticator) nunca.
create function private.qualification_skipped()
returns boolean
language sql
stable
set search_path = ''
as $$
  select session_user = 'postgres' and coalesce(current_setting('rezolveae.skip_qualification', true), '') = 'on'
$$;

create function private.serves(p_pro uuid, p_service text)
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
    where ps.professional_id = p_pro and ps.service_id = p_service and ps.approved_at is not null and p.verified
  )
$$;

create function private.released(p_pro uuid)
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
    where ps.professional_id = p_pro and ps.approved_at is not null and p.verified
  )
$$;

revoke all on function private.qualification_skipped() from public, anon, authenticated;
revoke all on function private.serves(uuid, text) from public, anon, authenticated;
revoke all on function private.released(uuid) from public, anon, authenticated;

-- Marca a liberação (uma vez) e avisa. Devolve true se liberou agora.
create function private.refresh_release(p_pro uuid)
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
    where ps.professional_id = p_pro and ps.approved_at is not null and p.verified
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

revoke all on function private.refresh_release(uuid) from public, anon, authenticated;

-- Ninguém escreve approved_at pelo app: ao (re)incluir um serviço, vale o que já foi aprovado antes.
create function private.professional_service_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.approved_at := (
    select max(a.finished_at) from private.quiz_attempts a
    where a.professional_id = new.professional_id and a.service_id = new.service_id and a.passed
  );
  return new;
end;
$$;

revoke all on function private.professional_service_approval() from public, anon, authenticated;

create trigger professional_services_approval before insert on public.professional_services
  for each row execute function private.professional_service_approval();

-- Cliente só vê o serviço aprovado de quem está com a identidade confirmada. O dono vê os seus.
drop policy "professional_services: leitura pública" on public.professional_services;
create policy "professional_services: leitura pública" on public.professional_services
  for select to anon, authenticated
  using (
    professional_id = (select auth.uid())
    or (
      approved_at is not null
      and exists (select 1 from public.professionals p where p.id = professional_services.professional_id and p.verified)
    )
    or (session_user = 'postgres' and coalesce(current_setting('rezolveae.skip_qualification', true), '') = 'on')
  );

-- Conversa nova só com profissional liberado; pedido só no serviço em que ele foi aprovado.
create or replace function private.check_professional_accepting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro uuid;
begin
  if tg_table_name = 'conversations' then
    -- open_conversation insere com "on conflict do nothing": conversa que já existe segue abrindo.
    if exists (
      select 1 from public.conversations c
      where c.client_id = new.client_id and c.professional_id = new.professional_id
    ) then
      return new;
    end if;
    v_pro := new.professional_id;
    if not private.released(v_pro) then
      raise exception 'Este profissional ainda não está liberado para receber pedidos' using errcode = 'P0001';
    end if;
  else
    select c.professional_id into v_pro from public.conversations c where c.id = new.conversation_id;
    if not private.serves(v_pro, new.service_id) then
      raise exception 'Este profissional não atende esse serviço' using errcode = 'P0001';
    end if;
  end if;

  if exists (select 1 from public.professionals p where p.id = v_pro and p.paused) then
    raise exception 'Este profissional não está recebendo pedidos no momento' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Identidade aprovada: se já tem teste aprovado, o aviso é o de liberado.
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
        case when v_pro then 'Falta passar no teste da sua área para aparecer aos clientes.' else 'Obrigado. Você já pode usar a Rezolveaê normalmente.' end,
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

-- Conta excluída: as tentativas vão junto.
create function private.drop_quiz_attempts_of_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from private.quiz_attempts where professional_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function private.drop_quiz_attempts_of_deleted() from public, anon, authenticated;

create trigger profiles_drop_quiz_attempts after update of deleted_at on public.profiles
  for each row execute function private.drop_quiz_attempts_of_deleted();

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Tentativa aberta que passou do prazo vira reprovada (conta para a espera).
create function private.close_expired_attempts(p_pro uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.quiz_attempts
  set score = coalesce(score, 0), passed = false, finished_at = deadline_at
  where professional_id = p_pro and finished_at is null and now() > deadline_at + interval '1 minute'
$$;

revoke all on function private.close_expired_attempts(uuid) from public, anon, authenticated;

-- Situação dos testes de cada serviço da ficha.
create function public.quiz_status()
returns table (
  service_id text,
  title text,
  draw integer,
  pass integer,
  minutes integer,
  available boolean,
  approved_at timestamptz,
  open_attempt uuid,
  deadline_at timestamptz,
  last_score integer,
  retry_at timestamptz
)
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
  perform private.close_expired_attempts(v_uid);

  return query
  select
    ps.service_id,
    s.title,
    t.draw,
    t.pass,
    t.minutes,
    (t.service_id is not null and (select count(*) from private.quiz_questions q where q.service_id = ps.service_id and q.active) >= t.draw),
    ps.approved_at,
    o.id,
    o.deadline_at,
    l.score,
    case when l.passed = false and l.finished_at + make_interval(days => t.retry_days) > now()
      then l.finished_at + make_interval(days => t.retry_days) end
  from public.professional_services ps
  join public.services s on s.id = ps.service_id
  left join public.quiz_tests t on t.service_id = ps.service_id
  left join lateral (
    select a.id, a.deadline_at from private.quiz_attempts a
    where a.professional_id = v_uid and a.service_id = ps.service_id and a.finished_at is null
    order by a.started_at desc limit 1
  ) o on true
  left join lateral (
    select a.score, a.passed, a.finished_at from private.quiz_attempts a
    where a.professional_id = v_uid and a.service_id = ps.service_id and a.finished_at is not null
    order by a.finished_at desc limit 1
  ) l on true
  where ps.professional_id = v_uid
  order by s.sort_order;
end;
$$;

-- Questões de uma tentativa, na ordem e com as alternativas embaralhadas (sem dizer qual é a certa).
create function private.attempt_payload(p_attempt uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'attempt_id', a.id,
    'service_id', a.service_id,
    'deadline_at', a.deadline_at,
    'total', cardinality(a.question_ids),
    'pass', t.pass,
    'questions', (
      select jsonb_agg(
        jsonb_build_object(
          'question', q.question,
          'source', q.source,
          'options', (
            select jsonb_agg(q.options[(ord.value)::int + 1] order by ord.idx)
            from jsonb_array_elements_text(a.orders -> (qi.n - 1)::int) with ordinality as ord (value, idx)
          )
        )
        order by qi.n
      )
      from unnest(a.question_ids) with ordinality as qi (id, n)
      join private.quiz_questions q on q.id = qi.id
    )
  )
  from private.quiz_attempts a
  join public.quiz_tests t on t.service_id = a.service_id
  where a.id = p_attempt
$$;

revoke all on function private.attempt_payload(uuid) from public, anon, authenticated;

create function public.start_quiz(p_service_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_test public.quiz_tests;
  v_open uuid;
  v_last private.quiz_attempts;
  v_ids text[];
  v_orders jsonb;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  if not exists (select 1 from public.professional_services where professional_id = v_uid and service_id = p_service_id) then
    raise exception 'Escolha esse serviço na sua ficha antes de fazer o teste' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.professional_services where professional_id = v_uid and service_id = p_service_id and approved_at is not null) then
    raise exception 'Você já passou neste teste' using errcode = 'P0001';
  end if;

  select * into v_test from public.quiz_tests where service_id = p_service_id;
  if not found or (select count(*) from private.quiz_questions where service_id = p_service_id and active) < v_test.draw then
    raise exception 'O teste deste serviço ainda não está disponível' using errcode = 'P0001';
  end if;

  perform private.close_expired_attempts(v_uid);

  -- Saiu e voltou dentro do prazo: as mesmas questões.
  select id into v_open from private.quiz_attempts
  where professional_id = v_uid and service_id = p_service_id and finished_at is null
  order by started_at desc limit 1;
  if v_open is not null then
    return private.attempt_payload(v_open);
  end if;

  select * into v_last from private.quiz_attempts
  where professional_id = v_uid and service_id = p_service_id and finished_at is not null
  order by finished_at desc limit 1;
  if found and not v_last.passed and v_last.finished_at + make_interval(days => v_test.retry_days) > now() then
    raise exception 'Você pode fazer o teste de novo a partir de %',
      to_char(v_last.finished_at + make_interval(days => v_test.retry_days), 'DD/MM')
      using errcode = 'P0001';
  end if;

  -- Sorteio espalhado pelos assuntos: uma de cada assunto por rodada, em ordem aleatória.
  select array_agg(id order by random()) into v_ids
  from (
    select id from (
      select id, row_number() over (partition by topic order by random()) as rn
      from private.quiz_questions where service_id = p_service_id and active
    ) ranked
    order by rn, random()
    limit v_test.draw
  ) picked;

  select jsonb_agg((select jsonb_agg(i order by random()) from generate_series(0, 3) i)) into v_orders
  from generate_series(1, cardinality(v_ids));

  insert into private.quiz_attempts (professional_id, service_id, question_ids, orders, deadline_at)
  values (v_uid, p_service_id, v_ids, v_orders, now() + make_interval(mins => v_test.minutes))
  returning id into v_id;

  return private.attempt_payload(v_id);
end;
$$;

create function public.submit_quiz(p_attempt_id uuid, p_answers integer[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt private.quiz_attempts;
  v_test public.quiz_tests;
  v_total integer;
  v_score integer := 0;
  v_late boolean;
  v_passed boolean;
  v_released boolean := false;
  i integer;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  select * into v_attempt from private.quiz_attempts where id = p_attempt_id and professional_id = v_uid for update;
  if not found then
    raise exception 'Teste não encontrado' using errcode = 'P0002';
  end if;
  if v_attempt.finished_at is not null then
    raise exception 'Este teste já foi encerrado' using errcode = 'P0001';
  end if;

  v_total := cardinality(v_attempt.question_ids);
  if coalesce(cardinality(p_answers), 0) <> v_total then
    raise exception 'Responda todas as questões' using errcode = '22023';
  end if;

  for i in 1..v_total loop
    if p_answers[i] between 0 and 3 and (v_attempt.orders -> (i - 1) ->> p_answers[i])::int = 0 then
      v_score := v_score + 1;
    end if;
  end loop;

  select * into v_test from public.quiz_tests where service_id = v_attempt.service_id;
  v_late := now() > v_attempt.deadline_at + interval '1 minute';
  v_passed := not v_late and v_score >= v_test.pass;

  update private.quiz_attempts
  set answers = p_answers::smallint[], score = v_score, passed = v_passed, finished_at = least(now(), deadline_at + interval '1 minute')
  where id = p_attempt_id;

  if v_passed then
    update public.professional_services set approved_at = now()
    where professional_id = v_uid and service_id = v_attempt.service_id;
    v_released := private.refresh_release(v_uid);
  end if;

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'pass', v_test.pass,
    'passed', v_passed,
    'late', v_late,
    'released', v_released,
    'retry_at', case when v_passed then null else now() + make_interval(days => v_test.retry_days) end
  );
end;
$$;

revoke all on function public.quiz_status() from public, anon;
revoke all on function public.start_quiz(text) from public, anon;
revoke all on function public.submit_quiz(uuid, integer[]) from public, anon;
grant execute on function public.quiz_status() to authenticated;
grant execute on function public.start_quiz(text) to authenticated;
grant execute on function public.submit_quiz(uuid, integer[]) to authenticated;
