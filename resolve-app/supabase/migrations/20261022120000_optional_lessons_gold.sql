-- =============================================================================
-- Aulas opcionais + perguntas das aulas no servidor + Profissional de Ouro.
--
-- 1. As aulas deixam de travar a liberação: volta a ser identidade + teste aprovado.
-- 2. As perguntas das aulas saem do app e vêm para o banco, como no teste da área:
--    8 por aula, passa com 7, e quem não passa espera 3 dias. complete_lesson
--    (que confiava no app) sai. Concluir as cinco grava professionals.lessons_done_at.
-- 3. Profissional de Ouro (professionals.gold_at), marca que o cliente vê: aulas
--    concluídas + 10 serviços + nota 4,7 com 5 avaliações + pontualidade (90% de "Sim"
--    em "Chegou no horário combinado?", pergunta nova da avaliação, e menos de 5% de
--    cancelamentos em cima da hora em 90 dias). Sai se ele deixar de cumprir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Liberação sem as aulas
-- -----------------------------------------------------------------------------

comment on table public.lessons is 'Aulas opcionais (ids iguais aos de src/content/lessons.ts). Concluir todas é uma das etapas do Profissional de Ouro.';
comment on column public.professionals.lessons_done_at is 'Quando concluiu todas as aulas da Rezolveaê (etapa do Profissional de Ouro; sozinha, dá um empurrão na lista).';

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
    where ps.professional_id = p_pro and ps.service_id = p_service and ps.approved_at is not null and p.verified
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
    where ps.professional_id = p_pro and ps.approved_at is not null and p.verified
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

-- Quem só esperava as aulas fica liberado agora (e recebe o aviso).
select private.refresh_release(p.id)
from public.professionals p
where p.released_at is null;

-- -----------------------------------------------------------------------------
-- 2. Perguntas das aulas no servidor
-- -----------------------------------------------------------------------------

alter table public.lessons
  add column pass integer not null default 7 check (pass > 0),
  add column retry_days integer not null default 3 check (retry_days >= 0);

comment on column public.lessons.pass is 'Acertos para concluir a aula.';
comment on column public.lessons.retry_days is 'Dias de espera para responder de novo depois de não passar.';

