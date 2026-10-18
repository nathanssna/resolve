-- Nome da área do teste ("Elétrica", "Câmeras de segurança"), usado no selo "Aprovado em …".
alter table public.quiz_tests add column label text not null default '';

comment on column public.quiz_tests.label is 'Nome da área no selo do perfil: "Aprovado em <label>".';

drop function public.quiz_status();

create function public.quiz_status()
returns table (
  service_id text,
  title text,
  label text,
  draw integer,
  pass integer,
  minutes integer,
  retry_days integer,
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
    coalesce(nullif(t.label, ''), s.title),
    t.draw,
    t.pass,
    t.minutes,
    t.retry_days,
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

revoke all on function public.quiz_status() from public, anon;
grant execute on function public.quiz_status() to authenticated;