-- Mantidas em supabase/lessons/questions.json → supabase/quiz.sql. A primeira alternativa é a certa.
create table private.lesson_questions (
  id text primary key,
  lesson_id text not null references public.lessons (id) on delete cascade,
  sort_order integer not null default 0,
  question text not null,
  options text[] not null check (cardinality(options) between 2 and 6),
  why text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index lesson_questions_lesson_idx on private.lesson_questions (lesson_id) where active;

create table private.lesson_attempts (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  lesson_id text not null references public.lessons (id) on delete cascade,
  question_ids text[] not null,
  -- orders[i][j] = qual alternativa original aparece na posição j da questão i (0 = a certa).
  orders jsonb not null,
  answers smallint[],
  score integer,
  passed boolean,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index lesson_attempts_pro_idx on private.lesson_attempts (professional_id, lesson_id, started_at desc);

-- Conta excluída: as tentativas vão junto (como as do teste).
create or replace function private.drop_quiz_attempts_of_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from private.quiz_attempts where professional_id = new.id;
    delete from private.lesson_attempts where professional_id = new.id;
  end if;
  return null;
end;
$$;

-- A partir de quando pode responder de novo (null: pode agora, ou já concluiu).
create function private.lesson_retry_at(p_pro uuid, p_lesson text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when not a.passed and a.finished_at + make_interval(days => l.retry_days) > now()
    then a.finished_at + make_interval(days => l.retry_days) end
  from private.lesson_attempts a
  join public.lessons l on l.id = a.lesson_id
  where a.professional_id = p_pro and a.lesson_id = p_lesson and a.finished_at is not null
  order by a.finished_at desc
  limit 1
$$;

revoke all on function private.lesson_retry_at(uuid, text) from public, anon, authenticated;

-- Situação de cada aula: concluída, e até quando espera para responder de novo.
create function public.lesson_status()
returns table (lesson_id text, completed_at timestamptz, retry_at timestamptz)
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
  return query
  select l.id, lp.completed_at, private.lesson_retry_at(v_uid, l.id)
  from public.lessons l
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.professional_id = v_uid
  where l.active
  order by l.sort_order;
end;
$$;

-- Perguntas de uma tentativa, na ordem e com as alternativas embaralhadas (sem dizer qual é a certa).
create function private.lesson_attempt_payload(p_attempt uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'attempt_id', a.id,
    'lesson_id', a.lesson_id,
    'total', cardinality(a.question_ids),
    'pass', l.pass,
    'questions', (
      select jsonb_agg(
        jsonb_build_object(
          'question', q.question,
          'options', (
            select jsonb_agg(q.options[(ord.value)::int + 1] order by ord.idx)
            from jsonb_array_elements_text(a.orders -> (qi.n - 1)::int) with ordinality as ord (value, idx)
          )
        )
        order by qi.n
      )
      from unnest(a.question_ids) with ordinality as qi (id, n)
      join private.lesson_questions q on q.id = qi.id
    )
  )
  from private.lesson_attempts a
  join public.lessons l on l.id = a.lesson_id
  where a.id = p_attempt
$$;

revoke all on function private.lesson_attempt_payload(uuid) from public, anon, authenticated;

create function public.start_lesson_quiz(p_lesson_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_open uuid;
  v_retry timestamptz;
  v_ids text[];
  v_orders jsonb;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  if not exists (select 1 from public.professionals where id = v_uid) then
    raise exception 'Só profissionais fazem as aulas' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.lessons where id = p_lesson_id and active)
    or not exists (select 1 from private.lesson_questions where lesson_id = p_lesson_id and active) then
    raise exception 'Aula não encontrada' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.lesson_progress where professional_id = v_uid and lesson_id = p_lesson_id) then
    raise exception 'Você já concluiu esta aula' using errcode = 'P0001';
  end if;

  -- Saiu no meio e voltou: as mesmas perguntas, na mesma ordem.
  select id into v_open from private.lesson_attempts
  where professional_id = v_uid and lesson_id = p_lesson_id and finished_at is null
  order by started_at desc limit 1;
  if v_open is not null then
    return private.lesson_attempt_payload(v_open);
  end if;

  v_retry := private.lesson_retry_at(v_uid, p_lesson_id);
  if v_retry is not null then
    raise exception 'Você pode responder de novo a partir de %', to_char(v_retry at time zone 'America/Sao_Paulo', 'DD/MM')
      using errcode = 'P0001';
  end if;

  select array_agg(id order by random()) into v_ids
  from private.lesson_questions where lesson_id = p_lesson_id and active;

  select jsonb_agg((
    select jsonb_agg(i order by random())
    from generate_series(0, cardinality(q.options) - 1) i
  ) order by n) into v_orders
  from unnest(v_ids) with ordinality as u (id, n)
  join private.lesson_questions q on q.id = u.id;

  insert into private.lesson_attempts (professional_id, lesson_id, question_ids, orders)
  values (v_uid, p_lesson_id, v_ids, v_orders)
  returning id into v_id;

  return private.lesson_attempt_payload(v_id);
end;
$$;

-- Corrige. Passou: conclui a aula; se foi a última, confere se virou Profissional de Ouro.
-- Não passou: diz quais perguntas errou (posições na tentativa), sem dizer a resposta.
create function public.submit_lesson_quiz(p_attempt_id uuid, p_answers integer[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt private.lesson_attempts;
  v_pass integer;
  v_total integer;
  v_score integer := 0;
  v_wrong integer[] := '{}';
  v_passed boolean;
  v_done integer;
  v_lessons integer;
  v_gold boolean := false;
  i integer;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  select * into v_attempt from private.lesson_attempts where id = p_attempt_id and professional_id = v_uid for update;
  if not found then
    raise exception 'Perguntas não encontradas' using errcode = 'P0002';
  end if;
  if v_attempt.finished_at is not null then
    raise exception 'Estas respostas já foram enviadas' using errcode = 'P0001';
  end if;

  v_total := cardinality(v_attempt.question_ids);
  if coalesce(cardinality(p_answers), 0) <> v_total then
    raise exception 'Responda todas as perguntas' using errcode = '22023';
  end if;

  for i in 1..v_total loop
    if p_answers[i] >= 0 and p_answers[i] < jsonb_array_length(v_attempt.orders -> (i - 1))
      and (v_attempt.orders -> (i - 1) ->> p_answers[i])::int = 0 then
      v_score := v_score + 1;
    else
      v_wrong := v_wrong || (i - 1);
    end if;
  end loop;

  select pass into v_pass from public.lessons where id = v_attempt.lesson_id;
  v_passed := v_score >= least(v_pass, v_total);

  update private.lesson_attempts
  set answers = p_answers::smallint[], score = v_score, passed = v_passed, finished_at = now()
  where id = p_attempt_id;

  if v_passed then
    insert into public.lesson_progress (professional_id, lesson_id) values (v_uid, v_attempt.lesson_id)
    on conflict do nothing;
  end if;

  select count(*) filter (where lp.lesson_id is not null), count(*) into v_done, v_lessons
  from public.lessons l
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.professional_id = v_uid
  where l.active;

  if v_passed and v_done = v_lessons then
    update public.professionals set lessons_done_at = now() where id = v_uid and lessons_done_at is null;
    v_gold := private.refresh_gold(v_uid);
  end if;

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'pass', least(v_pass, v_total),
    'passed', v_passed,
    'wrong', to_jsonb(case when v_passed then '{}'::integer[] else v_wrong end),
    'retry_at', case when v_passed then null else private.lesson_retry_at(v_uid, v_attempt.lesson_id) end,
    'done', v_done,
    'lessons', v_lessons,
    'gold', v_gold
  );
end;
$$;

drop function public.complete_lesson(text);

revoke all on function public.lesson_status() from public, anon;
revoke all on function public.start_lesson_quiz(text) from public, anon;
revoke all on function public.submit_lesson_quiz(uuid, integer[]) from public, anon;
grant execute on function public.lesson_status() to authenticated;
grant execute on function public.start_lesson_quiz(text) to authenticated;
grant execute on function public.submit_lesson_quiz(uuid, integer[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Profissional de Ouro
-- -----------------------------------------------------------------------------

alter table public.reviews add column on_time boolean;
comment on column public.reviews.on_time is 'Resposta do cliente a "Chegou no horário combinado?" (null nas avaliações antigas).';

alter table public.professionals add column gold_at timestamptz;
comment on column public.professionals.gold_at is 'Desde quando é Profissional de Ouro (null: não é, ou perdeu). Mantido por private.refresh_gold.';
grant select (gold_at) on public.professionals to anon, authenticated;

-- Cada etapa, com o número de agora e o exigido. `gold`: cumpre todas.
create function private.gold_check(p_pro uuid)
returns table (
  lessons_done boolean,
  jobs_done integer,
  jobs_needed integer,
  rating numeric,
  reviews integer,
  rating_needed numeric,
  reviews_needed integer,
  on_time_yes integer,
  on_time_answers integer,
  on_time_needed numeric,
  orders_90d integer,
  late_90d integer,
  late_max numeric,
  gold boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select
      coalesce((select p.lessons_done_at is not null from public.professionals p where p.id = p_pro), false) as lessons_done,
      (select count(*)::integer from public.orders o where o.professional_id = p_pro and o.status = 'concluido') as jobs_done,
      (select round(avg(v.rating)::numeric, 2) from public.reviews v where v.professional_id = p_pro) as rating,
      (select count(*)::integer from public.reviews v where v.professional_id = p_pro) as reviews,
      (select count(*) filter (where v.on_time)::integer from public.reviews v where v.professional_id = p_pro) as on_time_yes,
      (select count(v.on_time)::integer from public.reviews v where v.professional_id = p_pro) as on_time_answers,
      rel.orders_90d,
      rel.late_cancels_90d as late_90d
    from public.professional_reliability(p_pro) rel
  )
  select
    r.lessons_done, r.jobs_done, 10,
    coalesce(r.rating, 0), r.reviews, 4.7, 5,
    r.on_time_yes, r.on_time_answers, 0.9,
    r.orders_90d, r.late_90d, 0.05,
    r.lessons_done
      and r.jobs_done >= 10
      and r.reviews >= 5 and coalesce(r.rating, 0) >= 4.7
      and r.on_time_answers >= 5 and r.on_time_yes >= 0.9 * r.on_time_answers
      and (r.orders_90d = 0 or r.late_90d < 0.05 * r.orders_90d)
  from r
$$;

revoke all on function private.gold_check(uuid) from public, anon, authenticated;

-- Dá ou tira a marca conforme as etapas, e avisa nas duas direções. Devolve true se virou Ouro agora.
create function private.refresh_gold(p_pro uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was timestamptz;
  v_gold boolean;
begin
  select gold_at into v_was from public.professionals where id = p_pro;
  if not found then
    return false;
  end if;
  select c.gold into v_gold from private.gold_check(p_pro) c;
  if v_gold and v_was is null then
    update public.professionals set gold_at = now() where id = p_pro;
    perform private.push_to_user(p_pro, 'Você é Profissional de Ouro', 'Os clientes já veem a marca no seu perfil, e você aparece mais acima na lista.', '/inicio');
    return true;
  elsif not v_gold and v_was is not null then
    update public.professionals set gold_at = null where id = p_pro;
    perform private.push_to_user(p_pro, 'A marca Profissional de Ouro saiu do seu perfil', 'Veja no Início o que falta para ela voltar.', '/inicio');
  end if;
  return false;
end;
$$;

revoke all on function private.refresh_gold(uuid) from public, anon, authenticated;

-- Avaliação nova, serviço concluído ou cancelado: confere a marca na hora.
create function private.gold_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_gold(new.professional_id);
  return null;
end;
$$;

revoke all on function private.gold_on_change() from public, anon, authenticated;

create trigger reviews_gold after insert on public.reviews
  for each row execute function private.gold_on_change();

create trigger orders_gold after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function private.gold_on_change();

-- A janela de 90 dias anda sozinha: confere todo dia quem tem a marca ou já fez as aulas (12h em Brasília).
create function private.refresh_all_gold()
returns void
language sql
security definer
set search_path = ''
as $$
  select private.refresh_gold(p.id) from public.professionals p
  where p.gold_at is not null or p.lessons_done_at is not null
$$;

revoke all on function private.refresh_all_gold() from public, anon, authenticated;

select cron.schedule('profissional-de-ouro', '0 15 * * *', 'select private.refresh_all_gold()');

-- O caminho até a marca, para o painel do profissional.
create function public.gold_progress()
returns table (
  lessons_done boolean,
  jobs_done integer,
  jobs_needed integer,
  rating numeric,
  reviews integer,
  rating_needed numeric,
  reviews_needed integer,
  on_time_yes integer,
  on_time_answers integer,
  on_time_needed numeric,
  orders_90d integer,
  late_90d integer,
  late_max numeric,
  gold boolean
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
  if not exists (select 1 from public.professionals where id = v_uid) then
    raise exception 'Só para profissionais' using errcode = 'P0001';
  end if;
  return query select * from private.gold_check(v_uid);
end;
$$;

revoke all on function public.gold_progress() from public, anon;
grant execute on function public.gold_progress() to authenticated;

-- Avaliação com a pergunta de pontualidade.
drop function public.rate_order(uuid, integer, text);

create function public.rate_order(p_order_id uuid, p_rating integer, p_comment text default null, p_on_time boolean default null)
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

  insert into public.reviews (order_id, client_id, professional_id, rating, comment, on_time)
  values (p_order_id, v_uid, v_order.professional_id, p_rating, nullif(btrim(p_comment), ''), p_on_time)
  returning * into v_review;

  return v_review;
end;
$$;

revoke execute on function public.rate_order(uuid, integer, text, boolean) from public, anon;
grant execute on function public.rate_order(uuid, integer, text, boolean) to authenticated;
